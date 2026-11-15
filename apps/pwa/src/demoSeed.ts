import type { CardItem, DecryptedVaultItem, LoginItem, NoteItem, PinItem } from '@vault/core';
import { randomBytes } from '@vault/crypto';
import { pwaDb, remoteAdapter, saveUiPreferences, vaultStore } from './vaultRuntime.js';

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_MASTER_PASSWORD = 'ObsidianVault!Demo#2026';
export const DEMO_QUICK_PIN = '123456';
export const DEMO_BIO_SECRET_STORAGE_KEY = 'obsidian_demo_bio_secret_b64';

function buildDemoItems(): DecryptedVaultItem[] {
  const now = new Date().toISOString();
  const earlier = '2026-11-10T09:30:00.000Z';

  return [
    {
      id: globalThis.crypto.randomUUID(),
      category: 'login',
      title: 'Google Main Account',
      isFavorite: true,
      tags: ['email', 'primary'],
      email: 'yourname+vault@gmail.com',
      username: 'yourname',
      password: 'K9#mP2$vL8!qR4xW7zN3',
      urls: ['https://accounts.google.com'],
      notes: 'Main recovery email with dedicated vault alias.',
      passwordHistory: [
        { password: 'OldGooglePass!2024', changedAt: '2024-06-12T10:00:00.000Z' },
      ],
      createdAt: earlier,
      updatedAt: now,
    } satisfies LoginItem,
    {
      id: globalThis.crypto.randomUUID(),
      category: 'pin',
      title: 'BDO ATM & Debit Card PIN',
      isFavorite: true,
      tags: ['bank', 'atm'],
      pinCode: '0482',
      pinType: 'bank_atm',
      associatedAccount: 'BDO Kabayan Savings',
      notes: 'Keep leading zero 0 when entering at ATM.',
      createdAt: earlier,
      updatedAt: now,
    } satisfies PinItem,
    {
      id: globalThis.crypto.randomUUID(),
      category: 'pin',
      title: 'GCash MPIN',
      isFavorite: true,
      tags: ['ewallet'],
      pinCode: '8391',
      pinType: 'bank_atm',
      associatedAccount: '+63 917 ••• •482',
      notes: 'Mobile wallet 4-digit MPIN',
      createdAt: earlier,
      updatedAt: now,
    } satisfies PinItem,
    {
      id: globalThis.crypto.randomUUID(),
      category: 'pin',
      title: 'Phone Lock Screen',
      isFavorite: false,
      tags: ['device'],
      pinCode: '094128',
      pinType: 'device_phone',
      associatedAccount: 'Primary Mobile Phone',
      createdAt: earlier,
      updatedAt: now,
    } satisfies PinItem,
    {
      id: globalThis.crypto.randomUUID(),
      category: 'login',
      title: 'GitHub',
      isFavorite: false,
      tags: ['dev'],
      username: 'Mhelric',
      email: 'mhelricbanaag102703@gmail.com',
      password: 'harbor-cobalt-galaxy-ember7',
      urls: ['https://github.com'],
      notes: 'Developer account & SSH passphrase backup',
      passwordHistory: [],
      createdAt: earlier,
      updatedAt: now,
    } satisfies LoginItem,
    {
      id: globalThis.crypto.randomUUID(),
      category: 'login',
      title: 'Netflix Family',
      isFavorite: false,
      tags: ['streaming'],
      email: 'family+stream@gmail.com',
      password: 'TvNight!Stream#4491',
      urls: ['https://www.netflix.com'],
      passwordHistory: [],
      createdAt: earlier,
      updatedAt: now,
    } satisfies LoginItem,
    {
      id: globalThis.crypto.randomUUID(),
      category: 'card',
      title: 'Visa Rewards Debit',
      isFavorite: false,
      tags: ['finance'],
      cardholderName: 'MHELRIC USER',
      cardNumber: '4532 8910 4421 7782',
      brand: 'Visa',
      expiryMonth: '08',
      expiryYear: '2029',
      cvv: '842',
      cardPin: '9041',
      billingZip: '1100',
      notes: 'Online subscriptions card',
      createdAt: earlier,
      updatedAt: now,
    } satisfies CardItem,
    {
      id: globalThis.crypto.randomUUID(),
      category: 'note',
      title: 'Google 2FA Backup Codes',
      isFavorite: true,
      tags: ['recovery', '2fa'],
      content: 'Use one backup code if phone authenticator is unavailable.',
      recoveryCodes: [
        { code: '8492 1938', used: false },
        { code: '3301 7721', used: false },
        { code: '5190 6624', used: true },
        { code: '7742 1089', used: false },
      ],
      createdAt: earlier,
      updatedAt: now,
    } satisfies NoteItem,
  ];
}

/**
 * Initialize a local zero-knowledge demo vault encrypted in IndexedDB so the user
 * can preview the full mobile/desktop experience, PIN lock, and biometrics immediately.
 */
export async function launchInteractiveDemoVault(): Promise<void> {
  const store = vaultStore.getState();

  // Clear previous demo rows and ephemeral remote state for a fresh predictable sandbox
  remoteAdapter.clearAll?.();
  await pwaDb.transaction('rw', pwaDb.profiles, pwaDb.items, pwaDb.syncQueue, pwaDb.deviceKeys, async () => {
    await pwaDb.profiles.clear();
    await pwaDb.items.clear();
    await pwaDb.syncQueue.clear();
    await pwaDb.deviceKeys.clear();
  });

  await store.initializeNewVault(DEMO_USER_ID, DEMO_MASTER_PASSWORD, 'argon2id');
  await store.enableQuickPin(DEMO_QUICK_PIN);

  // Enroll demo biometric token for testing FaceID / Fingerprint button on localhost
  const demoBioSecret = randomBytes(32);
  await store.enableBiometricUnlock(demoBioSecret, 'demo-platform-authenticator');
  sessionStorage.setItem(
    DEMO_BIO_SECRET_STORAGE_KEY,
    btoa(String.fromCharCode(...demoBioSecret))
  );
  demoBioSecret.fill(0);

  for (const item of buildDemoItems()) {
    await vaultStore.getState().saveItem(item);
  }

  saveUiPreferences({
    lastUserId: DEMO_USER_ID,
    aliasLabel: 'yourname+vault@gmail.com (Demo)',
    isDemoMode: true,
  });
}
