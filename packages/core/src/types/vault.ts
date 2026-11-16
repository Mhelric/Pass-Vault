import type { KdfAlgorithm } from '@vault/crypto';

export type VaultCategory = 'login' | 'pin' | 'card' | 'note';

export type PinType =
  | 'bank_atm'
  | 'device_phone'
  | 'sim_puk'
  | 'door_alarm'
  | 'gov_work_id'
  | 'other';

export interface PasswordHistoryEntry {
  password: string;
  changedAt: string; // ISO-8601
}

export interface VaultItemBase {
  id: string; // UUID v4
  category: VaultCategory;
  title: string;
  isFavorite: boolean;
  tags: string[];
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface LoginItem extends VaultItemBase {
  category: 'login';
  username?: string;
  email?: string;
  accountId?: string;
  password: string;
  urls: string[];
  notes?: string;
  passwordHistory: PasswordHistoryEntry[];
}

export interface PinItem extends VaultItemBase {
  category: 'pin';
  pinCode: string; // String preserves leading zeros (e.g., "0482")
  pinType: PinType;
  associatedAccount?: string;
  notes?: string;
}

export interface CardItem extends VaultItemBase {
  category: 'card';
  cardholderName: string;
  cardNumber: string;
  brand?: string;
  expiryMonth: string; // "01" - "12"
  expiryYear: string;  // "2028"
  cvv: string;
  cardPin?: string;
  billingZip?: string;
  notes?: string;
}

export interface RecoveryCodeEntry {
  code: string;
  used: boolean;
}

export interface NoteItem extends VaultItemBase {
  category: 'note';
  accountId?: string;
  content: string;
  recoveryCodes?: RecoveryCodeEntry[];
}

export type DecryptedVaultItem = LoginItem | PinItem | CardItem | NoteItem;

/** Public KDF metadata and Master-Key-wrapped VEK stored in Supabase vault_profiles. */
export interface VaultProfileRow {
  user_id: string;
  kdf_algorithm: KdfAlgorithm;
  kdf_salt: string;
  kdf_iterations: number;
  kdf_memory: number;
  kdf_parallelism: number;
  encrypted_vek: string;
  vek_iv: string;
  created_at: string;
  updated_at: string;
}

/** Zero-knowledge encrypted vault record stored in IndexedDB and Supabase vault_items. */
export interface EncryptedVaultRow {
  id: string;
  user_id: string;
  encrypted_payload: string;
  iv: string;
  version: number;
  is_favorite: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SyncMutationType = 'upsert' | 'delete';

export interface SyncQueueEntry {
  queueId?: number;
  itemId: string;
  userId: string;
  operation: SyncMutationType;
  expectedVersion: number;
  queuedAt: string;
}

/** Device-local quick-unlock state stored strictly in IndexedDB (never synced). */
export interface LocalDeviceKeyRecord {
  userId: string;
  pinWrappedVek?: string;
  pinIv?: string;
  pinSalt?: string;
  bioWrappedVek?: string;
  bioIv?: string;
  bioCredentialId?: string;
  failedPinAttempts: number;
  lastSyncAt: string | null;
}

export type VaultLockState =
  | 'unauthenticated'
  | 'master_password_required'
  | 'locked'
  | 'unlocked';
