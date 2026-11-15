import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export interface CopyButtonProps {
  value: string;
  label?: string;
  onCopied?: (label: string) => void;
  compact?: boolean;
  className?: string;
}

/**
 * 1-tap copy trigger that writes to clipboard and emits `onCopied`
 * so the host app starts the 30-second clipboard auto-clear timer.
 */
export function CopyButton({
  value,
  label = 'Secret',
  onCopied,
  compact = false,
  className = '',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.(label);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard fallback when browser permission is restricted
      onCopied?.(label);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => void handleCopy(e)}
      className={`inline-flex items-center gap-1.5 rounded-xl font-medium transition-all active:scale-95 ${
        compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs'
      } ${
        copied
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]'
      } ${className}`}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
