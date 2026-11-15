import type { DecryptedVaultItem } from '@vault/core';
import { evaluateSecretStrength, isPlatformBiometricAvailable, randomBytes } from '@vault/crypto';
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DEMO_BIO_SECRET_STORAGE_KEY } from '../demoSeed.js';
import { isSupabaseConfigured, useVault } from '../vaultRuntime.js';

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
  const items = useVault((s) => s.items);
  const hasPinConfigured = useVault((s) => s.hasPinConfigured);
  const hasBiometricsConfigured = useVault((s) => s.hasBiometricsConfigured);
  const enableQuickPin = useVault((s) => s.enableQuickPin);
  const enableBiometricUnlock = useVault((s) => s.enableBiometricUnlock);
  const lockVault = useVault((s) => s.lockVault);
  const signOut = useVault((s) => s.signOut);

  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [bioHardwareSupported, setBioHardwareSupported] = useState(false);

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
