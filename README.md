# Pass-Vault — Zero-Knowledge Password & PIN Manager

A mobile-first, zero-knowledge personal vault built as a native Android APK, Progressive Web App (`apps/pwa`), and Manifest V3 Companion Browser Extension (`apps/extension`), backed by offline-first IndexedDB storage (`Dexie.js`) and encrypted ciphertext sync via Supabase.

[![Download Android APK](https://img.shields.io/badge/Download_Android_APK-v1.0.13-8B5CF6?style=for-the-badge&logo=android&logoColor=white)](https://pass-vault-mhel.vercel.app/Pass-Vault.apk)
[![Open Web App](https://img.shields.io/badge/Open_Web_App-pass--vault--mhel.vercel.app-18181B?style=for-the-badge&logo=vercel&logoColor=white)](https://pass-vault-mhel.vercel.app)

See [BLUEPRINT.md](./BLUEPRINT.md) for the complete technical and cryptographic design specification.

## Features & Capabilities

### Zero-Knowledge Security & Encryption
- **Client-Side Cryptography:** `Argon2id` (with `PBKDF2-HMAC-SHA256` fallback) key derivation, `HKDF-SHA256` subkey splitting, wrapped Vault Encryption Key (`VEK`), and `AES-256-GCM` authenticated encryption with 96-bit IVs and AAD binding. Secrets are never sent to the server in plaintext.
- **Multi-Mode Unlock:** Master Password, 6-digit Quick-Unlock PIN, and native Android **Fingerprint / Face Unlock** (`BiometricPrompt` + `AndroidKeyStore` AES-256-GCM in the APK).
- **5-Strike PIN Protection:** Automatically wipes locally wrapped unlock keys after 5 failed PIN attempts, falling back safely to Master Password recovery.
- **Auto-Lock & Clipboard Safety:** Configurable background/idle auto-lock timer (`Immediate`, `1m`, `2m`, `5m`) and a 30-second clipboard auto-clear countdown after copying secrets.

### Vault Management & Item Types
- **Logins:** Email, Username, optional **ID**, optional **PIN**, masked Password with eye toggle & strength/typing feedback, Website URLs, Notes, and **Password History** (tracks up to 10 previous passwords with **Clear History** and per-entry delete).
- **PINs & Passcodes:** Separate **PIN** and **Passcode** fields (either or both; optional for `SIM / PUK`), category tags (`Bank / ATM / E-Wallet`, `Device / Phone`, `SIM / PUK`, `Door / Alarm`, `Gov / Work ID`, `Other`), and associated account/device.
- **Payment Cards:** Cardholder name, card number, brand, expiry, masked CVV & Card PIN, and billing ZIP.
- **Secure Notes & 2FA:** Optional **ID**, encrypted note content, and interactive **One-Time Recovery Codes** checklist.
- **Organization & Search:** Favorites-first, oldest-to-newest sorting, instant filtering by keyword or `#tag` in the search bar, clickable `#tag` badges, and `Ctrl/Cmd + K` Quick Search command palette.

### Cross-Platform Experience
- **Desktop Web App:** 3-pane layout with a collapsible left sidebar (collapses to a minimal Shield + Search rail), hover-resizable pane dividers, and `localStorage`-persisted layout widths.
- **Native Android APK:** Capacitor-wrapped Android app (`com.mhelric.passvault`) signed with a persistent release keystore, native status-bar safe-area handling, hardware Back-button **Close Pass-Vault?** confirmation popup, and automatic startup **Update Available** check.
- **Mobile Web App:** Fixed glassmorphic bottom navigation bar, slide-up item inspector, and zero premature scrolling on short lists.
- **Companion Browser Extension (`apps/extension`):** Manifest V3 extension with active-tab domain matching and one-click form autofill.

### Tools, Sync & Backups
- **Offline-First Cloud Sync:** Works offline via IndexedDB (`Dexie.js`) and syncs encrypted deltas to Supabase across devices.
- **Password & PIN Generator:** CSPRNG-backed strong password, passphrase, and numeric PIN generator with one-click copy or direct item creation.
- **Smart Importer:** Parses `.txt` credential lists and Google Keep notes into a staging inbox before encrypting into your vault.
- **Offline Vault Health Audit:** Collapsible **Scan / Details** check in Settings that detects weak or reused passwords/PINs strictly in RAM.
- **Encrypted `.vault` Backups:** Export and restore standalone password-protected `.vault` backup files offline.

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

## Release Notes

### v1.0.13
- Hid the **FaceID / Fingerprint Unlock** setting and lock-screen button on the web app (native Android APK only).
- Added a **Scan / Details** expander toggle to **Offline Vault Health** in Settings (collapsed by default).
- Removed the redundant **Install Web App** button, leaving the direct **Download APK** button on the web app.
- Centered the **Fingerprint** unlock button directly below `0` and above **Unlock with Master Password instead** with balanced spacing.

### v1.0.12
- Made **PIN** and **Passcode** optional when **PIN Category** is set to `SIM / PUK`.

### v1.0.11
- Removed bottom-left sidebar and mobile tag chip clutter; added `#tag` search support directly inside the **Filter items or #tags…** search bar.

### v1.0.10
- Added an optional **PIN** field to **Login** vault items.

### v1.0.9
- Added `#tag` filtering support and clickable item tag badges.

### v1.0.8
- Added dedicated **PIN** and **Passcode** fields for PIN vault items (supporting either or both).

### v1.0.7
- Added **Clear History** and per-entry delete buttons to **Password History** on Login items.

### v1.0.6
- Added an optional **ID** field (`accountId`) for **Login** and **Note** items.
- Updated Vault sorting to prioritize **Favorites** at the top, followed by items ordered **oldest to newest**.

### v1.0.5
- Switched Android APK builds to persistent release keystore signing for seamless in-place future updates without package conflicts.

### v1.0.4
- Fixed the blank gap above the Android keyboard when typing by removing duplicate `IME` inset padding in `MainActivity.java`.

### v1.0.3
- Implemented native Android **Fingerprint & Face Unlock** (`androidx.biometric.BiometricPrompt` + `AndroidKeyStore` AES-256-GCM).

### v1.0.2
- Fixed Android status bar / clock overlap via native window inset padding.
- Refined Lock Screen vertical alignment for both PIN keypad and Master Password modes.

### v1.0.1
- Added startup update check and **Update Available** popup using `version.json`.
- Added Capacitor Android APK wrapper, custom Pass-Vault Shield launcher icon, and native hardware Back-button exit confirmation.
