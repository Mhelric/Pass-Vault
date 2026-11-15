import Dexie, { type DexieOptions, type Table } from 'dexie';
import {
  VaultCryptoError,
  unwrapVekWithBiometricSecret,
  unwrapVekWithPin,
  wrapVekWithBiometricSecret,
  wrapVekWithPin,
} from '@vault/crypto';
import type {
  EncryptedVaultRow,
  LocalDeviceKeyRecord,
  SyncQueueEntry,
  VaultProfileRow,
} from '../types/vault.js';

export const MAX_PIN_ATTEMPTS = 5;

export class VaultLocalDatabase extends Dexie {
  profiles!: Table<VaultProfileRow, string>;
  items!: Table<EncryptedVaultRow, string>;
  syncQueue!: Table<SyncQueueEntry, number>;
  deviceKeys!: Table<LocalDeviceKeyRecord, string>;

  constructor(name: string = 'zero-knowledge-vault-db', options?: DexieOptions) {
    super(name, options);

    this.version(1).stores({
      profiles: 'user_id',
      items: 'id, user_id, updated_at, is_favorite, deleted_at',
      syncQueue: '++queueId, &itemId, userId, queuedAt',
      deviceKeys: 'userId',
    });
  }
}

export function createVaultDatabase(
  name: string = 'zero-knowledge-vault-db',
  indexedDBImpl?: IDBFactory,
  idbKeyRangeImpl?: typeof IDBKeyRange
): VaultLocalDatabase {
  const options: DexieOptions | undefined =
    indexedDBImpl || idbKeyRangeImpl
      ? {
          ...(indexedDBImpl ? { indexedDB: indexedDBImpl } : {}),
          ...(idbKeyRangeImpl ? { IDBKeyRange: idbKeyRangeImpl } : {}),
        }
      : undefined;

  return new VaultLocalDatabase(name, options);
}

let defaultDbInstance: VaultLocalDatabase | null = null;

export function getVaultDb(): VaultLocalDatabase {
  if (!defaultDbInstance) {
    defaultDbInstance = createVaultDatabase();
  }
  return defaultDbInstance;
}

export const vaultDb: VaultLocalDatabase =
  typeof globalThis.indexedDB !== 'undefined'
    ? getVaultDb()
    : (undefined as unknown as VaultLocalDatabase);

export async function getOrInitDeviceKeyRecord(
  db: VaultLocalDatabase,
  userId: string
): Promise<LocalDeviceKeyRecord> {
  const existing = await db.deviceKeys.get(userId);
  if (existing) {
    return existing;
  }
  const initial: LocalDeviceKeyRecord = {
    userId,
    failedPinAttempts: 0,
    lastSyncAt: null,
  };
  await db.deviceKeys.put(initial);
  return initial;
}

export async function savePinWrappedVek(
  db: VaultLocalDatabase,
  userId: string,
  pin: string,
  vek: Uint8Array,
  kdfMemoryKiB?: number
): Promise<LocalDeviceKeyRecord> {
  const current = await getOrInitDeviceKeyRecord(db, userId);
  const { pinWrappedVek, pinIv, pinSalt } = await wrapVekWithPin(vek, pin, kdfMemoryKiB);
  const updated: LocalDeviceKeyRecord = {
    ...current,
    pinWrappedVek,
    pinIv,
    pinSalt,
    failedPinAttempts: 0,
  };
  await db.deviceKeys.put(updated);
  return updated;
}

export async function saveBiometricWrappedVek(
  db: VaultLocalDatabase,
  userId: string,
  prfSecret: Uint8Array,
  vek: Uint8Array,
  credentialId?: string
): Promise<LocalDeviceKeyRecord> {
  const current = await getOrInitDeviceKeyRecord(db, userId);
  const { bioWrappedVek, bioIv } = await wrapVekWithBiometricSecret(vek, prfSecret);
  const updated: LocalDeviceKeyRecord = {
    ...current,
    bioWrappedVek,
    bioIv,
    ...(credentialId !== undefined ? { bioCredentialId: credentialId } : {}),
  };
  await db.deviceKeys.put(updated);
  return updated;
}

export async function wipeLocalDeviceKeys(
  db: VaultLocalDatabase,
  userId: string
): Promise<LocalDeviceKeyRecord> {
  const current = await getOrInitDeviceKeyRecord(db, userId);
  const wiped: LocalDeviceKeyRecord = {
    userId: current.userId,
    failedPinAttempts: 0,
    lastSyncAt: current.lastSyncAt,
  };
  await db.deviceKeys.put(wiped);
  return wiped;
}

export type PinUnwrapResult =
  | { status: 'unlocked'; vek: Uint8Array }
  | { status: 'invalid_pin'; attemptsRemaining: number }
  | { status: 'wiped'; attemptsRemaining: 0 }
  | { status: 'not_configured'; attemptsRemaining: 0 };

/**
 * Attempt quick unlock using the local 6-digit PIN.
 * Enforces a strict 5-strike wipe of all locally wrapped keys on brute-force attempts.
 */
export async function attemptPinUnwrap(
  db: VaultLocalDatabase,
  userId: string,
  pin: string,
  kdfMemoryKiB?: number
): Promise<PinUnwrapResult> {
  const record = await getOrInitDeviceKeyRecord(db, userId);
  if (!record.pinWrappedVek || !record.pinIv || !record.pinSalt) {
    return { status: 'not_configured', attemptsRemaining: 0 };
  }

  try {
    const vek = await unwrapVekWithPin(
      record.pinWrappedVek,
      record.pinIv,
      record.pinSalt,
      pin,
      kdfMemoryKiB
    );
    await db.deviceKeys.put({
      ...record,
      failedPinAttempts: 0,
    });
    return { status: 'unlocked', vek };
  } catch (error) {
    if (!(error instanceof VaultCryptoError)) {
      throw error;
    }

    const nextFailures = record.failedPinAttempts + 1;
    if (nextFailures >= MAX_PIN_ATTEMPTS) {
      await wipeLocalDeviceKeys(db, userId);
      return { status: 'wiped', attemptsRemaining: 0 };
    }

    await db.deviceKeys.put({
      ...record,
      failedPinAttempts: nextFailures,
    });
    return {
      status: 'invalid_pin',
      attemptsRemaining: MAX_PIN_ATTEMPTS - nextFailures,
    };
  }
}

export async function attemptBiometricUnwrap(
  db: VaultLocalDatabase,
  userId: string,
  prfSecret: Uint8Array
): Promise<Uint8Array> {
  const record = await db.deviceKeys.get(userId);
  if (!record?.bioWrappedVek || !record.bioIv) {
    throw new VaultCryptoError('Biometric quick-unlock is not configured on this device');
  }
  const vek = await unwrapVekWithBiometricSecret(
    record.bioWrappedVek,
    record.bioIv,
    prfSecret
  );
  if (record.failedPinAttempts > 0) {
    await db.deviceKeys.put({ ...record, failedPinAttempts: 0 });
  }
  return vek;
}
