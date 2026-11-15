import {
  exportEncryptedVaultBackup,
  restoreEncryptedVaultBackup,
  serializeVaultBackup,
  type DecryptedVaultItem,
} from '@vault/core';
import { evaluateSecretStrength, isPlatformBiometricAvailable, randomBytes } from '@vault/crypto';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Fingerprint,
  HardDriveUpload,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_BIO_SECRET_STORAGE_KEY } from '../demoSeed.js';
import { isSupabaseConfigured, pwaDb, useVault } from '../vaultRuntime.js';

export interface SettingsViewProps {
  autoLockSeconds: number;
  onChangeAutoLock: (seconds: number) => void;
  aliasLabel: string | null;
  isDemoMode: boolean;
}

export function SettingsView({
  autoLockSeconds,
  onChangeAutoLock,
  aliasLabel,
  isDemoMode,
}: SettingsViewProps) {
  const userId = useVault((s) => s.userId);
  const items = useVault((s) => s.items);
  const hasPinConfigured = useVault((s) => s.hasPinConfigured);
  const hasBiometricsConfigured = useVault((s) => s.hasBiometricsConfigured);
  const enableQuickPin = useVault((s) => s.enableQuickPin);
  const enableBiometricUnlock = useVault((s) => s.enableBiometricUnlock);
  const unlockWithMasterPassword = useVault((s) => s.unlockWithMasterPassword);
  const lockVault = useVault((s) => s.lockVault);
  const signOut = useVault((s) => s.signOut);

  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [bioHardwareSupported, setBioHardwareSupported] = useState(false);

  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestoreJson, setPendingRestoreJson] = useState<string | null>(null);
  const [restoreMasterPassword, setRestoreMasterPassword] = useState('');
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    void isPlatformBiometricAvailable().then(setBioHardwareSupported);
  }, []);

  // Offline Vault Health Audit (runs strictly in RAM)
  const healthAudit = useMemo(() => {
    const passwordCounts = new Map<string, number>();
    const weakItems: Array<{ item: DecryptedVaultItem; reason: string }> = [];

    for (const item of items) {
      if (item.category === 'login') {
        passwordCounts.set(item.password, (passwordCounts.get(item.password) ?? 0) + 1);
        const check = evaluateSecretStrength(item.password, 'password');
        if (check.isWeak) {
          weakItems.push({ item, reason: check.reasons[0] ?? 'Weak password' });
        }
      } else if (item.category === 'pin') {
        const check = evaluateSecretStrength(item.pinCode, 'pin');
        if (check.isWeak) {
          weakItems.push({ item, reason: check.reasons[0] ?? 'Predictable PIN' });
        }
      }
    }

    const reusedLogins = items.filter(
      (item) => item.category === 'login' && (passwordCounts.get(item.password) ?? 0) > 1
    );

    return { weakItems, reusedLogins };
  }, [items]);

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    if (!/^\d{6}$/.test(newPin)) {
      setPinMsg('PIN must be exactly 6 digits');
      return;
    }
    await enableQuickPin(newPin);
    setNewPin('');
    setPinMsg('Quick-Unlock PIN updated and wrapped locally.');
  };

  const handleEnrollBiometrics = async () => {
    const secret = randomBytes(32);
    await enableBiometricUnlock(secret, 'local-platform-authenticator');
    sessionStorage.setItem(
      DEMO_BIO_SECRET_STORAGE_KEY,
      btoa(String.fromCharCode(...secret))
    );
    secret.fill(0);
    setPinMsg('Biometric unlock configured on this device.');
  };

  const handleExportBackup = async () => {
    if (!userId) return;
    setBackupError(null);
    setBackupMsg(null);
    try {
      const backup = await exportEncryptedVaultBackup(pwaDb, userId);
      const serialized = serializeVaultBackup(backup);
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `obsidian-vault-backup-${dateStr}.vault`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg(`Exported ${backup.items.length} encrypted items to .vault backup.`);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to export backup');
    }
  };

  const handleSelectRestoreFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBackupError(null);
    setBackupMsg(null);
    setPendingRestoreJson(await file.text());
  };

  const handleConfirmRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !pendingRestoreJson || !restoreMasterPassword) return;
    setBackupError(null);
    setBackupMsg(null);
    setIsRestoring(true);
    try {
      const result = await restoreEncryptedVaultBackup({
        backupJson: pendingRestoreJson,
        masterPassword: restoreMasterPassword,
        db: pwaDb,
        targetUserId: userId,
      });
      await unlockWithMasterPassword(userId, restoreMasterPassword);
      setPendingRestoreJson(null);
      setRestoreMasterPassword('');
      setBackupMsg(`Restored ${result.restoredCount} encrypted item(s) from backup.`);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Backup decryption failed');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-24 md:pb-8">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Security & Settings</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {aliasLabel ?? 'Personal Zero-Knowledge Vault'} •{' '}
          {isSupabaseConfigured ? 'Supabase Cloud Sync Active' : isDemoMode ? 'Local Encrypted Demo Mode' : 'Local IndexedDB Mode'}
        </p>
      </div>

      {/* Daily Unlock Controls */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <KeyRound className="w-4 h-4 text-[var(--accent-soft)]" />
          <span>6-Digit Quick-Unlock PIN</span>
          <span
            className={`ml-auto px-2 py-0.5 rounded-full text-[11px] ${
              hasPinConfigured
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            {hasPinConfigured ? 'Active' : 'Not Set'}
          </span>
        </div>

        <form onSubmit={(e) => void handleSavePin(e)} className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter 6-digit PIN"
            className="flex-1 font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white"
          >
            {hasPinConfigured ? 'Change PIN' : 'Enable PIN'}
          </button>
        </form>

        {pinMsg && <p className="text-xs text-emerald-300">{pinMsg}</p>}

        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <Fingerprint className="w-4 h-4 text-[var(--accent-soft)]" />
              <span>FaceID / Fingerprint Unlock</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {bioHardwareSupported
                ? 'Platform biometric authenticator detected'
                : 'Browser preview mode (WebAuthn ready on HTTPS mobile/desktop)'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleEnrollBiometrics()}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              hasBiometricsConfigured
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--accent-primary)]'
            }`}
          >
            {hasBiometricsConfigured ? 'Enabled' : 'Enable'}
          </button>
        </div>

        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Timer className="w-4 h-4 text-[var(--accent-soft)]" />
            <span>Background Auto-Lock</span>
          </div>
          <select
            value={autoLockSeconds}
            onChange={(e) => onChangeAutoLock(Number(e.target.value))}
            className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          >
            <option value={0}>Immediate on tab hide</option>
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
        </div>
      </div>

      {/* Offline Security Health */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <ShieldCheck className="w-4 h-4 text-[var(--accent-soft)]" />
          <span>Offline Vault Health</span>
        </div>

        {healthAudit.weakItems.length === 0 && healthAudit.reusedLogins.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3.5 py-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>All {items.length} vault items use unique, strong secrets.</span>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            {healthAudit.reusedLogins.length > 0 && (
              <div className="flex items-start gap-2 text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {healthAudit.reusedLogins.length} logins share a duplicate password (
                  {healthAudit.reusedLogins.map((i) => i.title).join(', ')}).
                </span>
              </div>
            )}
            {healthAudit.weakItems.map(({ item, reason }) => (
              <div
                key={item.id}
                className="flex items-start gap-2 text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>{item.title}:</strong> {reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Encrypted Offline Backup (.vault) */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              Encrypted Offline Backup (.vault)
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Standalone zero-knowledge backup file decryptable offline with your Master Password.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => void handleExportBackup()}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-xs font-semibold text-white shadow-[0_0_16px_rgba(139,92,246,0.3)]"
          >
            <Download className="w-4 h-4" />
            Export .vault Backup
          </button>

          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-white/10 border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)]"
          >
            <HardDriveUpload className="w-4 h-4 text-[var(--accent-soft)]" />
            Restore .vault File
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".vault,.json"
            onChange={(e) => {
              void handleSelectRestoreFile(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>

        {pendingRestoreJson && (
          <form onSubmit={(e) => void handleConfirmRestore(e)} className="flex gap-2 pt-1">
            <input
              type="password"
              required
              value={restoreMasterPassword}
              onChange={(e) => setRestoreMasterPassword(e.target.value)}
              placeholder="Backup Master Password"
              className="flex-1 font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <button
              type="submit"
              disabled={isRestoring}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isRestoring ? 'Restoring…' : 'Decrypt & Restore'}
            </button>
          </form>
        )}

        {backupMsg && <p className="text-xs text-emerald-300">{backupMsg}</p>}
        {backupError && <p className="text-xs text-[var(--status-danger)]">{backupError}</p>}
      </div>

      {/* Session Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={lockVault}
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
        >
          <Lock className="w-4 h-4 text-[var(--accent-soft)]" />
          Lock Now
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
