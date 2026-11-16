import {
  createInMemoryRemoteAdapter,
  createSupabaseRemoteAdapter,
  createVaultDatabase,
  createVaultStore,
  createVaultSupabaseClient,
  type DecryptedVaultItem,
  type VaultStoreState,
} from '@vault/core';
import { useStore } from 'zustand';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseClient = isSupabaseConfigured
  ? createVaultSupabaseClient({ url: supabaseUrl!, anonKey: supabaseAnonKey! })
  : null;

export const remoteAdapter = supabaseClient
  ? createSupabaseRemoteAdapter(supabaseClient)
  : createInMemoryRemoteAdapter();

export const pwaDb = createVaultDatabase('obsidian-vault-pwa');

export const vaultStore = createVaultStore({
  db: pwaDb,
  remote: remoteAdapter,
});

export function useVault<T>(selector: (state: VaultStoreState) => T): T {
  return useStore(vaultStore, selector);
}

const PREFS_KEY = 'obsidian_vault_ui_prefs_v1';

export interface UiPreferences {
  lastUserId: string | null;
  aliasLabel: string | null;
  autoLockSeconds: number; // 0 = immediate on hide/blur, 60 = 1m, 120 = 2m, 300 = 5m
  isDemoMode: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  listWidth: number;
}

const DEFAULT_PREFS: UiPreferences = {
  lastUserId: null,
  aliasLabel: null,
  autoLockSeconds: 120,
  isDemoMode: false,
  sidebarCollapsed: false,
  sidebarWidth: 240,
  listWidth: 360,
};

export function loadUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UiPreferences>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveUiPreferences(next: Partial<UiPreferences>): UiPreferences {
  const merged = { ...loadUiPreferences(), ...next };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage quota restrictions
  }
  return merged;
}

/** Extract the primary quick-copy secret for any item row. */
export function getPrimarySecret(item: DecryptedVaultItem): { label: string; value: string } {
  switch (item.category) {
    case 'login':
      return { label: 'Password', value: item.password };
    case 'pin':
      return item.pinCode
        ? { label: 'PIN', value: item.pinCode }
        : { label: 'Passcode', value: item.passcode ?? '' };
    case 'card':
      return { label: 'Card Number', value: item.cardNumber };
    case 'note':
      return { label: 'Note', value: item.content };
  }
}

/** Extract secondary subtitle text shown under the item title in lists. */
export function getItemSubtitle(item: DecryptedVaultItem): string {
  switch (item.category) {
    case 'login':
      return item.email || item.username || item.accountId || item.urls[0] || 'Login credential';
    case 'pin':
      return item.associatedAccount || 'PIN / Passcode';
    case 'card': {
      const last4 = item.cardNumber.replace(/\s+/g, '').slice(-4);
      return `${item.brand || 'Card'} •••• ${last4 || '••••'}`;
    }
    case 'note':
      return item.accountId
        ? item.accountId
        : item.recoveryCodes?.length
          ? `${item.recoveryCodes.length} recovery codes`
          : 'Secure note';
  }
}
