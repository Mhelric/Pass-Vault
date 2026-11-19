import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  authenticateSupabaseVaultUser,
  type DecryptedVaultItem,
  type VaultCategory,
} from '@vault/core';
import { CategoryBadge, CopyButton, SecretInput } from '@vault/ui';
import {
  Command,
  CreditCard,
  Download,
  FileText,
  FileUp,
  Hash,
  KeyRound,
  Lock,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Star,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_VERSION,
  isNewerVersion,
  VERSION_MANIFEST_URL,
  type RemoteVersionManifest,
} from './appVersion.js';
import { CommandPalette } from './components/CommandPalette.js';
import { GeneratorView } from './components/GeneratorView.js';
import { ImportView } from './components/ImportView.js';
import { ItemFormModal } from './components/ItemFormModal.js';
import { ItemInspector } from './components/ItemInspector.js';
import { LockOverlay } from './components/LockOverlay.js';
import { SettingsView } from './components/SettingsView.js';
import {
  getItemSubtitle,
  getPrimarySecret,
  loadUiPreferences,
  pwaDb,
  remoteAdapter,
  saveUiPreferences,
  supabaseClient,
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
  const unlockWithMasterPassword = useVault((s) => s.unlockWithMasterPassword);
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
  const [authMode, setAuthMode] = useState<'signin' | 'create'>('signin');
  const [aliasInput, setAliasInput] = useState('');
  const [masterInput, setMasterInput] = useState('');
  const [confirmMasterInput, setConfirmMasterInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authStepLabel, setAuthStepLabel] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const navHistoryRef = useRef<Array<{ tab: ActiveTab; filter: VaultFilter }>>([]);
  const exitingRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => prefs.sidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.min(360, Math.max(180, prefs.sidebarWidth))
  );
  const [listWidth, setListWidth] = useState(() =>
    Math.min(560, Math.max(260, prefs.listWidth))
  );
  const [resizingTarget, setResizingTarget] = useState<'sidebar' | 'list' | null>(null);

  useEffect(() => {
    if (resizingTarget !== null) return;
    saveUiPreferences({ sidebarCollapsed, sidebarWidth, listWidth });
  }, [sidebarCollapsed, sidebarWidth, listWidth, resizingTarget]);
  const [installPrompt, setInstallPrompt] = useState<
    (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }) | null
  >(null);
  const [availableUpdate, setAvailableUpdate] = useState<RemoteVersionManifest | null>(null);
  const [bgGifIndex, setBgGifIndex] = useState(0);

  useEffect(() => {
    if (lockState !== 'unauthenticated' && userId) return;
    const id = window.setInterval(() => {
      setBgGifIndex((prev) => (prev + 1) % 4);
    }, 5000);
    return () => window.clearInterval(id);
  }, [lockState, userId]);

  useEffect(() => {
    if (isBooting) return;
    let cancelled = false;
    void fetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<RemoteVersionManifest>) : null))
      .then((manifest) => {
        if (cancelled || !manifest?.version) return;
        const dismissed = sessionStorage.getItem('pass_vault_dismissed_update');
        if (dismissed === manifest.version) return;
        if (isNewerVersion(manifest.version, APP_VERSION)) {
          setAvailableUpdate(manifest);
        }
      })
      .catch(() => {
        // Offline or unreachable; silently skip update check
      });
    return () => {
      cancelled = true;
    };
  }, [isBooting]);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(
        e as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
      );
    };
    const onAppInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!resizingTarget) return;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onPointerMove = (e: PointerEvent) => {
      if (resizingTarget === 'sidebar') {
        if (e.clientX < 130) {
          setSidebarCollapsed(true);
        } else {
          setSidebarCollapsed(false);
          setSidebarWidth(Math.min(360, Math.max(180, e.clientX)));
        }
      } else {
        const mainLeft = sidebarCollapsed ? 64 : sidebarWidth;
        const next = e.clientX - mainLeft;
        setListWidth(Math.min(560, Math.max(260, next)));
      }
    };

    const stopResize = () => setResizingTarget(null);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, [resizingTarget, sidebarCollapsed, sidebarWidth]);

  const navigateTab = useCallback(
    (nextTab: ActiveTab, nextFilter?: VaultFilter) => {
      const targetFilter = nextFilter ?? (nextTab === 'vault' ? filter : 'all');
      if (nextTab === activeTab && targetFilter === filter) return;
      navHistoryRef.current = [
        ...navHistoryRef.current.slice(-19),
        { tab: activeTab, filter },
      ];
      setActiveTab(nextTab);
      if (nextFilter !== undefined) {
        setFilter(nextFilter);
      }
    },
    [activeTab, filter]
  );

  // 30-second Clipboard Auto-Clear countdown
  const [clipboardTimer, setClipboardTimer] = useState<{ label: string; secondsLeft: number } | null>(
    null
  );

  // Smooth opening transition + restore last local session on mount if IndexedDB profile exists
  useEffect(() => {
    let cancelled = false;
    let timerId: number | null = null;
    const startedAt = Date.now();
    const savedPrefs = loadUiPreferences();

    const finishBoot = () => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 320 - elapsed);
      timerId = window.setTimeout(() => {
        if (!cancelled) setIsBooting(false);
      }, remaining);
    };

    if (savedPrefs.lastUserId && vaultStore.getState().lockState === 'unauthenticated') {
      void pwaDb.profiles
        .get(savedPrefs.lastUserId)
        .then(async (profile) => {
          if (!cancelled && profile) {
            await hydrateSession(savedPrefs.lastUserId!);
          }
        })
        .finally(finishBoot);
    } else {
      finishBoot();
    }

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [hydrateSession]);

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

  // Intercept browser/mobile Back button so it steps back in-app or returns to Vault,
  // and prompts for confirmation before exiting from the Vault root.
  const backHandlerRef = useRef<() => void>(() => {});
  backHandlerRef.current = () => {
    if (exitingRef.current) return;

    window.history.pushState({ passVaultGuard: true }, '');

    if (exitConfirmOpen) {
      setExitConfirmOpen(false);
      return;
    }

    if (lockState === 'unauthenticated' || !userId) {
      if (authMode === 'create') {
        setAuthMode('signin');
        setAuthError(null);
        return;
      }
      setExitConfirmOpen(true);
      return;
    }

    if (lockState !== 'unlocked') {
      setExitConfirmOpen(true);
      return;
    }

    if (formOpen) {
      setFormOpen(false);
      setEditingItem(null);
      setPrefillSecret(undefined);
      return;
    }
    if (paletteOpen) {
      setPaletteOpen(false);
      return;
    }
    if (mobileSheetOpen) {
      setMobileSheetOpen(false);
      return;
    }
    setExitConfirmOpen(true);
  };

  useEffect(() => {
    if (isBooting) return;
    if (Capacitor.isNativePlatform()) {
      const listenerPromise = CapApp.addListener('backButton', () => {
        backHandlerRef.current();
      });
      return () => {
        void listenerPromise.then((handle) => handle.remove());
      };
    }
    if (!(window.history.state as { passVaultRoot?: boolean; passVaultGuard?: boolean } | null)?.passVaultRoot &&
        !(window.history.state as { passVaultGuard?: boolean } | null)?.passVaultGuard) {
      window.history.replaceState({ passVaultRoot: true }, '');
    }
    const armGuardOnGesture = () => {
      if (exitingRef.current) return;
      if (!(window.history.state as { passVaultGuard?: boolean } | null)?.passVaultGuard) {
        window.history.pushState({ passVaultGuard: true }, '');
      }
    };
    const onPopState = () => {
      backHandlerRef.current();
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pointerdown', armGuardOnGesture, { passive: true });
    window.addEventListener('keydown', armGuardOnGesture, { passive: true });
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pointerdown', armGuardOnGesture);
      window.removeEventListener('keydown', armGuardOnGesture);
    };
  }, [isBooting]);

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
    const tagQuery = q.startsWith('#') ? q.slice(1) : q;

    return items
      .filter((item) => {
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
        const accountIdMatch =
          (item.category === 'login' || item.category === 'note') &&
          (item.accountId ?? '').toLowerCase().includes(q);
        const tagMatch =
          tagQuery.length > 0 && item.tags.some((t) => t.toLowerCase().includes(tagQuery));
        return (
          item.title.toLowerCase().includes(q) ||
          sub.includes(q) ||
          accountIdMatch ||
          tagMatch
        );
      })
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) {
          return a.isFavorite ? -1 : 1;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [items, activeTab, filter, searchQuery]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? filteredItems[0] ?? null,
    [items, selectedId, filteredItems]
  );

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (masterInput.length < 8) {
      setAuthError('Master Password should be at least 8 characters.');
      return;
    }

    if (authMode === 'create') {
      if (masterInput !== confirmMasterInput) {
        setAuthError('Master Passwords do not match.');
        return;
      }
      if (pinInput && !/^\d{6}$/.test(pinInput)) {
        setAuthError('Quick-Unlock PIN must be exactly 6 numeric digits (or leave blank).');
        return;
      }
    }

    const trimmedAlias = aliasInput.trim();
    if (supabaseClient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedAlias)) {
      setAuthError('Enter a valid email address (e.g. yourname+vault@gmail.com) for cloud sync.');
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    setAuthStepLabel(
      authMode === 'signin'
        ? 'Authenticating with Cloud Vault…'
        : 'Registering Encrypted Cloud Vault…'
    );
    try {
      let resolvedUserId: string;
      let resolvedLabel: string;

      if (supabaseClient) {
        const cloudAuth = await authenticateSupabaseVaultUser(
          supabaseClient,
          trimmedAlias,
          masterInput,
          authMode === 'signin' ? 'signin' : 'signup'
        );
        resolvedUserId = cloudAuth.userId;
        resolvedLabel = cloudAuth.email;

        setAuthStepLabel(
          authMode === 'signin'
            ? 'Deriving Argon2id keys & decrypting vault…'
            : 'Deriving Argon2id keys & sealing new vault…'
        );

        const existingProfile =
          (await remoteAdapter.getProfile(resolvedUserId)) ??
          (await pwaDb.profiles.get(resolvedUserId));

        if (authMode === 'signin') {
          if (!existingProfile) {
            throw new Error(
              'No encrypted vault profile found for this account. Please create a vault first.'
            );
          }
          await unlockWithMasterPassword(resolvedUserId, masterInput);
        } else {
          if (existingProfile) {
            throw new Error('An encrypted vault already exists for this email. Please Sign In instead.');
          }
          await initializeNewVault(resolvedUserId, masterInput, 'argon2id');
          await syncNow();
        }
      } else {
        setAuthStepLabel(
          authMode === 'signin'
            ? 'Deriving Argon2id keys & decrypting vault…'
            : 'Deriving Argon2id keys & sealing new vault…'
        );

        if (authMode === 'signin') {
          const profiles = await pwaDb.profiles.toArray();
          const localProfile = profiles[0];
          if (!localProfile) {
            throw new Error('No local vault found on this device. Switch to Create Encrypted Vault.');
          }
          resolvedUserId = localProfile.user_id;
          resolvedLabel = trimmedAlias || 'Personal Vault';
          await unlockWithMasterPassword(resolvedUserId, masterInput);
        } else {
          resolvedUserId = globalThis.crypto.randomUUID();
          resolvedLabel = trimmedAlias || 'Personal Vault';
          await initializeNewVault(resolvedUserId, masterInput, 'argon2id');
        }
      }

      if (authMode === 'create' && pinInput) {
        await enableQuickPin(pinInput);
      }
      const nextPrefs = saveUiPreferences({
        lastUserId: resolvedUserId,
        aliasLabel: resolvedLabel,
        isDemoMode: false,
      });
      setPrefs(nextPrefs);
      setMasterInput('');
      setConfirmMasterInput('');
      setPinInput('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to unlock or create vault');
    } finally {
      setAuthBusy(false);
      setAuthStepLabel(null);
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

  const handleDeletePasswordHistoryEntry = async (item: DecryptedVaultItem, entryIndex: number) => {
    if (item.category !== 'login') return;
    await saveItem({
      ...item,
      passwordHistory: item.passwordHistory.filter((_, idx) => idx !== entryIndex),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleClearPasswordHistory = async (item: DecryptedVaultItem) => {
    if (item.category !== 'login') return;
    await saveItem({
      ...item,
      passwordHistory: [],
      updatedAt: new Date().toISOString(),
    });
  };

  const updateAvailableModal = availableUpdate ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={() => {
        sessionStorage.setItem('pass_vault_dismissed_update', availableUpdate.version);
        setAvailableUpdate(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-vault-title"
        className="vault-scale-in w-full max-w-sm rounded-2xl bg-[var(--bg-elevated)] border border-[var(--accent-primary)]/45 p-5 space-y-4 shadow-[0_16px_48px_rgba(0,0,0,0.75)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-[var(--accent-soft)]" />
          </div>
          <div>
            <h2 id="update-vault-title" className="text-sm font-bold text-[var(--text-primary)]">
              Update Available (v{availableUpdate.version})
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {availableUpdate.notes ?? `A newer version of Pass-Vault is ready (current v${APP_VERSION}).`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem('pass_vault_dismissed_update', availableUpdate.version);
              setAvailableUpdate(null);
            }}
            className="py-2.5 px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-white/10 border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)]"
          >
            Later
          </button>
          {Capacitor.isNativePlatform() ? (
            <a
              href={availableUpdate.apkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAvailableUpdate(null)}
              className="py-2.5 px-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-xs font-semibold text-white text-center shadow-[0_0_16px_rgba(139,92,246,0.35)]"
            >
              Download Update
            </a>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="py-2.5 px-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-xs font-semibold text-white shadow-[0_0_16px_rgba(139,92,246,0.35)]"
            >
              Reload App
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const exitConfirmModal = exitConfirmOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={() => setExitConfirmOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-vault-title"
        className="vault-scale-in w-full max-w-sm rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 space-y-4 shadow-[0_16px_48px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-[var(--accent-soft)]" />
          </div>
          <div>
            <h2 id="exit-vault-title" className="text-sm font-bold text-[var(--text-primary)]">
              Close Pass-Vault?
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {lockState === 'unlocked'
                ? 'Your vault will lock and clear decrypted keys from memory.'
                : 'Are you sure you want to close Pass-Vault?'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setExitConfirmOpen(false)}
            className="py-2.5 px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-white/10 border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)]"
          >
            {lockState === 'unlocked' ? 'Stay in Vault' : 'Stay in App'}
          </button>
          <button
            type="button"
            onClick={() => {
              exitingRef.current = true;
              setExitConfirmOpen(false);
              if (lockState === 'unlocked') {
                lockVault();
              }
              if (Capacitor.isNativePlatform()) {
                void CapApp.exitApp();
                return;
              }
              window.close();
              window.history.go(-2);
            }}
            className="py-2.5 px-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-xs font-semibold text-red-300"
          >
            {lockState === 'unlocked' ? 'Lock & Exit' : 'Close App'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // 0. App Opening Boot Splash Transition
  if (isBooting) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
        <div className="vault-fade-in flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center vault-shield-pulse">
            <Shield className="w-8 h-8 text-[var(--accent-soft)]" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Pass-Vault
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Initializing zero-knowledge cryptographic engine…
            </p>
          </div>
          <div className="h-1 w-44 rounded-full vault-shimmer-bar" />
        </div>
      </div>
    );
  }

  // 1. Auth / Onboarding Gate
  if (lockState === 'unauthenticated' || !userId) {
    const signInGifs = [
      '/signin-bg.gif',
      '/signin-bg-2.gif',
      '/signin-bg-3.gif',
      '/signin-bg-4.gif',
    ];
    return (
      <div className="relative min-h-dvh w-full overflow-hidden bg-[var(--bg-primary)] flex items-center justify-center px-4 py-10">
        {signInGifs.map((src, idx) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none fixed inset-0 h-full w-full object-cover scale-105 transition-opacity duration-1000 ${
              idx === bgGifIndex ? 'opacity-75' : 'opacity-0'
            }`}
          />
        ))}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#09090b]/45 via-[#120d1f]/35 to-[#09090b]/60"
        />
        <div className="vault-fade-in relative z-10 w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center shadow-[0_0_36px_rgba(139,92,246,0.3)] backdrop-blur-sm">
              <Shield className="w-8 h-8 text-[var(--accent-soft)]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Pass-Vault
            </h1>
            <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
              Zero-knowledge encrypted vault for passwords, PINs, cards, and recovery notes.
            </p>
          </div>

          {/* Sign In or Create Encrypted Vault */}
          <form
            onSubmit={(e) => void handleAuthSubmit(e)}
            className="relative overflow-hidden rounded-2xl bg-[var(--bg-elevated)]/90 backdrop-blur-md border border-[var(--border-subtle)] p-5 shadow-2xl"
          >
            {authBusy && (
              <div className="vault-fade-in absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[var(--bg-elevated)]/90 backdrop-blur-sm px-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center vault-shield-pulse">
                  <Shield className="w-6 h-6 text-[var(--accent-soft)]" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {authStepLabel ?? 'Securing Vault Session…'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Client-side Argon2id + AES-256-GCM
                  </p>
                </div>
                <div className="h-1.5 w-48 rounded-full vault-shimmer-bar" />
              </div>
            )}

            <div key={authMode} className="vault-scale-in space-y-3.5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {authMode === 'signin' ? 'Sign In to Cloud Vault' : 'Create Encrypted Vault'}
              </h2>

              {authError && (
                <p className="vault-fade-in text-xs text-[var(--status-danger)]">{authError}</p>
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
                <SecretInput
                  required
                  value={masterInput}
                  onChange={(e) => setMasterInput(e.target.value)}
                  placeholder="Minimum 8 characters"
                  revealLabel="Show master password"
                  hideLabel="Hide master password"
                />
              </div>

              {authMode === 'create' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                      Confirm Master Password *
                    </label>
                    <SecretInput
                      required
                      value={confirmMasterInput}
                      onChange={(e) => setConfirmMasterInput(e.target.value)}
                      placeholder="Re-enter Master Password"
                      revealLabel="Show confirm master password"
                      hideLabel="Hide confirm master password"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                      6-Digit Quick-Unlock PIN (optional)
                    </label>
                    <SecretInput
                      inputMode="numeric"
                      maxLength={6}
                      maxIndicatorLength={6}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 048291"
                      revealLabel="Show Quick-Unlock PIN"
                      hideLabel="Hide Quick-Unlock PIN"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-sm font-semibold text-white shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all disabled:opacity-60"
              >
                {authBusy
                  ? authMode === 'signin'
                    ? 'Authenticating & Decrypting Vault…'
                    : 'Creating Encrypted Vault (Argon2id)…'
                  : authMode === 'signin'
                    ? 'Sign In'
                    : 'Create Encrypted Vault'}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode((prev) => (prev === 'signin' ? 'create' : 'signin'));
                    setAuthError(null);
                    setConfirmMasterInput('');
                    setPinInput('');
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {authMode === 'signin' ? (
                    <>
                      New to Pass-Vault?{' '}
                      <span className="font-semibold text-[var(--accent-soft)] hover:underline">
                        Create Encrypted Vault
                      </span>
                    </>
                  ) : (
                    <>
                      Already have a vault?{' '}
                      <span className="font-semibold text-[var(--accent-soft)] hover:underline">
                        Sign In
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
        {updateAvailableModal}
        {exitConfirmModal}
      </div>
    );
  }

  // 2. Lock Screen Overlay (PIN / Biometrics / Master Password)
  if (lockState !== 'unlocked') {
    return (
      <>
        <LockOverlay aliasLabel={prefs.aliasLabel} isDemoMode={prefs.isDemoMode} />
        {updateAvailableModal}
        {exitConfirmModal}
      </>
    );
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
    <div className="h-dvh overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col md:flex-row">
      {/* Desktop Left Sidebar (>= 768px) */}
      <aside
        style={{ ['--sidebar-w' as string]: `${sidebarCollapsed ? 64 : sidebarWidth}px` }}
        className={`vault-fade-in hidden md:flex md:w-[var(--sidebar-w)] shrink-0 flex-col justify-between bg-[var(--bg-elevated)] ${
          sidebarCollapsed ? 'items-center py-4 px-2' : 'p-4'
        } ${resizingTarget === null ? 'transition-[width] duration-200 ease-out' : ''}`}
      >
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="w-9 h-9 rounded-xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center hover:border-[var(--accent-primary)] hover:shadow-[0_0_16px_rgba(139,92,246,0.35)] transition-all"
            >
              <Shield className="w-4 h-4 text-[var(--accent-soft)]" />
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Quick Search (Ctrl/Cmd+K)"
              aria-label="Quick Search"
              className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:border-[var(--accent-primary)] transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-[var(--accent-soft)]" />
                  </div>
                  <span className="font-bold tracking-tight text-sm truncate">Pass-Vault</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(true)}
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-surface)] transition-colors"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={lockVault}
                    title="Lock Vault"
                    aria-label="Lock Vault"
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-surface)] transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                </div>
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
                  onClick={() => navigateTab('vault', nav.id)}
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
              onClick={() => navigateTab('generator')}
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
              onClick={() => navigateTab('import')}
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
              onClick={() => navigateTab('settings')}
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
          </>
        )}
      </aside>

      {/* Desktop Sidebar Resize Handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={(e) => {
          e.preventDefault();
          setResizingTarget('sidebar');
        }}
        onDoubleClick={() => setSidebarCollapsed((c) => !c)}
        title="Drag to resize sidebar (double-click to toggle)"
        className="hidden md:flex items-center justify-center w-1.5 -mx-[2px] z-20 cursor-col-resize group select-none shrink-0"
      >
        <div
          className={`h-full transition-all duration-150 ${
            resizingTarget === 'sidebar'
              ? 'w-[2px] bg-[var(--accent-primary)] shadow-[0_0_12px_rgba(139,92,246,0.65)]'
              : 'w-px bg-[var(--border-subtle)] group-hover:w-[2px] group-hover:bg-[var(--accent-primary)] group-hover:shadow-[0_0_10px_rgba(139,92,246,0.5)]'
          }`}
        />
      </div>

      {/* Main Content Area */}
      <main className="vault-fade-in flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile Header (< 768px) */}
        <header className="md:hidden shrink-0 z-30 bg-[var(--bg-primary)]/95 backdrop-blur border-b border-[var(--border-subtle)] px-4 pt-3 pb-2.5 space-y-2.5">
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
                  placeholder="Search items or #tags…"
                  className="w-full rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] pl-9 pr-3.5 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              {activeTab === 'vault' && (
                <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
                  {categoryNav.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => navigateTab('vault', pill.id)}
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
          <div key="tab-generator" className="vault-fade-in p-4 pb-28 md:p-8 flex-1 overflow-y-auto">
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
          <div key="tab-import" className="vault-fade-in p-4 pb-28 md:p-8 flex-1 overflow-y-auto">
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
          <div key="tab-settings" className="vault-fade-in p-4 pb-28 md:p-8 flex-1 overflow-y-auto">
            <SettingsView
              autoLockSeconds={prefs.autoLockSeconds}
              onChangeAutoLock={(sec) => {
                setPrefs(saveUiPreferences({ autoLockSeconds: sec }));
              }}
              aliasLabel={prefs.aliasLabel}
              isDemoMode={prefs.isDemoMode}
              canInstallApp={Boolean(installPrompt)}
              onInstallApp={async () => {
                if (!installPrompt) return false;
                await installPrompt.prompt();
                const choice = await installPrompt.userChoice;
                if (choice.outcome === 'accepted') {
                  setInstallPrompt(null);
                }
                return choice.outcome === 'accepted';
              }}
            />
          </div>
        ) : (
          <div key="tab-vault" className="vault-fade-in flex-1 flex min-h-0">
            {/* Item List Column (Full-width mobile / resizable desktop) */}
            <section
              style={{ ['--list-w' as string]: `${listWidth}px` }}
              className="w-full md:w-[var(--list-w)] shrink-0 flex flex-col min-h-0"
            >
              {/* Desktop Search Header */}
              <div className="hidden md:flex items-center gap-2 p-4 border-b border-[var(--border-subtle)]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter items or #tags…"
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

              <div className="flex-1 overflow-y-auto p-3 md:p-3 pb-28 md:pb-4">
                <div key={`${activeTab}-${filter}`} className="vault-fade-in space-y-2">
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
              </div>
            </section>

            {/* Desktop List / Detail Resize Handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize item list"
              onPointerDown={(e) => {
                e.preventDefault();
                setResizingTarget('list');
              }}
              onDoubleClick={() => setListWidth(360)}
              title="Drag to resize list pane (double-click to reset)"
              className="hidden md:flex items-center justify-center w-1.5 -mx-[2px] z-20 cursor-col-resize group select-none shrink-0"
            >
              <div
                className={`h-full transition-all duration-150 ${
                  resizingTarget === 'list'
                    ? 'w-[2px] bg-[var(--accent-primary)] shadow-[0_0_12px_rgba(139,92,246,0.65)]'
                    : 'w-px bg-[var(--border-subtle)] group-hover:w-[2px] group-hover:bg-[var(--accent-primary)] group-hover:shadow-[0_0_10px_rgba(139,92,246,0.5)]'
                }`}
              />
            </div>

            {/* Desktop Right Detail Inspector (>= 768px) */}
            <section className="hidden md:block flex-1 overflow-y-auto p-6 lg:p-8">
              {selectedItem ? (
                <div key={selectedItem.id} className="vault-fade-in max-w-2xl">
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
                    onDeletePasswordHistoryEntry={handleDeletePasswordHistoryEntry}
                    onClearPasswordHistory={handleClearPasswordHistory}
                    selectedTag={
                      searchQuery.trim().startsWith('#') ? searchQuery.trim().slice(1) : null
                    }
                    onSelectTag={(tag) => {
                      setActiveTab('vault');
                      setSearchQuery((prev) =>
                        prev.trim().toLowerCase() === `#${tag.toLowerCase()}` ? '' : `#${tag}`
                      );
                    }}
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
          className="md:hidden fixed inset-0 z-40 flex items-end bg-black/70 backdrop-blur-xs transition-opacity"
          onClick={() => setMobileSheetOpen(false)}
        >
          <div
            className="vault-slide-up w-full max-h-[88vh] overflow-y-auto rounded-t-3xl bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] p-5 pb-8"
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
              onDeletePasswordHistoryEntry={handleDeletePasswordHistoryEntry}
              onClearPasswordHistory={handleClearPasswordHistory}
              selectedTag={
                searchQuery.trim().startsWith('#') ? searchQuery.trim().slice(1) : null
              }
              onSelectTag={(tag) => {
                setMobileSheetOpen(false);
                setActiveTab('vault');
                setSearchQuery((prev) =>
                  prev.trim().toLowerCase() === `#${tag.toLowerCase()}` ? '' : `#${tag}`
                );
              }}
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
          className="md:hidden fixed right-5 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 w-14 h-14 rounded-2xl bg-[var(--accent-primary)] text-white flex items-center justify-center shadow-[0_6px_28px_rgba(139,92,246,0.5)] active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Mobile Fixed Glassmorphism Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#121217]/75 backdrop-blur-xl border-t border-white/10 shadow-[0_-10px_35px_rgba(0,0,0,0.5)] grid grid-cols-5 gap-1 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
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
              onClick={() => navigateTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[11px] font-medium transition-all duration-200 ${
                active
                  ? 'bg-[var(--accent-tint)] text-[var(--accent-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-200 ${active ? 'scale-105' : ''}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 30-Second Clipboard Auto-Clear Countdown Toast */}
      {clipboardTimer && (
        <div className="vault-slide-up fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-[var(--bg-elevated)]/90 backdrop-blur-xl border border-[var(--accent-primary)]/50 shadow-[0_8px_32px_rgba(0,0,0,0.65)] text-xs whitespace-nowrap">
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

      {/* Update & Exit Confirmation Modals */}
      {updateAvailableModal}
      {exitConfirmModal}
    </div>
  );
}
