import { Delete, Fingerprint } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export interface PinKeypadProps {
  pinLength?: number;
  onComplete: (pin: string) => void | Promise<void>;
  onBiometric?: () => void | Promise<void>;
  biometricAvailable?: boolean;
  isSubmitting?: boolean;
  error?: string | null;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Mobile-first thumb-zone circular 6-digit PIN keypad with keyboard input support
 * and optional WebAuthn biometric quick-trigger button.
 */
export function PinKeypad({
  pinLength = 6,
  onComplete,
  onBiometric,
  biometricAvailable = false,
  isSubmitting = false,
  error = null,
}: PinKeypadProps) {
  const [digits, setDigits] = useState('');

  const handleDigit = useCallback(
    (digit: string) => {
      if (isSubmitting) return;
      setDigits((prev) => {
        if (prev.length >= pinLength) return prev;
        const next = prev + digit;
        if (next.length === pinLength) {
          queueMicrotask(() => {
            void Promise.resolve(onComplete(next)).finally(() => {
              setDigits('');
            });
          });
        }
        return next;
      });
    },
    [isSubmitting, onComplete, pinLength]
  );

  const handleBackspace = useCallback(() => {
    if (isSubmitting) return;
    setDigits((prev) => prev.slice(0, -1));
  }, [isSubmitting]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handleDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDigit, handleBackspace]);

  return (
    <div className="flex flex-col items-center w-full max-w-[300px] mx-auto select-none">
      {/* 6-dot PIN indicator */}
      <div className="flex items-center justify-center gap-3.5 mb-3" aria-label="PIN entry dots">
        {Array.from({ length: pinLength }).map((_, idx) => {
          const filled = idx < digits.length;
          return (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                filled
                  ? 'bg-[var(--accent-soft)] scale-110 shadow-[0_0_12px_rgba(168,85,247,0.65)]'
                  : error
                    ? 'border border-[var(--status-danger)] bg-transparent'
                    : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)]'
              }`}
            />
          );
        })}
      </div>

      {/* Status or error prompt */}
      <div className="min-h-[22px] mb-5 text-center">
        {error ? (
          <p className="text-xs font-medium text-[var(--status-danger)]">{error}</p>
        ) : isSubmitting ? (
          <p className="text-xs font-medium text-[var(--accent-soft)]">Verifying…</p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">Enter {pinLength}-digit quick PIN</p>
        )}
      </div>

      {/* Circular thumb-zone keypad */}
      <div className="grid grid-cols-3 gap-4 w-full">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={isSubmitting}
            onClick={() => handleDigit(digit)}
            className="h-16 w-16 mx-auto rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xl font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] active:scale-95 active:bg-[var(--accent-tint)] transition-all disabled:opacity-50"
          >
            {digit}
          </button>
        ))}

        {/* Bottom-left: Biometrics trigger */}
        <div className="flex items-center justify-center">
          {biometricAvailable && onBiometric ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void onBiometric()}
              aria-label="Unlock with FaceID or Fingerprint"
              title="Unlock with Biometrics"
              className="h-16 w-16 rounded-full bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 text-[var(--accent-soft)] flex items-center justify-center hover:bg-[var(--accent-primary)]/25 active:scale-95 transition-all"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
          ) : (
            <div className="h-16 w-16" aria-hidden="true" />
          )}
        </div>

        {/* Bottom-center: 0 */}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleDigit('0')}
          className="h-16 w-16 mx-auto rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xl font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] active:scale-95 active:bg-[var(--accent-tint)] transition-all disabled:opacity-50"
        >
          0
        </button>

        {/* Bottom-right: Backspace */}
        <button
          type="button"
          disabled={isSubmitting || digits.length === 0}
          onClick={handleBackspace}
          aria-label="Delete last digit"
          className="h-16 w-16 mx-auto rounded-full text-[var(--text-muted)] flex items-center justify-center hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] active:scale-95 transition-all disabled:opacity-30"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
