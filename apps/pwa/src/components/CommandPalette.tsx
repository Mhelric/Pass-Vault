import type { DecryptedVaultItem } from '@vault/core';
import { CategoryBadge } from '@vault/ui';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getItemSubtitle, getPrimarySecret } from '../vaultRuntime.js';

export interface CommandPaletteProps {
  open: boolean;
  items: DecryptedVaultItem[];
  onClose: () => void;
  onSelectItem: (item: DecryptedVaultItem) => void;
  onCopySecret: (label: string) => void;
}

export function CommandPalette({
  open,
  items,
  onClose,
  onSelectItem,
  onCopySecret,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 8);
    return items
      .filter((item) => {
        const sub = getItemSubtitle(item).toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          sub.includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .slice(0, 8);
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        const target = filtered[selectedIndex]!;
        if (e.shiftKey && target.category === 'login') {
          const userVal = target.email || target.username;
          if (userVal) {
            void navigator.clipboard.writeText(userVal);
            onCopySecret('Username / Email');
          }
        } else {
          const primary = getPrimarySecret(target);
          void navigator.clipboard.writeText(primary.value);
          onCopySecret(primary.label);
        }
        onSelectItem(target);
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, selectedIndex, onClose, onSelectItem, onCopySecret]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-subtle)]">
          <Search className="w-4 h-4 text-[var(--accent-soft)] shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vault… (Enter copies secret, Shift+Enter copies email/user)"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] focus:outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[340px] overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No matching vault items
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  const primary = getPrimarySecret(item);
                  void navigator.clipboard.writeText(primary.value);
                  onCopySecret(primary.label);
                  onSelectItem(item);
                  onClose();
                }}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors ${
                  idx === selectedIndex
                    ? 'bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40'
                    : 'hover:bg-[var(--bg-surface)] border border-transparent'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {item.title}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate">
                    {getItemSubtitle(item)}
                  </div>
                </div>
                <CategoryBadge category={item.category} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
