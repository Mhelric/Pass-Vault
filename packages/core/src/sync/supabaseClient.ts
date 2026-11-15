import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EncryptedVaultRow, VaultProfileRow } from '../types/vault.js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function createVaultSupabaseClient(config: SupabaseConfig): SupabaseClient {
  if (!config.url || !config.anonKey) {
    throw new Error('Supabase URL and anon key are required');
  }
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/** Remote backend contract so sync engine stays testable and decoupled from transport. */
export interface RemoteVaultAdapter {
  getProfile(userId: string): Promise<VaultProfileRow | null>;
  upsertProfile(profile: VaultProfileRow): Promise<VaultProfileRow>;
  getItemById(userId: string, itemId: string): Promise<EncryptedVaultRow | null>;
  upsertItem(row: EncryptedVaultRow): Promise<EncryptedVaultRow>;
  pullItemsUpdatedSince(userId: string, sinceIso: string | null): Promise<EncryptedVaultRow[]>;
  clearAll?: () => void;
}

export function createSupabaseRemoteAdapter(client: SupabaseClient): RemoteVaultAdapter {
  return {
    async getProfile(userId: string): Promise<VaultProfileRow | null> {
      const { data, error } = await client
        .from('vault_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to fetch vault profile: ${error.message}`);
      }
      return (data as VaultProfileRow | null) ?? null;
    },

    async upsertProfile(profile: VaultProfileRow): Promise<VaultProfileRow> {
      const { data, error } = await client
        .from('vault_profiles')
        .upsert(profile, { onConflict: 'user_id' })
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to upsert vault profile: ${error.message}`);
      }
      return data as VaultProfileRow;
    },

    async getItemById(userId: string, itemId: string): Promise<EncryptedVaultRow | null> {
      const { data, error } = await client
        .from('vault_items')
        .select('*')
        .eq('user_id', userId)
        .eq('id', itemId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to fetch remote vault item: ${error.message}`);
      }
      return (data as EncryptedVaultRow | null) ?? null;
    },

    async upsertItem(row: EncryptedVaultRow): Promise<EncryptedVaultRow> {
      const { data, error } = await client
        .from('vault_items')
        .upsert(row, { onConflict: 'id' })
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to upsert vault item: ${error.message}`);
      }
      return data as EncryptedVaultRow;
    },

    async pullItemsUpdatedSince(
      userId: string,
      sinceIso: string | null
    ): Promise<EncryptedVaultRow[]> {
      let query = client
        .from('vault_items')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: true });

      if (sinceIso) {
        query = query.gte('updated_at', sinceIso);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to pull vault delta: ${error.message}`);
      }
      return (data as EncryptedVaultRow[] | null) ?? [];
    },
  };
}

/**
 * In-memory remote adapter mirroring Supabase RLS isolation (`user_id` scoping)
 * for offline/local preview mode and deterministic multi-device sync tests.
 */
export function createInMemoryRemoteAdapter(): RemoteVaultAdapter {
  const profiles = new Map<string, VaultProfileRow>();
  const items = new Map<string, EncryptedVaultRow>();

  return {
    async getProfile(userId: string): Promise<VaultProfileRow | null> {
      return profiles.get(userId) ?? null;
    },

    async upsertProfile(profile: VaultProfileRow): Promise<VaultProfileRow> {
      const saved: VaultProfileRow = {
        ...profile,
        updated_at: new Date().toISOString(),
      };
      profiles.set(profile.user_id, saved);
      return saved;
    },

    async getItemById(userId: string, itemId: string): Promise<EncryptedVaultRow | null> {
      const row = items.get(itemId);
      if (!row || row.user_id !== userId) {
        return null;
      }
      return { ...row };
    },

    async upsertItem(row: EncryptedVaultRow): Promise<EncryptedVaultRow> {
      const existing = items.get(row.id);
      if (existing && existing.user_id !== row.user_id) {
        throw new Error('RLS violation: cannot modify another user vault item');
      }
      const saved: EncryptedVaultRow = {
        ...row,
        updated_at: row.updated_at || new Date().toISOString(),
      };
      items.set(row.id, saved);
      return { ...saved };
    },

    async pullItemsUpdatedSince(
      userId: string,
      sinceIso: string | null
    ): Promise<EncryptedVaultRow[]> {
      const results: EncryptedVaultRow[] = [];
      for (const row of items.values()) {
        if (row.user_id !== userId) continue;
        if (!sinceIso || row.updated_at >= sinceIso) {
          results.push({ ...row });
        }
      }
      return results.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    },

    clearAll(): void {
      profiles.clear();
      items.clear();
    },
  };
}
