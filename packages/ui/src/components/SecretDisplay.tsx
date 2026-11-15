import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export interface SecretDisplayProps {
  value: string;
  defaultRevealed?: boolean;
  maskedCount?: number;
  className?: string;
  allowToggle?: boolean;
}

function classifyCharColor(ch: string): string {
  if (/\d/.test(ch)) {
    return 'var(--secret-digit)';
  }
  if (/[^a-zA-Z0-9\s]/.test(ch)) {
    return 'var(--secret-symbol)';
  }
  return 'var(--secret-letter)';
}

/**
 * Renders sensitive strings (passwords, PINs, card numbers, CVVs) in clean tabular typography
 * with color-coded character classes and toggleable visibility.
 */
export function SecretDisplay({
  value,
  defaultRevealed = false,
  maskedCount = 10,
  className = '',
  allowToggle = true,
}: SecretDisplayProps) {
  const [revealed, setRevealed] = useState(defaultRevealed);

  return (
    <div className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      <span
        className="font-mono-secret text-sm tracking-wide break-all select-all"
        aria-label={revealed ? value : 'Hidden secret'}
      >
        {revealed ? (
          Array.from(value).map((ch, idx) => (
            <span key={idx} style={{ color: classifyCharColor(ch) }}>
              {ch}
            </span>
          ))
        ) : (
          <span className="text-[var(--text-muted)] tracking-widest">
            {'•'.repeat(Math.min(Math.max(value.length || maskedCount, 4), 14))}
          </span>
        )}
      </span>

      {allowToggle && (
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          className="shrink-0 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
          aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
          title={revealed ? 'Hide' : 'Reveal'}
        >
          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
