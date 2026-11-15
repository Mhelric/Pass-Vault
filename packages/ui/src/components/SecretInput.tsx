import { Eye, EyeOff } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from 'react';

export interface SecretInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Allow toggling visibility via the inline eye button. Defaults to true. */
  showToggle?: boolean;
  /** Accessible label when secret is hidden. */
  revealLabel?: string;
  /** Accessible label when secret is visible. */
  hideLabel?: string;
  /** Target character count for the live animated typing bar. Defaults to 16. */
  maxIndicatorLength?: number;
  /** Use compact sizing (e.g. browser extension popup or inline restore input). */
  compact?: boolean;
  /** Extra classes for the outer relative wrapper. */
  containerClassName?: string;
}

/**
 * Clean, sans-serif secret input with an inline Eye/EyeOff toggle and a lively
 * keystroke glow + animated progress underline that responds smoothly as you type.
 */
export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function SecretInput(
  {
    showToggle = true,
    revealLabel = 'Show secret',
    hideLabel = 'Hide secret',
    maxIndicatorLength = 16,
    compact = false,
    containerClassName = '',
    className = '',
    value,
    onChange,
    ...rest
  },
  ref
) {
  const [revealed, setRevealed] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setIsTyping(true);
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      setIsTyping(false);
    }, 220);

    onChange?.(e);
  };

  const strValue = typeof value === 'string' ? value : '';
  const hasValue = strValue.length > 0;
  const progressPct = Math.min(100, Math.round((strValue.length / maxIndicatorLength) * 100));

  const baseSizing = compact
    ? `rounded-lg pl-2.5 ${showToggle ? 'pr-8' : 'pr-2.5'} py-1.5 text-xs`
    : `rounded-xl pl-3.5 ${showToggle ? 'pr-10' : 'pr-3.5'} py-2.5 text-sm`;

  return (
    <div
      className={`relative overflow-hidden ${compact ? 'rounded-lg' : 'rounded-xl'} ${containerClassName}`}
    >
      <input
        ref={ref}
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={handleInputChange}
        className={`w-full font-secret bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:tracking-normal focus:outline-none focus:border-[var(--accent-primary)] ${baseSizing} ${
          !revealed && hasValue ? 'tracking-[0.16em]' : 'tracking-[0.015em]'
        } ${isTyping ? 'vault-typing-pulse' : ''} ${className}`}
        {...rest}
      />

      {showToggle && (
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          aria-label={revealed ? hideLabel : revealLabel}
          title={revealed ? hideLabel : revealLabel}
          className={`absolute top-1/2 -translate-y-1/2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ${
            compact ? 'right-1.5 p-0.5' : 'right-2.5 p-1'
          }`}
        >
          <span key={revealed ? 'hide' : 'show'} className="vault-scale-in inline-flex">
            {revealed ? (
              <EyeOff className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            ) : (
              <Eye className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            )}
          </span>
        </button>
      )}

      {/* Smooth live typing progress underline */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] bg-transparent"
      >
        <div
          style={{ width: `${progressPct}%` }}
          className={`h-full rounded-full bg-gradient-to-r from-[var(--accent-primary)] via-[var(--accent-glow)] to-[var(--accent-soft)] transition-all duration-200 ease-out ${
            hasValue ? 'opacity-90' : 'opacity-0'
          }`}
        />
      </div>
    </div>
  );
});
