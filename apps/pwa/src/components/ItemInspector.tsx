import type { DecryptedVaultItem, PinType } from '@vault/core';
import { CategoryBadge, CopyButton, SecretDisplay } from '@vault/ui';
import { CheckSquare, ExternalLink, Pencil, Square, Star, Trash2 } from 'lucide-react';

export interface ItemInspectorProps {
  item: DecryptedVaultItem;
  onCopySecret: (label: string) => void;
  onEdit: (item: DecryptedVaultItem) => void;
  onToggleFavorite: (item: DecryptedVaultItem) => Promise<void>;
  onDelete: (item: DecryptedVaultItem) => Promise<void>;
  onToggleRecoveryCode?: (item: DecryptedVaultItem, codeIndex: number) => Promise<void>;
  onDeletePasswordHistoryEntry?: (item: DecryptedVaultItem, entryIndex: number) => Promise<void>;
  onClearPasswordHistory?: (item: DecryptedVaultItem) => Promise<void>;
}

const PIN_LABELS: Record<PinType, string> = {
  bank_atm: 'Bank / ATM / E-Wallet',
  device_phone: 'Device / Phone',
  sim_puk: 'SIM / PUK',
  door_alarm: 'Door / Alarm',
  gov_work_id: 'Gov / Work ID',
  other: 'Other',
};

function DetailField({
  label,
  value,
  secret = false,
  onCopy,
}: {
  label: string;
  value: string;
  secret?: boolean;
  onCopy?: (label: string) => void;
}) {
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)] mb-1">
          {label}
        </div>
        {secret ? (
          <SecretDisplay value={value} />
        ) : (
          <div className="text-sm text-[var(--text-primary)] break-all">{value}</div>
        )}
      </div>
      {onCopy && <CopyButton value={value} label={label} onCopied={onCopy} compact />}
    </div>
  );
}

export function ItemInspector({
  item,
  onCopySecret,
  onEdit,
  onToggleFavorite,
  onDelete,
  onToggleRecoveryCode,
  onDeletePasswordHistoryEntry,
  onClearPasswordHistory,
}: ItemInspectorProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <CategoryBadge category={item.category} />
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
              >
                #{tag}
              </span>
            ))}
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] break-words">
            {item.title}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void onToggleFavorite(item)}
            aria-label={item.isFavorite ? 'Remove favorite' : 'Favorite item'}
            className={`p-2 rounded-xl border transition-colors ${
              item.isFavorite
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-amber-300' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(item)}
            aria-label="Edit item"
            className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => void onDelete(item)}
            aria-label="Delete item"
            className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:border-red-500/40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category Fields */}
      <div className="space-y-2.5">
        {item.category === 'login' && (
          <>
            {item.email && <DetailField label="Email" value={item.email} onCopy={onCopySecret} />}
            {item.username && (
              <DetailField label="Username" value={item.username} onCopy={onCopySecret} />
            )}
            {item.accountId && <DetailField label="ID" value={item.accountId} onCopy={onCopySecret} />}
            <DetailField
              label="Password"
              value={item.password}
              secret
              onCopy={onCopySecret}
            />
            {item.urls.length > 0 && (
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3 space-y-1.5">
                <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)]">
                  Websites
                </div>
                {item.urls.map((url) => (
                  <a
                    key={url}
                    href={url.startsWith('http') ? url : `https://${url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm text-[var(--accent-soft)] hover:underline break-all"
                  >
                    <span>{url}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </>
        )}

        {item.category === 'pin' && (
          <>
            {item.pinCode && (
              <DetailField label="PIN" value={item.pinCode} secret onCopy={onCopySecret} />
            )}
            {item.passcode && (
              <DetailField label="Passcode" value={item.passcode} secret onCopy={onCopySecret} />
            )}
            <DetailField label="Type" value={PIN_LABELS[item.pinType]} />
            {item.associatedAccount && (
              <DetailField label="Account / Device" value={item.associatedAccount} />
            )}
          </>
        )}

        {item.category === 'card' && (
          <>
            <DetailField label="Cardholder" value={item.cardholderName} onCopy={onCopySecret} />
            <DetailField
              label="Card Number"
              value={item.cardNumber}
              secret
              onCopy={onCopySecret}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <DetailField
                label="Expiry"
                value={`${item.expiryMonth}/${item.expiryYear}`}
                onCopy={onCopySecret}
              />
              <DetailField label="CVV" value={item.cvv} secret onCopy={onCopySecret} />
            </div>
            {item.cardPin && (
              <DetailField label="Card PIN" value={item.cardPin} secret onCopy={onCopySecret} />
            )}
          </>
        )}

        {item.category === 'note' && (
          <>
            {item.accountId && <DetailField label="ID" value={item.accountId} onCopy={onCopySecret} />}
            <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)]">
                  Encrypted Note
                </span>
                <CopyButton value={item.content} label="Note" onCopied={onCopySecret} compact />
              </div>
              <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                {item.content}
              </p>
            </div>

            {item.recoveryCodes && item.recoveryCodes.length > 0 && (
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)]">
                  One-Time Recovery Codes
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {item.recoveryCodes.map((entry, idx) => (
                    <div
                      key={`${entry.code}-${idx}`}
                      className="flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => void onToggleRecoveryCode?.(item, idx)}
                        className="inline-flex items-center gap-2 text-left min-w-0"
                      >
                        {entry.used ? (
                          <CheckSquare className="w-4 h-4 text-[var(--accent-soft)] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        )}
                        <span
                          className={`font-mono-secret text-xs ${
                            entry.used
                              ? 'line-through text-[var(--text-muted)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {entry.code}
                        </span>
                      </button>
                      <CopyButton value={entry.code} label="Recovery Code" onCopied={onCopySecret} compact />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {item.category !== 'note' && item.notes && (
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)] mb-1">
              Notes
            </div>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{item.notes}</p>
          </div>
        )}

        {item.category === 'login' && item.passwordHistory.length > 0 && (
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)]">
                Password History ({item.passwordHistory.length})
              </div>
              {onClearPasswordHistory && (
                <button
                  type="button"
                  onClick={() => void onClearPasswordHistory(item)}
                  className="text-[11px] font-medium text-red-300/80 hover:text-red-300 transition-colors"
                >
                  Clear History
                </button>
              )}
            </div>
            {item.passwordHistory.map((hist, idx) => (
              <div
                key={`${hist.changedAt}-${idx}`}
                className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]"
              >
                <SecretDisplay value={hist.password} />
                <div className="flex items-center gap-2 shrink-0">
                  <span>{new Date(hist.changedAt).toLocaleDateString()}</span>
                  {onDeletePasswordHistoryEntry && (
                    <button
                      type="button"
                      onClick={() => void onDeletePasswordHistoryEntry(item, idx)}
                      aria-label="Delete password history entry"
                      title="Delete entry"
                      className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-2 text-[11px] text-[var(--text-muted)]">
        Last updated {new Date(item.updatedAt).toLocaleString()} • Encrypted with AES-256-GCM
      </div>
    </div>
  );
}
