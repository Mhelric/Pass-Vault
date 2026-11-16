import type {
  CardItem,
  DecryptedVaultItem,
  LoginItem,
  NoteItem,
  PinItem,
  PinType,
  VaultCategory,
} from '@vault/core';
import { generatePassword, generatePin } from '@vault/crypto';
import { Wand2, X } from 'lucide-react';
import { useState } from 'react';

export interface ItemFormModalProps {
  initialItem?: DecryptedVaultItem | null;
  defaultCategory?: VaultCategory;
  prefillSecret?: string;
  onSave: (item: DecryptedVaultItem) => Promise<void>;
  onClose: () => void;
}

const PIN_TYPE_OPTIONS: Array<{ value: PinType; label: string }> = [
  { value: 'bank_atm', label: 'Bank / ATM / E-Wallet' },
  { value: 'device_phone', label: 'Device / Phone' },
  { value: 'sim_puk', label: 'SIM / PUK' },
  { value: 'door_alarm', label: 'Door / Alarm' },
  { value: 'gov_work_id', label: 'Gov / Work ID' },
  { value: 'other', label: 'Other' },
];

export function ItemFormModal({
  initialItem,
  defaultCategory = 'login',
  prefillSecret,
  onSave,
  onClose,
}: ItemFormModalProps) {
  const isEdit = Boolean(initialItem);
  const [category, setCategory] = useState<VaultCategory>(
    initialItem?.category ?? defaultCategory
  );
  const [title, setTitle] = useState(initialItem?.title ?? '');
  const [isFavorite, setIsFavorite] = useState(initialItem?.isFavorite ?? false);
  const [tagsText, setTagsText] = useState(initialItem?.tags.join(', ') ?? '');
  const [isSaving, setIsSaving] = useState(false);

  // Login fields
  const [email, setEmail] = useState(
    initialItem?.category === 'login' ? (initialItem.email ?? '') : ''
  );
  const [username, setUsername] = useState(
    initialItem?.category === 'login' ? (initialItem.username ?? '') : ''
  );
  const [accountId, setAccountId] = useState(
    initialItem?.category === 'login' || initialItem?.category === 'note'
      ? (initialItem.accountId ?? '')
      : ''
  );
  const [password, setPassword] = useState(
    initialItem?.category === 'login'
      ? initialItem.password
      : defaultCategory === 'login' && prefillSecret
        ? prefillSecret
        : ''
  );
  const [urlsText, setUrlsText] = useState(
    initialItem?.category === 'login' ? initialItem.urls.join(', ') : ''
  );

  // PIN fields
  const [pinCode, setPinCode] = useState(
    initialItem?.category === 'pin'
      ? initialItem.pinCode
      : defaultCategory === 'pin' && prefillSecret
        ? prefillSecret
        : ''
  );
  const [passcode, setPasscode] = useState(
    initialItem?.category === 'pin' ? (initialItem.passcode ?? '') : ''
  );
  const [pinType, setPinType] = useState<PinType>(
    initialItem?.category === 'pin' ? initialItem.pinType : 'bank_atm'
  );
  const [associatedAccount, setAssociatedAccount] = useState(
    initialItem?.category === 'pin' ? (initialItem.associatedAccount ?? '') : ''
  );

  // Card fields
  const [cardholderName, setCardholderName] = useState(
    initialItem?.category === 'card' ? initialItem.cardholderName : ''
  );
  const [cardNumber, setCardNumber] = useState(
    initialItem?.category === 'card' ? initialItem.cardNumber : ''
  );
  const [brand, setBrand] = useState(
    initialItem?.category === 'card' ? (initialItem.brand ?? '') : ''
  );
  const [expiryMonth, setExpiryMonth] = useState(
    initialItem?.category === 'card' ? initialItem.expiryMonth : ''
  );
  const [expiryYear, setExpiryYear] = useState(
    initialItem?.category === 'card' ? initialItem.expiryYear : ''
  );
  const [cvv, setCvv] = useState(initialItem?.category === 'card' ? initialItem.cvv : '');
  const [cardPin, setCardPin] = useState(
    initialItem?.category === 'card' ? (initialItem.cardPin ?? '') : ''
  );

  // Note / shared notes
  const [notes, setNotes] = useState(() => {
    if (!initialItem) return '';
    if (initialItem.category === 'note') return initialItem.content;
    return initialItem.notes ?? '';
  });
  const [recoveryText, setRecoveryText] = useState(
    initialItem?.category === 'note' && initialItem.recoveryCodes
      ? initialItem.recoveryCodes.map((r) => r.code).join('\n')
      : ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    const now = new Date().toISOString();
    const id = initialItem?.id ?? globalThis.crypto.randomUUID();
    const createdAt = initialItem?.createdAt ?? now;
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      let nextItem: DecryptedVaultItem;
      if (category === 'login') {
        const previousHistory =
          initialItem?.category === 'login' ? [...initialItem.passwordHistory] : [];
        if (
          initialItem?.category === 'login' &&
          initialItem.password &&
          initialItem.password !== password
        ) {
          previousHistory.unshift({ password: initialItem.password, changedAt: now });
        }
        nextItem = {
          id,
          category: 'login',
          title: title.trim(),
          isFavorite,
          tags,
          createdAt,
          updatedAt: now,
          email: email.trim() || undefined,
          username: username.trim() || undefined,
          accountId: accountId.trim() || undefined,
          password,
          urls: urlsText
            .split(',')
            .map((u) => u.trim())
            .filter(Boolean),
          notes: notes.trim() || undefined,
          passwordHistory: previousHistory.slice(0, 10),
        } satisfies LoginItem;
      } else if (category === 'pin') {
        if (!pinCode.trim() && !passcode.trim()) {
          return;
        }
        nextItem = {
          id,
          category: 'pin',
          title: title.trim(),
          isFavorite,
          tags,
          createdAt,
          updatedAt: now,
          pinCode: pinCode.trim(),
          passcode: passcode.trim() || undefined,
          pinType,
          associatedAccount: associatedAccount.trim() || undefined,
          notes: notes.trim() || undefined,
        } satisfies PinItem;
      } else if (category === 'card') {
        nextItem = {
          id,
          category: 'card',
          title: title.trim(),
          isFavorite,
          tags,
          createdAt,
          updatedAt: now,
          cardholderName: cardholderName.trim(),
          cardNumber: cardNumber.trim(),
          brand: brand.trim() || undefined,
          expiryMonth: expiryMonth.trim(),
          expiryYear: expiryYear.trim(),
          cvv: cvv.trim(),
          cardPin: cardPin.trim() || undefined,
          notes: notes.trim() || undefined,
        } satisfies CardItem;
      } else {
        const codes = recoveryText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((code) => ({ code, used: false }));

        nextItem = {
          id,
          category: 'note',
          title: title.trim(),
          isFavorite,
          tags,
          createdAt,
          updatedAt: now,
          accountId: accountId.trim() || undefined,
          content: notes,
          recoveryCodes: codes.length > 0 ? codes : undefined,
        } satisfies NoteItem;
      }

      await onSave(nextItem);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4">
      <div className="w-full md:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[var(--bg-elevated)]/95 backdrop-blur border-b border-[var(--border-subtle)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {isEdit ? 'Edit Vault Item' : 'New Vault Item'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          {!isEdit && (
            <div className="grid grid-cols-4 gap-2">
              {(['login', 'pin', 'card', 'note'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`py-2 rounded-xl text-xs font-semibold capitalize border transition-all ${
                    category === cat
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)] shadow-[0_0_16px_rgba(139,92,246,0.35)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Title *
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                category === 'pin'
                  ? 'e.g. BDO ATM Card PIN'
                  : category === 'card'
                    ? 'e.g. Visa Rewards Debit'
                    : category === 'note'
                      ? 'e.g. Google 2FA Backup Codes'
                      : 'e.g. Google Account'
              }
              className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          {category === 'login' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Email
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you+vault@gmail.com"
                    className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Username
                  </label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  ID (optional)
                </label>
                <input
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="Account ID, Member ID, or Student/Employee ID"
                  className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[var(--text-muted)]">
                    Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setPassword(generatePassword({ length: 20 }))}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-soft)] hover:text-white"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Generate strong
                  </button>
                </div>
                <input
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter or generate password"
                  className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  Website URLs (comma-separated)
                </label>
                <input
                  value={urlsText}
                  onChange={(e) => setUrlsText(e.target.value)}
                  placeholder="https://github.com"
                  className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </>
          )}

          {category === 'pin' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                      PIN
                    </label>
                    <button
                      type="button"
                      onClick={() => setPinCode(generatePin({ length: 6 }))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-soft)] hover:text-white"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Random 6-digit
                    </button>
                  </div>
                  <input
                    required={!passcode.trim()}
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                    placeholder="e.g. 0482"
                    className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                      Passcode
                    </label>
                    <button
                      type="button"
                      onClick={() => setPasscode(generatePin({ length: 6 }))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-soft)] hover:text-white"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Random
                    </button>
                  </div>
                  <input
                    required={!pinCode.trim()}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="e.g. 849201"
                    className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  PIN Category
                </label>
                <select
                  value={pinType}
                  onChange={(e) => setPinType(e.target.value as PinType)}
                  className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  {PIN_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  Associated Account / Device
                </label>
                <input
                  value={associatedAccount}
                  onChange={(e) => setAssociatedAccount(e.target.value)}
                  placeholder="e.g. BDO Savings, Primary iPhone"
                  className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </>
          )}

          {category === 'card' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Cardholder Name *
                  </label>
                  <input
                    required
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder="FULL NAME"
                    className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Card Brand
                  </label>
                  <input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Visa / Mastercard"
                    className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  Card Number *
                </label>
                <input
                  required
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4532 8910 4421 7782"
                  className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Month *
                  </label>
                  <input
                    required
                    value={expiryMonth}
                    onChange={(e) => setExpiryMonth(e.target.value)}
                    placeholder="08"
                    className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Year *
                  </label>
                  <input
                    required
                    value={expiryYear}
                    onChange={(e) => setExpiryYear(e.target.value)}
                    placeholder="2029"
                    className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    CVV *
                  </label>
                  <input
                    required
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    placeholder="842"
                    className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Card PIN
                  </label>
                  <input
                    value={cardPin}
                    onChange={(e) => setCardPin(e.target.value)}
                    placeholder="9041"
                    className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            </>
          )}

          {category === 'note' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  ID (optional)
                </label>
                <input
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="Account ID or Reference ID"
                  className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  Recovery Codes (optional, one per line)
                </label>
                <textarea
                  rows={3}
                  value={recoveryText}
                  onChange={(e) => setRecoveryText(e.target.value)}
                  placeholder={'8492 1938\n3301 7721'}
                  className="w-full font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              {category === 'note' ? 'Note Content' : 'Notes'}
            </label>
            <textarea
              rows={category === 'note' ? 4 : 2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Encrypted private notes..."
              className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                className="rounded accent-violet-500"
              />
              Pin to Favorites
            </label>

            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="Tags: bank, work..."
              className="flex-1 max-w-[200px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white shadow-[0_0_20px_rgba(139,92,246,0.35)] transition-all disabled:opacity-60"
            >
              {isSaving ? 'Encrypting…' : isEdit ? 'Save Changes' : 'Encrypt & Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
