# Pass-Vault — Zero-Knowledge Password & PIN Manager

A mobile-first, zero-knowledge personal vault built as an installable Progressive Web App (`apps/pwa`) and Manifest V3 Companion Browser Extension (`apps/extension`), backed by offline-first IndexedDB storage (`Dexie.js`) and encrypted ciphertext sync via Supabase.

See [BLUEPRINT.md](./BLUEPRINT.md) for the complete technical and cryptographic design specification.

## Architecture

- **`packages/crypto` (`@vault/crypto`)**: Client-side `Argon2id` / `PBKDF2-SHA256` KDF, `HKDF-SHA256` subkey splitting, `VEK` wrapping, `AES-256-GCM` encryption with 96-bit IVs and AAD binding, WebAuthn biometric helpers, CSPRNG generator, and byte zeroization.
- **`packages/core` (`@vault/core`)**: Typed schemas (`LoginItem`, `PinItem`, `CardItem`, `NoteItem`), `Dexie.js` local database, 5-strike PIN wipe protection, offline-first delta sync engine, smart local `.txt` & Google Keep parser, domain autofill matcher, and `.vault` encrypted backup export/restore.
- **`packages/ui` (`@vault/ui`)**: Deep Obsidian (`#09090B`) + Electric Purple (`#8B5CF6`) tokens, circular 6-digit `PinKeypad`, syntax-highlighted `SecretDisplay`, and `CopyButton`.
- **`apps/pwa` (`@vault/pwa`)**: Mobile-first responsive Pass-Vault PWA with Supabase Cloud Sync or local IndexedDB vault creation, Biometrics/PIN lock overlay, auto-lock timer, 30s clipboard auto-clear, Generator, Staging Inbox importer, and `.vault` backup export/restore.
- **`apps/extension` (`@vault/extension`)**: Manifest V3 browser extension with active-tab domain matching and one-click form autofill.

## Quick Start

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Open `http://localhost:5173` to sign in or create your encrypted Pass-Vault account. Configure `.env` from `.env.example` and apply `supabase/migrations/202611150001_init_vault.sql` to enable Supabase cloud sync across devices.

## Production Build & Extension Loading

```bash
npm run build
```

- **PWA Deploy (`apps/pwa/dist`)**: Deploy `apps/pwa` directly to Vercel (using `apps/pwa/vercel.json`) or Cloudflare Pages.
- **Browser Extension (`apps/extension/dist`)**: Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked** pointing to `apps/extension/dist`.
