import type { DecryptedVaultItem, VaultCategory } from '@vault/core';
import { CategoryBadge, CopyButton } from '@vault/ui';
import {
  Command,
  CreditCard,
  FileText,
  FileUp,
  Hash,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette.js';
import { GeneratorView } from './components/GeneratorView.js';
import { ImportView } from './components/ImportView.js';
import { ItemFormModal } from './components/ItemFormModal.js';
import { ItemInspector } from './components/ItemInspector.js';
import { LockOverlay } from './components/LockOverlay.js';
import { SettingsView } from './components/SettingsView.js';
import { launchInteractiveDemoVault } from './demoSeed.js';
import {
  getItemSubtitle,
  getPrimarySecret,
  loadUiPreferences,
  pwaDb,
  saveUiPreferences,
  useVault,
  vaultStore,
} from './vaultRuntime.js';

type ActiveTab = 'vault' | 'pins' | 'generator' | 'import' | 'settings';
type VaultFilter = 'all' | 'favorites' | VaultCategory;

export function App() {
  const userId = useVault((s) => s.userId);
  const lockState = useVault((s) => s.lockState);
  const items = useVault((s) => s.items);
  const isSyncing = useVault((s) => s.isSyncing);
  const hydrateSession = useVault((s) => s.hydrateSession);
  const initializeNewVault = useVault((s) => s.initializeNewVault);
  const enableQuickPin = useVault((s) => s.enableQuickPin);
  const lockVault = useVault((s) => s.lockVault);
  const saveItem = useVault((s) => s.saveItem);
  const softDeleteItem = useVault((s) => s.softDeleteItem);
  const syncNow = useVault((s) => s.syncNow);

  const [prefs, setPrefs] = useState(loadUiPreferences);
  const [activeTab, setActiveTab] = useState<ActiveTab>('vault');
  const [filter, setFilter] = useState<VaultFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Create / Edit modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DecryptedVaultItem | null>(null);
  const [prefillCategory, setPrefillCategory] = useState<VaultCategory>('login');
  const [prefillSecret, setPrefillSecret] = useState<string | undefined>(undefined);

  // Command palette
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Onboarding state
  const [aliasInput, setAliasInput] = useState('');
  const [masterInput, setMasterInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // 30-second Clipboard Auto-Clear countdown
  const [clipboardTimer, setClipboardTimer] = useState<{ label: string; secondsLeft: number } | null>(
    null
  );

  // Restore last local session on mount if IndexedDB profile exists
  useEffect(() => {
    const savedPrefs = loadUiPreferences();
    if (savedPrefs.lastUserId && lockState === 'unauthenticated') {
      void pwaDb.profiles.get(savedPrefs.lastUserId).then((profile) => {
        if (profile) {
          void hydrateSession(savedPrefs.lastUserId!);
        }
      });
    }
  }, [hydrateSession, lockState]);

  // Global Cmd/Ctrl + K Command Palette shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (lockState === 'unlocked') {
          e.preventDefault();
          setPaletteOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lockState]);

  // Background & idle Auto-Lock timer
  const idleTimerRef = useRef<number | null>(null);
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (lockState !== 'unlocked' || prefs.autoLockSeconds <= 0) {
      return;
    }
    idleTimerRef.current = window.setTimeout(() => {
      vaultStore.getState().lockVault();
    }, prefs.autoLockSeconds * 1000);
  }, [lockState, prefs.autoLockSeconds]);

  useEffect(() => {
    if (lockState !== 'unlocked') return;

    resetIdleTimer();
    const onActivity = () => resetIdleTimer();
    const onVisibility = () => {
      if (document.hidden && prefs.autoLockSeconds === 0) {
        vaultStore.getState().lockVault();
      }
    };

    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [lockState, prefs.autoLockSeconds, resetIdleTimer]);

  // 30-second Clipboard Auto-Clear Countdown Effect
  useEffect(() => {
    if (!clipboardTimer) return;
    if (clipboardTimer.secondsLeft <= 0) {
      void navigator.clipboard.writeText('').catch(() => {});
      setClipboardTimer(null);
      return;
    }
    const id = window.setTimeout(() => {
      setClipboardTimer((prev) =>
        prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null
      );
    }, 1000);
    return () => window.clearTimeout(id);
  }, [clipboardTimer]);

  const triggerClipboardCountdown = useCallback((label: string) => {
    setClipboardTimer({ label, secondsLeft: 30 });
  }, []);

  const filteredItems = useMemo(() => {
    const effectiveCategory = activeTab === 'pins' ? 'pin' : filter;
    const q = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      if (effectiveCategory === 'favorites' && !item.isFavorite) return false;
      if (
        effectiveCategory !== 'all' &&
        effectiveCategory !== 'favorites' &&
        item.category !== effectiveCategory
      ) {
        return false;
      }

      if (!q) return true;
      const sub = getItemSubtitle(item).toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        sub.includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, activeTab, filter, searchQuery]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? filteredItems[0] ?? null,
    [items, selectedId, filteredItems]
  );

  const handleLaunchDemo = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await launchInteractiveDemoVault();
      setPrefs(loadUiPreferences());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to initialize demo vault');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCreateCustomVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (masterInput.length < 8) {
      setAuthError('Master Password should be at least 8 characters.');
      return;
    }
    if (pinInput && !/^\d{6}$/.test(pinInput)) {
      setAuthError('Quick-Unlock PIN must be exactly 6 numeric digits (or leave blank).');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const newUserId = globalThis.crypto.randomUUID();
      await initializeNewVault(newUserId, masterInput, 'argon2id');
      if (pinInput) {
        await enableQuickPin(pinInput);
      }
      const nextPrefs = saveUiPreferences({
        lastUserId: newUserId,
        aliasLabel: aliasInput.trim() || 'Personal Vault',
        isDemoMode: false,
      });
      setPrefs(nextPrefs);
      setMasterInput('');
      setPinInput('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to create vault');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleToggleFavorite = async (item: DecryptedVaultItem) => {
    await saveItem({
      ...item,
      isFavorite: !item.isFavorite,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleDelete = async (item: DecryptedVaultItem) => {
    await softDeleteItem(item.id);
    if (selectedId === item.id) {
      setSelectedId(null);
    }
    setMobileSheetOpen(false);
  };

  const handleToggleRecoveryCode = async (item: DecryptedVaultItem, idx: number) => {
    if (item.category !== 'note' || !item.recoveryCodes) return;
    const nextCodes = item.recoveryCodes.map((entry, i) =>
      i === idx ? { ...entry, used: !entry.used } : entry
    );
    await saveItem({
      ...item,
      recoveryCodes: nextCodes,
      updatedAt: new Date().toISOString(),
    });
  };

  // 1. Auth / Onboarding Gate
  if (lockState === 'unauthenticated' || !userId) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center shadow-[0_0_36px_rgba(139,92,246,0.3)]">
              <Shield className="w-8 h-8 text-[var(--accent-soft)]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Obsidian Vault
            </h1>
            <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
              Zero-knowledge encrypted vault for passwords, PINs, cards, and recovery notes.
            </p>
          </div>

          {/* 1-Click Demo CTA for immediate preview */}
          <div className="rounded-2xl bg-gradient-to-br from-violet-600/20 via-[var(--bg-elevated)] to-[var(--bg-elevated)] border border-[var(--accent-primary)]/40 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="w-4 h-4 text-[var(--accent-soft)]" />
              <span>Preview Live Interactive Vault</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Spins up a real client-side Argon2id + AES-256-GCM vault in IndexedDB with sample Logins, BDO/GCash PINs, Visa Card, and 2FA Backup Codes. Quick PIN is{' '}
              <span className="font-mono-secret text-[var(--accent-soft)] font-semibold">123456</span>.
            </p>
            <button
              type="button"
              disabled={authBusy}
              onClick={() => void handleLaunchDemo()}
              className="w-full py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-sm font-semibold text-white shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all disabled:opacity-60"
            >
              {authBusy ? 'Deriving Argon2id Vault Keys…' : 'Launch Interactive Demo Vault'}
            </button>
          </div>

          {/* Or create a blank personal vault */}
          <form
            onSubmit={(e) => void handleCreateCustomVault(e)}
            className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 space-y-3.5"
          >
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Or Create a New Blank Vault
            </h2>

            {authError && (
              <p className="text-xs text-[var(--status-danger)]">{authError}</p>
            )}

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Email Alias / Vault Label
              </label>
              <input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                placeholder="yourname+vault@gmail.com"
                className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Master Password (never leaves device) *
              </label>
              <input
                type="password"
                required
                value={masterInput}
                onChange={(e) => setMasterInput(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                6-Digit Quick-Unlock PIN (optional)
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 048291"
                className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-white/10 border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] transition-colors disabled:opacity-60"
            >
              Create Encrypted Vault
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Lock Screen Overlay (PIN / Biometrics / Master Password)
  if (lockState !== 'unlocked') {
    return <LockOverlay aliasLabel={prefs.aliasLabel} isDemoMode={prefs.isDemoMode} />;
  }

  const categoryNav: Array<{ id: VaultFilter; label: string; icon: typeof Shield }> = [
    { id: 'all', label: 'All Items', icon: Shield },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'login', label: 'Logins', icon: KeyRound },
    { id: 'pin', label: 'PINs', icon: Hash },
    { id: 'card', label: 'Cards', icon: CreditCard },
    { id: 'note', label: 'Notes', icon: FileText },
  ];

  // 3. Unlocked Mobile-First + Desktop 3-Pane Workspace
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col md:flex-row">
      {/* Desktop Left Sidebar (>= 768px) */}
      <aside className="hidden md:flex md:w-60 shrink-0 flex-col justify-between bg-[var(--bg-elevated)] border-r border-[var(--border-subtle)] p-4">
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[var(--accent-soft)]" />
              </div>
              <span className="font-bold tracking-tight text-sm">Obsidian Vault</span>
            </div>
            <button
              type="button"
              onClick={lockVault}
              title="Lock Vault"
              aria-label="Lock Vault"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-surface)]"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:border-[var(--accent-primary)] transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              Quick Search
            </span>
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[10px] border border-[var(--border-subtle)]">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>

          <nav className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Vault
            </div>
            {categoryNav.map((nav) => {
              const Icon = nav.icon;
              const isActive = activeTab === 'vault' && filter === nav.id;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => {
                    setActiveTab('vault');
                    setFilter(nav.id);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[var(--accent-tint)] text-white border border-[var(--accent-primary)]/35'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-[var(--accent-soft)]' : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <span>{nav.label}</span>
                </button>
              );
            })}
          </nav>

          <nav className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Tools
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('generator')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'generator'
                  ? 'bg-[var(--accent-tint)] text-white border border-[var(--accent-primary)]/35'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] border border-transparent'
              }`}
            >
              <Wand2 className="w-4 h-4 text-[var(--accent-soft)]" />
              <span>Generator</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'import'
                  ? 'bg-[var(--accent-tint)] text-white border border-[var(--accent-primary)]/35'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] border border-transparent'
              }`}
            >
              <FileUp className="w-4 h-4 text-[var(--accent-soft)]" />
              <span>Import .txt / Keep</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-[var(--accent-tint)] text-white border border-[var(--accent-primary)]/35'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] border border-transparent'
              }`}
            >
              <Settings className="w-4 h-4 text-[var(--text-muted)]" />
              <span>Security & Settings</span>
            </button>
          </nav>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingItem(null);
            setPrefillCategory(filter === 'pin' ? 'pin' : 'login');
            setPrefillSecret(undefined);
            setFormOpen(true);
          }}
          className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(139,92,246,0.35)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Vault Item</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Sticky Header (< 768px) */}
        <header className="md:hidden sticky top-0 z-30 bg-[var(--bg-primary)]/95 backdrop-blur border-b border-[var(--border-subtle)] px-4 pt-3 pb-2.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[var(--accent-soft)]" />
              </div>
              <span className="font-bold text-sm tracking-tight">
                {activeTab === 'pins'
                  ? 'PINs & Passcodes'
                  : activeTab === 'generator'
                    ? 'Generator'
                    : activeTab === 'import'
                      ? 'Import Notes'
                      : activeTab === 'settings'
                        ? 'Security'
                        : 'Vault'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void syncNow().catch(() => {})}
                aria-label="Sync Vault"
                className="p-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[var(--accent-soft)]' : ''}`} />
              </button>
              <button
                type="button"
                onClick={lockVault}
                aria-label="Lock Vault"
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)]"
              >
                <Lock className="w-3.5 h-3.5 text-[var(--accent-soft)]" />
                <span>Lock</span>
              </button>
            </div>
          </div>

          {(activeTab === 'vault' || activeTab === 'pins') && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search logins, PINs, cards, notes…"
                  className="w-full rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] pl-9 pr-3.5 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              {activeTab === 'vault' && (
                <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
                  {categoryNav.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setFilter(pill.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        filter === pill.id
                          ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </header>

        {/* Body Content */}
        {activeTab === 'generator' ? (
          <div className="p-4 md:p-8 flex-1 overflow-y-auto">
            <GeneratorView
              onCopySecret={triggerClipboardCountdown}
              onUseInNewItem={(secret, category) => {
                setEditingItem(null);
                setPrefillCategory(category);
                setPrefillSecret(secret);
                setFormOpen(true);
              }}
            />
          </div>
        ) : activeTab === 'import' ? (
          <div className="p-4 md:p-8 flex-1 overflow-y-auto">
            <ImportView
              onImportItems={async (importedItems) => {
                for (const item of importedItems) {
                  await saveItem(item);
                }
                if (importedItems[0]) {
                  setSelectedId(importedItems[0].id);
                }
                setActiveTab('vault');
                setFilter('all');
              }}
            />
          </div>
        ) : activeTab === 'settings' ? (
          <div className="p-4 md:p-8 flex-1 overflow-y-auto">
            <SettingsView
              autoLockSeconds={prefs.autoLockSeconds}
              onChangeAutoLock={(sec) => {
                setPrefs(saveUiPreferences({ autoLockSeconds: sec }));
              }}
              aliasLabel={prefs.aliasLabel}
              isDemoMode={prefs.isDemoMode}
            />
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Item List Column (Full-width mobile / 340px desktop) */}
            <section className="w-full md:w-[360px] shrink-0 md:border-r md:border-[var(--border-subtle)] flex flex-col">
              {/* Desktop Search Header */}
              <div className="hidden md:flex items-center gap-2 p-4 border-b border-[var(--border-subtle)]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter items…"
                    className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] pl-9 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void syncNow().catch(() => {})}
                  title="Sync now"
                  className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[var(--accent-soft)]' : ''}`} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 md:p-3 space-y-2 pb-28 md:pb-4">
                {filteredItems.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-2">
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      No items match your filter
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Tap + to encrypt and save a new password, PIN, card, or note.
                    </p>
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    const primary = getPrimarySecret(item);
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedId(item.id);
                          setMobileSheetOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedId(item.id);
                            setMobileSheetOpen(true);
                          }
                        }}
                        className={`group rounded-2xl border p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[var(--accent-tint)] border-[var(--accent-primary)]/50'
                            : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface)]'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <CategoryBadge category={item.category} showLabel={false} />
                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {item.title}
                            </span>
                            {item.isFavorite && (
                              <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0" />
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate pl-0.5">
                            {getItemSubtitle(item)}
                          </div>
                        </div>

                        <CopyButton
                          value={primary.value}
                          label={primary.label}
                          onCopied={triggerClipboardCountdown}
                          compact
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Desktop Right Detail Inspector (>= 768px) */}
            <section className="hidden md:block flex-1 overflow-y-auto p-6 lg:p-8">
              {selectedItem ? (
                <div className="max-w-2xl">
                  <ItemInspector
                    item={selectedItem}
                    onCopySecret={triggerClipboardCountdown}
                    onEdit={(it) => {
                      setEditingItem(it);
                      setFormOpen(true);
                    }}
                    onToggleFavorite={handleToggleFavorite}
                    onDelete={handleDelete}
                    onToggleRecoveryCode={handleToggleRecoveryCode}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
                  Select an item from the list to inspect or edit
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Mobile Slide-Up Bottom Sheet Inspector (< 768px) */}
      {mobileSheetOpen && selectedItem && (activeTab === 'vault' || activeTab === 'pins') && (
        <div
          className="md:hidden fixed inset-0 z-40 flex items-end bg-black/70 backdrop-blur-xs"
          onClick={() => setMobileSheetOpen(false)}
        >
          <div
            className="w-full max-h-[88vh] overflow-y-auto rounded-t-3xl bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-[var(--border-subtle)] mx-auto mb-4" />
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)]"
                aria-label="Close inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ItemInspector
              item={selectedItem}
              onCopySecret={triggerClipboardCountdown}
              onEdit={(it) => {
                setMobileSheetOpen(false);
                setEditingItem(it);
                setFormOpen(true);
              }}
              onToggleFavorite={handleToggleFavorite}
              onDelete={handleDelete}
              onToggleRecoveryCode={handleToggleRecoveryCode}
            />
          </div>
        </div>
      )}

      {/* Mobile Floating Action Button (+) */}
      {(activeTab === 'vault' || activeTab === 'pins') && (
        <button
          type="button"
          onClick={() => {
            setEditingItem(null);
            setPrefillCategory(activeTab === 'pins' || filter === 'pin' ? 'pin' : 'login');
            setPrefillSecret(undefined);
            setFormOpen(true);
          }}
          aria-label="Add new vault item"
          className="md:hidden fixed right-5 bottom-20 z-30 w-14 h-14 rounded-2xl bg-[var(--accent-primary)] text-white flex items-center justify-center shadow-[0_6px_28px_rgba(139,92,246,0.5)] active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--bg-elevated)]/95 backdrop-blur border-t border-[var(--border-subtle)] grid grid-cols-5 px-1 py-1.5">
        {[
          { id: 'vault' as const, label: 'Vault', icon: Shield },
          { id: 'pins' as const, label: 'PINs', icon: Hash },
          { id: 'generator' as const, label: 'Gen', icon: Wand2 },
          { id: 'import' as const, label: 'Import', icon: FileUp },
          { id: 'settings' as const, label: 'Security', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                active ? 'text-[var(--accent-soft)]' : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 30-Second Clipboard Auto-Clear Countdown Toast */}
      {clipboardTimer && (
        <div className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--accent-primary)]/50 shadow-[0_8px_32px_rgba(0,0,0,0.65)] text-xs whitespace-nowrap">
          <span className="text-[var(--text-primary)] font-medium">
            {clipboardTimer.label} copied
          </span>
          <span className="font-mono-secret text-[var(--accent-soft)]">
            clears in {clipboardTimer.secondsLeft}s
          </span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText('').catch(() => {});
              setClipboardTimer(null);
            }}
            className="text-[var(--text-muted)] hover:text-white underline"
          >
            Clear now
          </button>
        </div>
      )}

      {/* Create / Edit Modal */}
      {formOpen && (
        <ItemFormModal
          initialItem={editingItem}
          defaultCategory={prefillCategory}
          prefillSecret={prefillSecret}
          onSave={async (next) => {
            await saveItem(next);
            setSelectedId(next.id);
          }}
          onClose={() => {
            setFormOpen(false);
            setEditingItem(null);
            setPrefillSecret(undefined);
          }}
        />
      )}

      {/* Desktop Spotlight Command Palette */}
      <CommandPalette
        open={paletteOpen}
        items={items}
        onClose={() => setPaletteOpen(false)}
        onSelectItem={(item) => setSelectedId(item.id)}
        onCopySecret={triggerClipboardCountdown}
      />
    </div>
  );
}
