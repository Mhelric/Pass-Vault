import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { VaultCryptoError, generateVek, randomBytes, zeroize } from '@vault/crypto';
import {
  createInMemoryRemoteAdapter,
  createVaultDatabase,
  createVaultStore,
  decryptVaultRow,
  encryptVaultItem,
  queueLocalSoftDelete,
  queueLocalUpsert,
  runDeltaSync,
  type CardItem,
  type DecryptedVaultItem,
  type LoginItem,
  type NoteItem,
  type PinItem,
} from '../index.js';

function makeFreshTestDb() {
  return createVaultDatabase(`vault-test-${globalThis.crypto.randomUUID()}`);
}

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('@vault/core — Item Serializer (All 4 Vault Categories)', () => {
  it('encrypts and decrypts Login, PIN, Card, and Note items with AAD binding', async () => {
    const vek = generateVek();
    const now = '2026-11-15T10:00:00.000Z';

    const items: DecryptedVaultItem[] = [
      {
        id: globalThis.crypto.randomUUID(),
        category: 'login',
        title: 'GitHub Account',
        isFavorite: true,
        tags: ['dev'],
        username: 'mhelric',
        email: 'mhelric+vault@gmail.com',
        password: 'CorrectHorse!Battery99',
        urls: ['https://github.com'],
        notes: 'Main developer account',
        passwordHistory: [{ password: 'OldPassword123!', changedAt: '2025-01-01T00:00:00.000Z' }],
        createdAt: now,
        updatedAt: now,
      } satisfies LoginItem,
      {
        id: globalThis.crypto.randomUUID(),
        category: 'pin',
        title: 'BDO ATM Card PIN',
        isFavorite: true,
        tags: ['bank'],
        pinCode: '0482',
        pinType: 'bank_atm',
        associatedAccount: 'BDO Kabayan Savings',
        notes: 'Branch ATM passcode',
        createdAt: now,
        updatedAt: now,
      } satisfies PinItem,
      {
        id: globalThis.crypto.randomUUID(),
        category: 'card',
        title: 'Primary Visa',
        isFavorite: false,
        tags: ['finance'],
        cardholderName: 'MHELRIC USER',
        cardNumber: '4111111111111111',
        brand: 'Visa',
        expiryMonth: '08',
        expiryYear: '2029',
        cvv: '842',
        cardPin: '9041',
        createdAt: now,
        updatedAt: now,
      } satisfies CardItem,
      {
        id: globalThis.crypto.randomUUID(),
        category: 'note',
        title: 'Google 2FA Backup Codes',
        isFavorite: false,
        tags: ['recovery'],
        content: 'Keep these safe offline.',
        recoveryCodes: [
          { code: '8492-1938', used: false },
          { code: '3301-7721', used: true },
        ],
        createdAt: now,
        updatedAt: now,
      } satisfies NoteItem,
    ];

    for (const item of items) {
      const row = await encryptVaultItem(item, USER_ID, vek);
      expect(row.encrypted_payload).not.toContain(item.title);

      const decrypted = await decryptVaultRow(row, vek);
      expect(decrypted).toEqual(item);

      // Tampering with row ID breaks AAD binding
      await expect(
        decryptVaultRow({ ...row, id: globalThis.crypto.randomUUID() }, vek)
      ).rejects.toThrow(VaultCryptoError);
    }

    zeroize(vek);
  });
});

describe('@vault/core — Offline-First Multi-Device Delta Sync', () => {
  it('syncs creations, edits, and soft-delete tombstones across two devices', async () => {
    const dbDeviceA = makeFreshTestDb();
    const dbDeviceB = makeFreshTestDb();
    const remote = createInMemoryRemoteAdapter();
    const vek = generateVek();

    const itemId = globalThis.crypto.randomUUID();
    const t1 = '2026-11-15T10:00:00.000Z';
    const initialPin: PinItem = {
      id: itemId,
      category: 'pin',
      title: 'Phone Lock Screen',
      isFavorite: false,
      tags: [],
      pinCode: '094128',
      pinType: 'device_phone',
      createdAt: t1,
      updatedAt: t1,
    };

    // Device A creates offline and pushes
    await queueLocalUpsert(dbDeviceA, await encryptVaultItem(initialPin, USER_ID, vek, 1));
    const pushA = await runDeltaSync({ db: dbDeviceA, remote, userId: USER_ID, vek });
    expect(pushA.pushedCount).toBe(1);

    // Device B pulls item
    const pullB = await runDeltaSync({ db: dbDeviceB, remote, userId: USER_ID, vek });
    expect(pullB.pulledCount).toBe(1);
    const syncedOnB = await dbDeviceB.items.get(itemId);
    expect(syncedOnB).toBeDefined();
    expect((await decryptVaultRow(syncedOnB!, vek)) as PinItem).toMatchObject({
      title: 'Phone Lock Screen',
      pinCode: '094128',
    });

    // Device A soft-deletes and pushes tombstone
    const t2 = '2026-11-15T10:05:00.000Z';
    await queueLocalSoftDelete(dbDeviceA, itemId, USER_ID, t2);
    const pushDeleteA = await runDeltaSync({ db: dbDeviceA, remote, userId: USER_ID, vek });
    expect(pushDeleteA.pushedCount).toBe(1);

    // Device B pulls tombstone
    const pullDeleteB = await runDeltaSync({ db: dbDeviceB, remote, userId: USER_ID, vek });
    expect(pullDeleteB.pulledCount).toBe(1);
    const deletedOnB = await dbDeviceB.items.get(itemId);
    expect(deletedOnB?.deleted_at).toBe(t2);

    zeroize(vek);
  });

  it('preserves concurrent edits via a "(Sync Conflict)" item without losing data', async () => {
    const dbDeviceA = makeFreshTestDb();
    const dbDeviceB = makeFreshTestDb();
    const remote = createInMemoryRemoteAdapter();
    const vek = generateVek();

    const itemId = globalThis.crypto.randomUUID();
    const t0 = '2026-11-15T10:00:00.000Z';
    const baseLogin: LoginItem = {
      id: itemId,
      category: 'login',
      title: 'Netflix',
      isFavorite: false,
      tags: [],
      email: 'family@example.com',
      password: 'InitialPassword#1',
      urls: ['https://netflix.com'],
      passwordHistory: [],
      createdAt: t0,
      updatedAt: t0,
    };

    // Seed initial version 1 to remote & both devices
    await queueLocalUpsert(dbDeviceA, await encryptVaultItem(baseLogin, USER_ID, vek, 1));
    await runDeltaSync({ db: dbDeviceA, remote, userId: USER_ID, vek });
    await runDeltaSync({ db: dbDeviceB, remote, userId: USER_ID, vek });

    // Device A edits while offline & syncs first (becomes version 2)
    const editA: LoginItem = {
      ...baseLogin,
      password: 'PasswordFromDeviceA#2',
      updatedAt: '2026-11-15T10:01:00.000Z',
    };
    await queueLocalUpsert(dbDeviceA, await encryptVaultItem(editA, USER_ID, vek, 1));
    await runDeltaSync({ db: dbDeviceA, remote, userId: USER_ID, vek });

    // Device B edits the stale version 1 offline & syncs second -> triggers conflict
    const editB: LoginItem = {
      ...baseLogin,
      password: 'PasswordFromDeviceB#2',
      updatedAt: '2026-11-15T10:02:00.000Z',
    };
    await queueLocalUpsert(dbDeviceB, await encryptVaultItem(editB, USER_ID, vek, 1));
    const syncB = await runDeltaSync({ db: dbDeviceB, remote, userId: USER_ID, vek });

    expect(syncB.conflictCount).toBe(1);

    const allOnB = await dbDeviceB.items.toArray();
    expect(allOnB).toHaveLength(2);
    const decryptedTitles = await Promise.all(allOnB.map((r) => decryptVaultRow(r, vek)));
    expect(decryptedTitles.map((d) => d.title).sort()).toEqual([
      'Netflix',
      'Netflix (Sync Conflict)',
    ]);

    zeroize(vek);
  });
});

describe('@vault/core — Vault Store Lifecycle & 5-Strike PIN Wipe', () => {
  it('handles setup, lock/zeroize, PIN/biometric unlock, 5-strike wipe, and Master Password recovery', async () => {
    const db = makeFreshTestDb();
    const remote = createInMemoryRemoteAdapter();
    const store = createVaultStore({ db, remote });

    const masterPassword = 'MyLongVaultMasterPassword!2026';
    await store.getState().initializeNewVault(USER_ID, masterPassword, 'pbkdf2-sha256');
    expect(store.getState().lockState).toBe('unlocked');

    const now = '2026-11-15T11:00:00.000Z';
    const note: NoteItem = {
      id: globalThis.crypto.randomUUID(),
      category: 'note',
      title: 'Safe Deposit Box',
      isFavorite: false,
      tags: ['home'],
      content: 'Combo 14-28-07',
      createdAt: now,
      updatedAt: now,
    };
    await store.getState().saveItem(note);
    await store.getState().enableQuickPin('048291', 4096);

    const bioSecret = randomBytes(32);
    await store.getState().enableBiometricUnlock(bioSecret, 'cred-1');

    // Keep reference to active VEK buffer to verify RAM zeroization on lock
    const activeVekRef = store.getState().vek!;
    store.getState().lockVault();

    expect(store.getState().lockState).toBe('locked');
    expect(store.getState().vek).toBeNull();
    expect(store.getState().items).toHaveLength(0);
    expect(activeVekRef.every((b) => b === 0)).toBe(true);

    // Quick unlock with valid 6-digit PIN
    const okPin = await store.getState().unlockWithPin('048291', 4096);
    expect(okPin.status).toBe('unlocked');
    expect(store.getState().lockState).toBe('unlocked');
    expect(store.getState().items).toHaveLength(1);

    // Lock and unlock with Biometrics
    store.getState().lockVault();
    await store.getState().unlockWithBiometrics(bioSecret);
    expect(store.getState().lockState).toBe('unlocked');
    expect(store.getState().items[0]?.title).toBe('Safe Deposit Box');

    // Lock and test 5 failed PIN attempts -> local keys wiped
    store.getState().lockVault();
    for (let attempt = 1; attempt <= 4; attempt++) {
      const fail = await store.getState().unlockWithPin('999999', 4096);
      expect(fail).toEqual({ status: 'invalid_pin', attemptsRemaining: 5 - attempt });
      expect(store.getState().lockState).toBe('locked');
    }

    const fifthFail = await store.getState().unlockWithPin('999999', 4096);
    expect(fifthFail).toEqual({ status: 'wiped', attemptsRemaining: 0 });
    expect(store.getState().lockState).toBe('master_password_required');
    expect(store.getState().hasPinConfigured).toBe(false);
    expect(store.getState().hasBiometricsConfigured).toBe(false);

    // Master Password still recovers full vault cleanly
    await store.getState().unlockWithMasterPassword(USER_ID, masterPassword);
    expect(store.getState().lockState).toBe('unlocked');
    expect(store.getState().items).toHaveLength(1);

    zeroize(bioSecret);
    await store.getState().signOut();
  });
});
