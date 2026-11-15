import { createStore } from 'zustand/vanilla';
import {
  VaultCryptoError,
  createDefaultKdfParams,
  deriveMasterKey,
  generateVek,
  unwrapVek,
  wrapVek,
  zeroize,
  type KdfAlgorithm,
  type KdfParams,
} from '@vault/crypto';
import { decryptActiveVaultRows, encryptVaultItem } from '../crypto/itemSerializer.js';
import {
  MAX_PIN_ATTEMPTS,
  attemptBiometricUnwrap,
  attemptPinUnwrap,
  getOrInitDeviceKeyRecord,
  getVaultDb,
  saveBiometricWrappedVek,
  savePinWrappedVek,
  type PinUnwrapResult,
  type VaultLocalDatabase,
} from '../db/dexie.js';
import {
  queueLocalSoftDelete,
  queueLocalUpsert,
  runDeltaSync,
  type DeltaSyncResult,
} from '../sync/deltaSync.js';
import { createInMemoryRemoteAdapter, type RemoteVaultAdapter } from '../sync/supabaseClient.js';
import type { DecryptedVaultItem, VaultLockState, VaultProfileRow } from '../types/vault.js';

export interface VaultStoreState {
  userId: string | null;
  lockState: VaultLockState;
  vek: Uint8Array | null;
  items: DecryptedVaultItem[];
  failedPinAttempts: number;
  maxPinAttempts: number;
  hasPinConfigured: boolean;
  hasBiometricsConfigured: boolean;
  lastSyncAt: string | null;
  isSyncing: boolean;
  lastError: string | null;

  hydrateSession: (userId: string) => Promise<void>;
  initializeNewVault: (
    userId: string,
    masterPassword: string,
    kdfAlgorithm?: KdfAlgorithm
  ) => Promise<VaultProfileRow>;
  unlockWithMasterPassword: (userId: string, masterPassword: string) => Promise<void>;
  enableQuickPin: (pin: string, kdfMemoryKiB?: number) => Promise<void>;
  unlockWithPin: (pin: string, kdfMemoryKiB?: number) => Promise<PinUnwrapResult>;
  enableBiometricUnlock: (prfSecret: Uint8Array, credentialId?: string) => Promise<void>;
  unlockWithBiometrics: (prfSecret: Uint8Array) => Promise<void>;
  lockVault: () => void;
  signOut: () => Promise<void>;
  saveItem: (item: DecryptedVaultItem) => Promise<DecryptedVaultItem>;
  softDeleteItem: (itemId: string) => Promise<void>;
  syncNow: () => Promise<DeltaSyncResult | null>;
}

export interface VaultStoreDeps {
  db?: VaultLocalDatabase;
  remote?: RemoteVaultAdapter;
}

export function createVaultStore(deps: VaultStoreDeps = {}) {
  const resolveDb = () => deps.db ?? getVaultDb();
  const resolveRemote = () => deps.remote ?? createInMemoryRemoteAdapter();
  let remoteInstance: RemoteVaultAdapter | null = deps.remote ?? null;
  const getRemote = () => {
    if (!remoteInstance) {
      remoteInstance = resolveRemote();
    }
    return remoteInstance;
  };

  async function loadAndDecryptItems(
    db: VaultLocalDatabase,
    userId: string,
    vek: Uint8Array
  ): Promise<DecryptedVaultItem[]> {
    const rows = await db.items.where('user_id').equals(userId).toArray();
    return decryptActiveVaultRows(rows, vek);
  }

  let activeSyncPromise: Promise<DeltaSyncResult | null> | null = null;
  let followUpSyncNeeded = false;

  return createStore<VaultStoreState>((set, get) => ({
    userId: null,
    lockState: 'unauthenticated',
    vek: null,
    items: [],
    failedPinAttempts: 0,
    maxPinAttempts: MAX_PIN_ATTEMPTS,
    hasPinConfigured: false,
    hasBiometricsConfigured: false,
    lastSyncAt: null,
    isSyncing: false,
    lastError: null,

    async hydrateSession(userId: string) {
      const db = resolveDb();
      const deviceKeys = await getOrInitDeviceKeyRecord(db, userId);
      const hasPinConfigured = Boolean(
        deviceKeys.pinWrappedVek && deviceKeys.pinIv && deviceKeys.pinSalt
      );
      const hasBiometricsConfigured = Boolean(deviceKeys.bioWrappedVek && deviceKeys.bioIv);

      set({
        userId,
        lockState:
          hasPinConfigured || hasBiometricsConfigured ? 'locked' : 'master_password_required',
        failedPinAttempts: deviceKeys.failedPinAttempts,
        hasPinConfigured,
        hasBiometricsConfigured,
        lastSyncAt: deviceKeys.lastSyncAt,
        lastError: null,
      });
    },

    async initializeNewVault(
      userId: string,
      masterPassword: string,
      kdfAlgorithm: KdfAlgorithm = 'argon2id'
    ) {
      const db = resolveDb();
      const remote = getRemote();
      const kdfParams = createDefaultKdfParams(kdfAlgorithm);
      const masterKey = await deriveMasterKey(masterPassword, kdfParams);
      const vek = generateVek();

      try {
        const { encryptedVek, vekIv } = await wrapVek(vek, masterKey);
        const nowIso = new Date().toISOString();
        const profile: VaultProfileRow = {
          user_id: userId,
          kdf_algorithm: kdfParams.algorithm,
          kdf_salt: kdfParams.salt,
          kdf_iterations: kdfParams.iterations,
          kdf_memory: kdfParams.memory,
          kdf_parallelism: kdfParams.parallelism,
          encrypted_vek: encryptedVek,
          vek_iv: vekIv,
          created_at: nowIso,
          updated_at: nowIso,
        };

        const savedProfile = await remote.upsertProfile(profile);
        await db.profiles.put(savedProfile);
        const deviceKeys = await getOrInitDeviceKeyRecord(db, userId);

        set({
          userId,
          lockState: 'unlocked',
          vek,
          items: [],
          failedPinAttempts: deviceKeys.failedPinAttempts,
          hasPinConfigured: Boolean(deviceKeys.pinWrappedVek),
          hasBiometricsConfigured: Boolean(deviceKeys.bioWrappedVek),
          lastSyncAt: deviceKeys.lastSyncAt,
          lastError: null,
        });

        return savedProfile;
      } catch (error) {
        zeroize(vek);
        throw error;
      } finally {
        zeroize(masterKey);
      }
    },

    async unlockWithMasterPassword(userId: string, masterPassword: string) {
      const db = resolveDb();
      const remote = getRemote();

      let profile = await db.profiles.get(userId);
      if (!profile) {
        profile = (await remote.getProfile(userId)) ?? undefined;
        if (!profile) {
          throw new VaultCryptoError('Vault profile does not exist for this user');
        }
        await db.profiles.put(profile);
      }

      const kdfParams: KdfParams = {
        algorithm: profile.kdf_algorithm,
        salt: profile.kdf_salt,
        iterations: profile.kdf_iterations,
        memory: profile.kdf_memory,
        parallelism: profile.kdf_parallelism,
      };

      const masterKey = await deriveMasterKey(masterPassword, kdfParams);
      let vek: Uint8Array | null = null;

      try {
        vek = await unwrapVek(profile.encrypted_vek, profile.vek_iv, masterKey);
        const items = await loadAndDecryptItems(db, userId, vek);
        const deviceKeys = await getOrInitDeviceKeyRecord(db, userId);

        set({
          userId,
          lockState: 'unlocked',
          vek,
          items,
          failedPinAttempts: deviceKeys.failedPinAttempts,
          hasPinConfigured: Boolean(deviceKeys.pinWrappedVek),
          hasBiometricsConfigured: Boolean(deviceKeys.bioWrappedVek),
          lastSyncAt: deviceKeys.lastSyncAt,
          lastError: null,
        });
      } catch (error) {
        zeroize(vek);
        throw error;
      } finally {
        zeroize(masterKey);
      }

      // Trigger best-effort background sync after unlocking without blocking offline use
      await get()
        .syncNow()
        .catch((err) => {
          set({ lastError: err instanceof Error ? err.message : 'Sync failed' });
        });
    },

    async enableQuickPin(pin: string, kdfMemoryKiB?: number) {
      const { userId, vek } = get();
      if (!userId || !vek) {
        throw new VaultCryptoError('Vault must be unlocked before configuring a PIN');
      }
      const db = resolveDb();
      await savePinWrappedVek(db, userId, pin, vek, kdfMemoryKiB);
      set({ hasPinConfigured: true, failedPinAttempts: 0, lastError: null });
    },

    async unlockWithPin(pin: string, kdfMemoryKiB?: number) {
      const { userId } = get();
      if (!userId) {
        throw new VaultCryptoError('No authenticated user session');
      }
      const db = resolveDb();
      const result = await attemptPinUnwrap(db, userId, pin, kdfMemoryKiB);

      if (result.status === 'unlocked') {
        const items = await loadAndDecryptItems(db, userId, result.vek);
        const deviceKeys = await getOrInitDeviceKeyRecord(db, userId);
        set({
          lockState: 'unlocked',
          vek: result.vek,
          items,
          failedPinAttempts: 0,
          lastSyncAt: deviceKeys.lastSyncAt,
          lastError: null,
        });

        await get()
          .syncNow()
          .catch((err) => {
            set({ lastError: err instanceof Error ? err.message : 'Sync failed' });
          });

        return result;
      }

      if (result.status === 'wiped') {
        set({
          lockState: 'master_password_required',
          failedPinAttempts: 0,
          hasPinConfigured: false,
          hasBiometricsConfigured: false,
          lastError: 'Too many failed PIN attempts. Local unlock keys were wiped.',
        });
        return result;
      }

      if (result.status === 'invalid_pin') {
        set({
          failedPinAttempts: MAX_PIN_ATTEMPTS - result.attemptsRemaining,
          lastError: `Invalid PIN. ${result.attemptsRemaining} attempts remaining.`,
        });
      }

      return result;
    },

    async enableBiometricUnlock(prfSecret: Uint8Array, credentialId?: string) {
      const { userId, vek } = get();
      if (!userId || !vek) {
        throw new VaultCryptoError('Vault must be unlocked before enabling biometrics');
      }
      const db = resolveDb();
      await saveBiometricWrappedVek(db, userId, prfSecret, vek, credentialId);
      set({ hasBiometricsConfigured: true, lastError: null });
    },

    async unlockWithBiometrics(prfSecret: Uint8Array) {
      const { userId } = get();
      if (!userId) {
        throw new VaultCryptoError('No authenticated user session');
      }
      const db = resolveDb();
      const vek = await attemptBiometricUnwrap(db, userId, prfSecret);
      try {
        const items = await loadAndDecryptItems(db, userId, vek);
        const deviceKeys = await getOrInitDeviceKeyRecord(db, userId);
        set({
          lockState: 'unlocked',
          vek,
          items,
          failedPinAttempts: 0,
          lastSyncAt: deviceKeys.lastSyncAt,
          lastError: null,
        });
      } catch (error) {
        zeroize(vek);
        throw error;
      }

      await get()
        .syncNow()
        .catch((err) => {
          set({ lastError: err instanceof Error ? err.message : 'Sync failed' });
        });
    },

    lockVault() {
      const { vek, hasPinConfigured, hasBiometricsConfigured, userId } = get();
      zeroize(vek);

      const nextState: VaultLockState = !userId
        ? 'unauthenticated'
        : hasPinConfigured || hasBiometricsConfigured
          ? 'locked'
          : 'master_password_required';

      set({
        vek: null,
        items: [],
        lockState: nextState,
      });
    },

    async signOut() {
      const { vek } = get();
      zeroize(vek);
      set({
        userId: null,
        lockState: 'unauthenticated',
        vek: null,
        items: [],
        failedPinAttempts: 0,
        hasPinConfigured: false,
        hasBiometricsConfigured: false,
        lastSyncAt: null,
        isSyncing: false,
        lastError: null,
      });
    },

    async saveItem(item: DecryptedVaultItem) {
      const { userId, vek } = get();
      if (!userId || !vek) {
        throw new VaultCryptoError('Cannot save item while vault is locked');
      }

      const db = resolveDb();
      const existing = await db.items.get(item.id);
      const encryptedRow = await encryptVaultItem(
        item,
        userId,
        vek,
        existing?.version ?? 1,
        null
      );

      await queueLocalUpsert(db, encryptedRow);

      set((state) => {
        const filtered = state.items.filter((entry) => entry.id !== item.id);
        return {
          items: [item, ...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        };
      });

      void get()
        .syncNow()
        .catch(() => {});

      return item;
    },

    async softDeleteItem(itemId: string) {
      const { userId, vek } = get();
      if (!userId || !vek) {
        throw new VaultCryptoError('Cannot delete item while vault is locked');
      }

      const db = resolveDb();
      await queueLocalSoftDelete(db, itemId, userId);

      set((state) => ({
        items: state.items.filter((entry) => entry.id !== itemId),
      }));

      void get()
        .syncNow()
        .catch(() => {});
    },

    async syncNow() {
      if (activeSyncPromise) {
        followUpSyncNeeded = true;
        return activeSyncPromise;
      }

      const { userId, vek } = get();
      if (!userId) {
        return null;
      }

      const db = resolveDb();
      const remote = getRemote();
      set({ isSyncing: true, lastError: null });

      activeSyncPromise = (async () => {
        try {
          let result: DeltaSyncResult;
          do {
            followUpSyncNeeded = false;
            result = await runDeltaSync({ db, remote, userId, vek });
          } while (followUpSyncNeeded);

          if (vek) {
            const refreshedItems = await loadAndDecryptItems(db, userId, vek);
            set({
              items: refreshedItems,
              lastSyncAt: result.lastSyncAt,
              isSyncing: false,
            });
          } else {
            set({
              lastSyncAt: result.lastSyncAt,
              isSyncing: false,
            });
          }
          return result;
        } catch (error) {
          set({
            isSyncing: false,
            lastError: error instanceof Error ? error.message : 'Sync failed',
          });
          throw error;
        }
      })().finally(() => {
        followUpSyncNeeded = false;
        activeSyncPromise = null;
      });

      return activeSyncPromise;
    },
  }));
}

export const useVaultStore = createVaultStore();
