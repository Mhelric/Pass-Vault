import { decryptJson, encryptJson } from '@vault/crypto';
import type { DecryptedVaultItem, EncryptedVaultRow } from '../types/vault.js';

/**
 * Encrypt a vault item payload using AES-256-GCM with the item's UUID bound as AAD
 * so ciphertexts cannot be swapped across rows.
 */
export async function encryptVaultItem(
  item: DecryptedVaultItem,
  userId: string,
  vek: Uint8Array,
  version: number = 1,
  deletedAt: string | null = null
): Promise<EncryptedVaultRow> {
  const { encryptedPayload, iv } = await encryptJson(item, vek, item.id);
  return {
    id: item.id,
    user_id: userId,
    encrypted_payload: encryptedPayload,
    iv,
    version,
    is_favorite: item.isFavorite,
    deleted_at: deletedAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

/** Decrypt an encrypted vault row back into a typed DecryptedVaultItem. */
export async function decryptVaultRow(
  row: EncryptedVaultRow,
  vek: Uint8Array
): Promise<DecryptedVaultItem> {
  return decryptJson<DecryptedVaultItem>(row.encrypted_payload, row.iv, vek, row.id);
}

/** Decrypt all non-deleted rows, preserving sort order by updatedAt descending. */
export async function decryptActiveVaultRows(
  rows: EncryptedVaultRow[],
  vek: Uint8Array
): Promise<DecryptedVaultItem[]> {
  const activeRows = rows.filter((row) => row.deleted_at === null);
  const decrypted = await Promise.all(activeRows.map((row) => decryptVaultRow(row, vek)));
  return decrypted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
