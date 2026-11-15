import {
  VaultCryptoError,
  deriveMasterKey,
  unwrapVek,
  zeroize,
  type KdfParams,
} from '@vault/crypto';
import { decryptVaultRow } from '../crypto/itemSerializer.js';
import type { VaultLocalDatabase } from '../db/dexie.js';
import { queueLocalUpsert } from '../sync/deltaSync.js';
import type { DecryptedVaultItem, EncryptedVaultRow, VaultProfileRow } from '../types/vault.js';

export type VaultBackupItem = Omit<EncryptedVaultRow, 'user_id'>;

export interface VaultBackupFile {
  formatVersion: 1;
  exportedAt: string;
  kdf: KdfParams;
  encryptedVek: string;
  vekIv: string;
  items: VaultBackupItem[];
}

export interface RestoreBackupResult {
  userId: string;
  restoredCount: number;
  items: DecryptedVaultItem[];
}

/**
 * Build a self-contained encrypted `.vault` backup JSON object from local IndexedDB.
 * All item payloads remain AES-256-GCM encrypted under the wrapped VEK.
 */
export async function exportEncryptedVaultBackup(
  db: VaultLocalDatabase,
  userId: string
): Promise<VaultBackupFile> {
  const profile = await db.profiles.get(userId);
  if (!profile) {
    throw new VaultCryptoError('No vault profile found on this device to export');
  }

  const rows = await db.items.where('user_id').equals(userId).toArray();
  const activeRows = rows.filter((row) => row.deleted_at === null);

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    kdf: {
      algorithm: profile.kdf_algorithm,
      salt: profile.kdf_salt,
      iterations: profile.kdf_iterations,
      memory: profile.kdf_memory,
      parallelism: profile.kdf_parallelism,
    },
    encryptedVek: profile.encrypted_vek,
    vekIv: profile.vek_iv,
    items: activeRows.map(({ user_id: _omit, ...rest }) => rest),
  };
}

export function serializeVaultBackup(backup: VaultBackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * Verify and restore a standalone encrypted `.vault` backup using the Master Password.
 * Throws VaultCryptoError on malformed structure or incorrect Master Password.
 */
export async function restoreEncryptedVaultBackup(params: {
  backupJson: string;
  masterPassword: string;
  db: VaultLocalDatabase;
  targetUserId?: string;
}): Promise<RestoreBackupResult> {
  const { backupJson, masterPassword, db, targetUserId } = params;

  let parsed: unknown;
  try {
    parsed = JSON.parse(backupJson);
  } catch (error) {
    throw new VaultCryptoError('Backup file is not valid JSON', { cause: error });
  }

  const backup = parsed as Partial<VaultBackupFile>;
  if (
    !backup ||
    backup.formatVersion !== 1 ||
    !backup.kdf ||
    !backup.encryptedVek ||
    !backup.vekIv ||
    !Array.isArray(backup.items)
  ) {
    throw new VaultCryptoError('Unsupported or corrupted .vault backup format');
  }

  const masterKey = await deriveMasterKey(masterPassword, backup.kdf);
  let vek: Uint8Array | null = null;

  try {
    vek = await unwrapVek(backup.encryptedVek, backup.vekIv, masterKey);
    const resolvedUserId = targetUserId ?? globalThis.crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const verifiedRows: Array<{ row: EncryptedVaultRow; item: DecryptedVaultItem }> = [];
    for (const entry of backup.items) {
      const fullRow: EncryptedVaultRow = {
        ...entry,
        user_id: resolvedUserId,
      };
      const decrypted = await decryptVaultRow(fullRow, vek);
      if (fullRow.deleted_at === null) {
        verifiedRows.push({ row: fullRow, item: decrypted });
      }
    }

    const profileRow: VaultProfileRow = {
      user_id: resolvedUserId,
      kdf_algorithm: backup.kdf.algorithm,
      kdf_salt: backup.kdf.salt,
      kdf_iterations: backup.kdf.iterations,
      kdf_memory: backup.kdf.memory,
      kdf_parallelism: backup.kdf.parallelism,
      encrypted_vek: backup.encryptedVek,
      vek_iv: backup.vekIv,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await db.profiles.put(profileRow);
    for (const { row } of verifiedRows) {
      await queueLocalUpsert(db, row);
    }

    const items = verifiedRows
      .map((v) => v.item)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return {
      userId: resolvedUserId,
      restoredCount: items.length,
      items,
    };
  } finally {
    zeroize(masterKey, vek);
  }
}
