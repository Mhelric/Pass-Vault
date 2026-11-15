-- Enable UUID generation if not already active
create extension if not exists "pgcrypto";

-- 1. User Vault Profile (Stores KDF parameters and Master-Key-wrapped VEK)
create table if not exists public.vault_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kdf_algorithm text not null default 'argon2id' check (kdf_algorithm in ('argon2id', 'pbkdf2-sha256')),
  kdf_salt text not null,                         -- Base64 16-byte random salt
  kdf_iterations integer not null default 3,
  kdf_memory integer not null default 65536,      -- KiB (64 MiB)
  kdf_parallelism integer not null default 1,
  encrypted_vek text not null,                    -- Base64 AES-256-GCM ciphertext of VEK
  vek_iv text not null,                           -- Base64 12-byte IV
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Encrypted Vault Items (Zero-Knowledge Ciphertext Rows)
create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_payload text not null,                -- Base64 AES-256-GCM JSON payload
  iv text not null,                               -- Base64 12-byte IV
  version integer not null default 1,             -- Optimistic concurrency counter
  is_favorite boolean not null default false,
  deleted_at timestamptz null,                    -- Soft-delete tombstone for cross-device sync
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast incremental delta sync queries
create index if not exists idx_vault_items_user_updated
  on public.vault_items (user_id, updated_at desc);

-- Automatic updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_vault_profiles_updated on public.vault_profiles;
create trigger trg_vault_profiles_updated
  before update on public.vault_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_vault_items_updated on public.vault_items;
create trigger trg_vault_items_updated
  before update on public.vault_items
  for each row execute function public.set_updated_at();

-- 3. Row-Level Security (Strict per-user isolation)
alter table public.vault_profiles enable row level security;
alter table public.vault_items enable row level security;

drop policy if exists "Users manage own vault profile" on public.vault_profiles;
create policy "Users manage own vault profile"
  on public.vault_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own vault items" on public.vault_items;
create policy "Users manage own vault items"
  on public.vault_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
