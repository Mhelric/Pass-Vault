import {
  authenticateSupabaseVaultUser,
  createInMemoryRemoteAdapter,
  createSupabaseRemoteAdapter,
  createVaultDatabase,
  createVaultStore,
  createVaultSupabaseClient,
  matchLoginsForUrl,
  type DecryptedVaultItem,
  type LoginItem,
} from '@vault/core';
import { generatePassword, generatePin } from '@vault/crypto';
import { CategoryBadge, CopyButton, PinKeypad } from '@vault/ui';
import {
  ArrowDownToLine,
  Eye,
  EyeOff,
  Globe,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { getChromeApi } from '../chromeApi.js';

const extUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const extKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const extDb = createVaultDatabase('obsidian-vault-extension');
const extClient = extUrl && extKey ? createVaultSupabaseClient({ url: extUrl, anonKey: extKey }) : null;
const extRemote = extClient
  ? createSupabaseRemoteAdapter(extClient)
  : createInMemoryRemoteAdapter();

const extVaultStore = createVaultStore({ db: extDb, remote: extRemote });

export function PopupApp() {
  const userId = useStore(extVaultStore, (s) => s.userId);
  const lockState = useStore(extVaultStore, (s) => s.lockState);
  const items = useStore(extVaultStore, (s) => s.items);
  const hasPinConfigured = useStore(extVaultStore, (s) => s.hasPinConfigured);
  const initializeNewVault = useStore(extVaultStore, (s) => s.initializeNewVault);
  const unlockWithMasterPassword = useStore(extVaultStore, (s) => s.unlockWithMasterPassword);
  const enableQuickPin = useStore(extVaultStore, (s) => s.enableQuickPin);
  const unlockWithPin = useStore(extVaultStore, (s) => s.unlockWithPin);
  const saveItem = useStore(extVaultStore, (s) => s.saveItem);
  const lockVault = useStore(extVaultStore, (s) => s.lockVault);

  const [activeTabUrl, setActiveTabUrl] = useState<string>('https://github.com');
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [view, setView] = useState<'vault' | 'generator'>('vault');
  const [search, setSearch] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cloud auth form state
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudMaster, setCloudMaster] = useState('');
  const [cloudPin, setCloudPin] = useState('');
  const [showCloudMaster, setShowCloudMaster] = useState(false);
  const [showCloudPin, setShowCloudPin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Quick generator state
  const [genMode, setGenMode] = useState<'password' | 'pin'>('password');
  const [genOutput, setGenOutput] = useState(() => generatePassword({ length: 20 }));

  useEffect(() => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs) return;

    void chromeApi.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const current = tabs[0];
      if (current?.url) setActiveTabUrl(current.url);
      if (current?.id !== undefined) setActiveTabId(current.id);
    });
  }, []);

  const matchedLogins = useMemo(
    () => matchLoginsForUrl(items, activeTabUrl),
    [items, activeTabUrl]
  );

  const otherItems = useMemo(() => {
    const matchedIds = new Set(matchedLogins.map((m) => m.id));
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!q && matchedIds.has(item.id)) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q);
    });
  }, [items, matchedLogins, search]);

  const handleAutofill = async (login: LoginItem) => {
    const chromeApi = getChromeApi();
    if (chromeApi?.runtime && activeTabId !== null) {
      await chromeApi.runtime
        .sendMessage({
          type: 'FORWARD_AUTOFILL_TO_TAB',
          tabId: activeTabId,
          username: login.email || login.username,
          password: login.password,
        })
        .catch(() => {});
      setStatusNotice(`Filled ${login.title} on active tab`);
    } else {
      await navigator.clipboard.writeText(login.password).catch(() => {});
      setStatusNotice(`Copied ${login.title} password (clipboard clears in 30s)`);
    }
    window.setTimeout(() => setStatusNotice(null), 2500);
  };

  const notifyCopied = (label: string) => {
    const chromeApi = getChromeApi();
    void chromeApi?.runtime?.sendMessage({
      type: 'SCHEDULE_CLIPBOARD_CLEAR',
      delaySeconds: 30,
    });
    setStatusNotice(`${label} copied • auto-clears in 30s`);
    window.setTimeout(() => setStatusNotice(null), 2500);
  };

  const handleCloudSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extClient) {
      setAuthError('Cloud sync URL/key not configured in extension build.');
      return;
    }
    const trimmedEmail = cloudEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setAuthError('Enter a valid vault email address.');
      return;
    }
    if (cloudMaster.length < 8) {
      setAuthError('Master Password must be at least 8 characters.');
      return;
    }
    if (cloudPin && !/^\d{6}$/.test(cloudPin)) {
      setAuthError('Quick PIN must be 6 digits (or leave blank).');
      return;
    }

    setBusy(true);
    setAuthError(null);
    try {
      const { userId: cloudUserId } = await authenticateSupabaseVaultUser(
        extClient,
        trimmedEmail,
        cloudMaster
      );
      const existingProfile =
        (await extRemote.getProfile(cloudUserId)) ?? (await extDb.profiles.get(cloudUserId));

      if (existingProfile) {
        await unlockWithMasterPassword(cloudUserId, cloudMaster);
      } else {
        await initializeNewVault(cloudUserId, cloudMaster, 'argon2id');
      }

      if (cloudPin) {
        await enableQuickPin(cloudPin);
      }
      setCloudMaster('');
      setCloudPin('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Cloud sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  if (lockState === 'unauthenticated' || !userId) {
    return (
      <div className="h-full w-full bg-[var(--bg-primary)] p-4 flex flex-col justify-between overflow-y-auto gap-3">
        <div className="text-center mt-1 space-y-1.5">
          <div className="w-10 h-10 mx-auto rounded-2xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[var(--accent-soft)]" />
          </div>
          <h1 className="text-sm font-bold text-[var(--text-primary)]">Pass-Vault</h1>
          <p className="text-[11px] text-[var(--text-muted)]">
            Zero-knowledge cloud sync & autofill
          </p>
        </div>

        {extClient && (
          <form
            onSubmit={(e) => void handleCloudSignIn(e)}
            className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3 space-y-2"
          >
            {authError && <p className="text-[11px] text-[var(--status-danger)]">{authError}</p>}
            <input
              type="email"
              required
              value={cloudEmail}
              onChange={(e) => setCloudEmail(e.target.value)}
              placeholder="Vault Email (e.g. you+vault@gmail.com)"
              className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <div className="relative">
              <input
                type={showCloudMaster ? 'text' : 'password'}
                required
                value={cloudMaster}
                onChange={(e) => setCloudMaster(e.target.value)}
                placeholder="Master Password"
                className="w-full font-mono-secret rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] pl-2.5 pr-8 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <button
                type="button"
                onClick={() => setShowCloudMaster((prev) => !prev)}
                aria-label={showCloudMaster ? 'Hide master password' : 'Show master password'}
                title={showCloudMaster ? 'Hide master password' : 'Show master password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {showCloudMaster ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showCloudPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={cloudPin}
                onChange={(e) => setCloudPin(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit Quick PIN (optional)"
                className="w-full font-mono-secret rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] pl-2.5 pr-8 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <button
                type="button"
                onClick={() => setShowCloudPin((prev) => !prev)}
                aria-label={showCloudPin ? 'Hide Quick PIN' : 'Show Quick PIN'}
                title={showCloudPin ? 'Hide Quick PIN' : 'Show Quick PIN'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {showCloudPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-xs font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Syncing Cloud Vault…' : 'Sign In / Sync Cloud Vault'}
            </button>
          </form>
        )}
      </div>
    );
  }

  if (lockState !== 'unlocked') {
    return (
      <div className="h-full w-full bg-[var(--bg-primary)] p-4 flex flex-col justify-center">
        <div className="text-center mb-4">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Extension Locked</h2>
          <p className="text-[11px] text-[var(--text-muted)]">Enter your 6-digit Quick PIN</p>
        </div>
        {hasPinConfigured ? (
          <PinKeypad
            error={pinError}
            onComplete={async (pin) => {
              setPinError(null);
              const res = await unlockWithPin(pin);
              if (res.status === 'invalid_pin') {
                setPinError(`Incorrect PIN (${res.attemptsRemaining} tries left)`);
              }
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--bg-primary)] flex flex-col">
      {/* Compact Header */}
      <header className="px-3.5 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-[var(--accent-soft)] shrink-0" />
          <span className="text-xs font-bold truncate">Pass-Vault</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView(view === 'vault' ? 'generator' : 'vault')}
            className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${
              view === 'generator'
                ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 inline mr-1" />
            Gen
          </button>
          <button
            type="button"
            onClick={lockVault}
            aria-label="Lock extension"
            className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {view === 'generator' ? (
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {(['password', 'pin'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setGenMode(mode);
                  setGenOutput(
                    mode === 'password' ? generatePassword({ length: 20 }) : generatePin({ length: 6 })
                  );
                }}
                className={`py-2 rounded-xl text-xs font-semibold capitalize border ${
                  genMode === mode
                    ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3 space-y-3">
            <div className="font-mono-secret text-sm text-[var(--accent-soft)] break-all">
              {genOutput}
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setGenOutput(
                    genMode === 'password'
                      ? generatePassword({ length: 20 })
                      : generatePin({ length: 6 })
                  )
                }
                className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-white"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate
              </button>
              <CopyButton value={genOutput} label="Generated secret" onCopied={notifyCopied} compact />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-[var(--border-subtle)]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logins & PINs…"
                className="w-full rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {!search && matchedLogins.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-soft)]">
                  <Globe className="w-3 h-3" />
                  <span>Suggested for active tab</span>
                </div>
                {matchedLogins.map((login) => (
                  <div
                    key={login.id}
                    className="rounded-xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 p-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{login.title}</div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        {login.email || login.username}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleAutofill(login)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-primary)] text-white text-[11px] font-semibold"
                      >
                        <ArrowDownToLine className="w-3 h-3" />
                        Fill
                      </button>
                      <CopyButton
                        value={login.password}
                        label="Password"
                        onCopied={notifyCopied}
                        compact
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {search ? 'Search Results' : 'All Vault Items'}
              </div>
              {otherItems.map((item) => {
                const secret =
                  item.category === 'login'
                    ? item.password
                    : item.category === 'pin'
                      ? item.pinCode
                      : item.category === 'card'
                        ? item.cardNumber
                        : item.content;

                return (
                  <div
                    key={item.id}
                    className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <CategoryBadge category={item.category} showLabel={false} />
                        <span className="text-xs font-semibold truncate">{item.title}</span>
                      </div>
                    </div>
                    <CopyButton
                      value={secret}
                      label={item.category === 'pin' ? 'PIN' : 'Secret'}
                      onCopied={notifyCopied}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {statusNotice && (
        <div className="px-3 py-2 bg-[var(--bg-elevated)] border-t border-[var(--accent-primary)]/40 text-[11px] text-[var(--accent-soft)] text-center">
          {statusNotice}
        </div>
      )}
    </div>
  );
}
