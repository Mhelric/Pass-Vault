import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { VaultCryptoError } from '@vault/crypto';
import {
  createInMemoryRemoteAdapter,
  createVaultDatabase,
  createVaultStore,
  exportEncryptedVaultBackup,
  restoreEncryptedVaultBackup,
  serializeVaultBackup,
  type LoginItem,
  type PinItem,
} from '../index.js';

describe('@vault/core — Encrypted .vault Backup Export & Restore', () => {
  it('exports a standalone encrypted .vault file, rejects wrong passwords, and restores after DB wipe', async () => {
    const dbSource = createVaultDatabase(`backup-src-${globalThis.crypto.randomUUID()}`);
    const dbTarget = createVaultDatabase(`backup-dst-${globalThis.crypto.randomUUID()}`);
    const remote = createInMemoryRemoteAdapter();
    const store = createVaultStore({ db: dbSource, remote });

    const userId = globalThis.crypto.randomUUID();
    const masterPassword = 'BackupMasterPassword!2026';
    await store.getState().initializeNewVault(userId, masterPassword, 'pbkdf2-sha256');

    const now = '2026-11-15T14:00:00.000Z';
    const login: LoginItem = {
      id: globalThis.crypto.randomUUID(),
      category: 'login',
      title: 'Proton Mail',
      isFavorite: true,
      tags: ['email'],
      email: 'mhelric@proton.me',
      password: 'UltraStrong!Password#99',
      urls: ['https://proton.me'],
      passwordHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    const pin: PinItem = {
      id: globalThis.crypto.randomUUID(),
      category: 'pin',
      title: 'BPI ATM PIN',
      isFavorite: false,
      tags: ['bank'],
      pinCode: '0482',
      pinType: 'bank_atm',
      createdAt: now,
      updatedAt: now,
    };

    await store.getState().saveItem(login);
    await store.getState().saveItem(pin);

    const backup = await exportEncryptedVaultBackup(dbSource, userId);
    const serialized = serializeVaultBackup(backup);

    // Ensure plaintext secrets never appear inside the exported .vault file
    expect(serialized).not.toContain(login.password);
    expect(serialized).not.toContain('0482');
    expect(serialized).not.toContain('Proton Mail');

    // Wrong Master Password must fail integrity verification
    await expect(
      restoreEncryptedVaultBackup({
        backupJson: serialized,
        masterPassword: 'WrongPassword!',
        db: dbTarget,
        targetUserId: userId,
      })
    ).rejects.toThrow(VaultCryptoError);

    // Correct Master Password restores cleanly into an empty database
    const restored = await restoreEncryptedVaultBackup({
      backupJson: serialized,
      masterPassword,
      db: dbTarget,
      targetUserId: userId,
    });

    expect(restored.restoredCount).toBe(2);
    expect(restored.items.map((i) => i.title).sort()).toEqual(['BPI ATM PIN', 'Proton Mail']);
    const restoredRows = await dbTarget.items.toArray();
    expect(restoredRows).toHaveLength(2);
  });
});
