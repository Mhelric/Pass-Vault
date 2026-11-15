import { MAX_PIN_ATTEMPTS } from '@vault/core';
import { PinKeypad } from '@vault/ui';
import { KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { DEMO_BIO_SECRET_STORAGE_KEY } from '../demoSeed.js';
import { saveUiPreferences, useVault } from '../vaultRuntime.js';

export interface LockOverlayProps {
  aliasLabel: string | null;
  isDemoMode: boolean;
}

export function LockOverlay({ aliasLabel }: LockOverlayProps) {
  const userId = useVault((s) => s.userId);
  const lockState = useVault((s) => s.lockState);
  const failedPinAttempts = useVault((s) => s.failedPinAttempts);
  const hasPinConfigured = useVault((s) => s.hasPinConfigured);
  const hasBiometricsConfigured = useVault((s) => s.hasBiometricsConfigured);
  const lastError = useVault((s) => s.lastError);
  const unlockWithPin = useVault((s) => s.unlockWithPin);
  const unlockWithBiometrics = useVault((s) => s.unlockWithBiometrics);
  const unlockWithMasterPassword = useVault((s) => s.unlockWithMasterPassword);
  const signOut = useVault((s) => s.signOut);

  const [useMasterFallback, setUseMasterFallback] = useState(
    lockState === 'master_password_required' || !hasPinConfigured
  );
  const [masterPassword, setMasterPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const showMasterForm =
    useMasterFallback || lockState === 'master_password_required' || !hasPinConfigured;

  const handlePinComplete = async (pin: string) => {
    setLocalError(null);
    setIsBusy(true);
    try {
      const result = await unlockWithPin(pin);
      if (result.status === 'invalid_pin') {
        setLocalError(`Incorrect PIN • ${result.attemptsRemaining} of ${MAX_PIN_ATTEMPTS} tries left`);
      } else if (result.status === 'wiped') {
        setLocalError('5 failed PIN attempts reached. Local unlock keys wiped — enter Master Password.');
        setUseMasterFallback(true);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleBiometricTrigger = async () => {
    setLocalError(null);
    const demoSecretB64 = sessionStorage.getItem(DEMO_BIO_SECRET_STORAGE_KEY);
    if (!demoSecretB64) {
      setLocalError('Biometric secret unavailable in this session; enter your PIN or Master Password.');
      return;
    }

    setIsBusy(true);
    try {
      const binary = atob(demoSecretB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      await unlockWithBiometrics(bytes);
      bytes.fill(0);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Biometric unlock failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleMasterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !masterPassword) return;
    setLocalError(null);
    setIsBusy(true);
    try {
      await unlockWithMasterPassword(userId, masterPassword);
      setMasterPassword('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Invalid Master Password');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[var(--bg-primary)] px-6 py-10 overflow-y-auto">
      {/* Top 35%: Vault Status Emblem */}
      <div className="flex flex-col items-center text-center mt-4">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 flex items-center justify-center shadow-[0_0_32px_rgba(139,92,246,0.28)] mb-4">
          {lockState === 'master_password_required' ? (
            <ShieldAlert className="w-8 h-8 text-amber-300" />
          ) : (
            <ShieldCheck className="w-8 h-8 text-[var(--accent-soft)]" />
          )}
        </div>

        <h1 className="text-xl font-bold text-[var(--text-primary)]">Vault Locked</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {aliasLabel ?? 'Personal Zero-Knowledge Vault'}
        </p>
      </div>

      {/* Bottom 65%: Thumb-zone PIN Pad or Master Password Gate */}
      <div className="w-full max-w-sm mx-auto my-6">
        {!showMasterForm ? (
          <div className="space-y-6">
            <PinKeypad
              onComplete={handlePinComplete}
              onBiometric={hasBiometricsConfigured ? handleBiometricTrigger : undefined}
              biometricAvailable={hasBiometricsConfigured}
              isSubmitting={isBusy}
              error={
                localError ??
                (failedPinAttempts > 0
                  ? `${MAX_PIN_ATTEMPTS - failedPinAttempts} of ${MAX_PIN_ATTEMPTS} PIN attempts remaining`
                  : lastError)
              }
            />

            <div className="text-center">
              <button
                type="button"
                onClick={() => setUseMasterFallback(true)}
                className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--accent-soft)] transition-colors"
              >
                Unlock with Master Password instead
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleMasterSubmit(e)}
            className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <KeyRound className="w-4 h-4 text-[var(--accent-soft)]" />
              <span>Enter Master Password</span>
            </div>

            {(localError || lastError) && (
              <p className="text-xs text-[var(--status-danger)]">{localError ?? lastError}</p>
            )}

            <input
              type="password"
              required
              autoFocus
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="Master Password"
              className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />

            <button
              type="submit"
              disabled={isBusy}
              className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-sm font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.35)] disabled:opacity-60"
            >
              {isBusy ? 'Deriving Key (Argon2id)…' : 'Decrypt Vault'}
            </button>

            {hasPinConfigured && lockState === 'locked' && (
              <button
                type="button"
                onClick={() => setUseMasterFallback(false)}
                className="w-full text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Back to 6-digit PIN keypad
              </button>
            )}
          </form>
        )}
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            saveUiPreferences({ lastUserId: null, aliasLabel: null, isDemoMode: false });
            void signOut();
          }}
          className="text-xs text-[var(--text-muted)] hover:text-red-300 transition-colors"
        >
          Switch Account / Sign Out
        </button>
      </div>
    </div>
  );
}
