import type { VaultCategory } from '@vault/core';
import {
  evaluateSecretStrength,
  generatePassphrase,
  generatePassword,
  generatePin,
} from '@vault/crypto';
import { CopyButton, SecretDisplay } from '@vault/ui';
import { Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export interface GeneratorViewProps {
  onCopySecret: (label: string) => void;
  onUseInNewItem: (secret: string, category: VaultCategory) => void;
}

type GeneratorMode = 'password' | 'passphrase' | 'pin';

export function GeneratorView({ onCopySecret, onUseInNewItem }: GeneratorViewProps) {
  const [mode, setMode] = useState<GeneratorMode>('password');

  // Password options
  const [pwLength, setPwLength] = useState(20);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);

  // Passphrase options
  const [words, setWords] = useState(4);
  const [separator, setSeparator] = useState('-');
  const [capitalize, setCapitalize] = useState(false);
  const [includeNumber, setIncludeNumber] = useState(true);

  // PIN options
  const [pinLength, setPinLength] = useState(6);
  const [rejectWeakPin, setRejectWeakPin] = useState(true);

  const [generated, setGenerated] = useState('');

  const regenerate = useCallback(() => {
    if (mode === 'password') {
      const hasAny = upper || lower || digits || symbols;
      setGenerated(
        generatePassword({
          length: pwLength,
          uppercase: hasAny ? upper : true,
          lowercase: lower,
          digits,
          symbols,
          excludeAmbiguous,
        })
      );
    } else if (mode === 'passphrase') {
      setGenerated(
        generatePassphrase({
          words,
          separator,
          capitalize,
          includeNumber,
        })
      );
    } else {
      setGenerated(
        generatePin({
          length: pinLength,
          rejectWeakPatterns: rejectWeakPin,
        })
      );
    }
  }, [
    mode,
    pwLength,
    upper,
    lower,
    digits,
    symbols,
    excludeAmbiguous,
    words,
    separator,
    capitalize,
    includeNumber,
    pinLength,
    rejectWeakPin,
  ]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const strength = evaluateSecretStrength(generated, mode === 'pin' ? 'pin' : 'password');

  const strengthColors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-400',
    'bg-violet-400',
    'bg-emerald-400',
  ];

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-24 md:pb-8">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          CSPRNG Secret Generator
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          100% offline cryptographic randomness via <code className="text-violet-300">crypto.getRandomValues</code>
        </p>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
        {(['password', 'passphrase', 'pin'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`py-2 rounded-xl text-xs font-semibold capitalize transition-all ${
              mode === m
                ? 'bg-[var(--accent-primary)] text-white shadow-[0_0_16px_rgba(139,92,246,0.35)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Generated Output Card */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 space-y-4">
        <div className="min-h-[56px] flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3">
          <SecretDisplay value={generated} defaultRevealed allowToggle={false} className="text-base" />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={regenerate}
              aria-label="Regenerate secret"
              className="p-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent-primary)] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <CopyButton
              value={generated}
              label={mode === 'pin' ? 'PIN' : 'Password'}
              onCopied={onCopySecret}
            />
          </div>
        </div>

        {/* Strength Meter */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-4 gap-1.5 h-1.5">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`rounded-full transition-colors ${
                  strength.score >= step
                    ? strengthColors[strength.score]
                    : 'bg-[var(--bg-surface)]'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">
              {strength.isWeak ? 'Weak / Predictable' : 'Cryptographically Strong'}
            </span>
            <button
              type="button"
              onClick={() => onUseInNewItem(generated, mode === 'pin' ? 'pin' : 'login')}
              className="inline-flex items-center gap-1 font-semibold text-[var(--accent-soft)] hover:text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Save to Vault
            </button>
          </div>
        </div>
      </div>

      {/* Mode Controls */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 space-y-4">
        {mode === 'password' && (
          <>
            <div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-[var(--text-secondary)] font-medium">Length</span>
                <span className="font-mono-secret text-[var(--accent-soft)] font-semibold">
                  {pwLength} chars
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={64}
                value={pwLength}
                onChange={(e) => setPwLength(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {[
                { label: 'Uppercase (A-Z)', checked: upper, set: setUpper },
                { label: 'Lowercase (a-z)', checked: lower, set: setLower },
                { label: 'Digits (0-9)', checked: digits, set: setDigits },
                { label: 'Symbols (!@#$)', checked: symbols, set: setSymbols },
              ].map((opt) => (
                <label
                  key={opt.label}
                  className="flex items-center justify-between rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 cursor-pointer"
                >
                  <span className="text-[var(--text-secondary)]">{opt.label}</span>
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={(e) => opt.set(e.target.checked)}
                    className="accent-violet-500"
                  />
                </label>
              ))}
            </div>

            <label className="flex items-center justify-between rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-xs cursor-pointer">
              <span className="text-[var(--text-secondary)]">Exclude ambiguous (0, O, 1, l, I)</span>
              <input
                type="checkbox"
                checked={excludeAmbiguous}
                onChange={(e) => setExcludeAmbiguous(e.target.checked)}
                className="accent-violet-500"
              />
            </label>
          </>
        )}

        {mode === 'passphrase' && (
          <>
            <div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-[var(--text-secondary)] font-medium">Word Count</span>
                <span className="font-mono-secret text-[var(--accent-soft)] font-semibold">
                  {words} words
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={8}
                value={words}
                onChange={(e) => setWords(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2 flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Separator</span>
                <select
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                  className="bg-transparent text-[var(--accent-soft)] font-mono-secret focus:outline-none"
                >
                  <option value="-">-</option>
                  <option value="_">_</option>
                  <option value=".">.</option>
                  <option value=" ">space</option>
                </select>
              </div>
              <label className="flex items-center justify-between rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2 cursor-pointer">
                <span className="text-[var(--text-secondary)]">Capitalize</span>
                <input
                  type="checkbox"
                  checked={capitalize}
                  onChange={(e) => setCapitalize(e.target.checked)}
                  className="accent-violet-500"
                />
              </label>
            </div>

            <label className="flex items-center justify-between rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-xs cursor-pointer">
              <span className="text-[var(--text-secondary)]">Include trailing digit</span>
              <input
                type="checkbox"
                checked={includeNumber}
                onChange={(e) => setIncludeNumber(e.target.checked)}
                className="accent-violet-500"
              />
            </label>
          </>
        )}

        {mode === 'pin' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">PIN Length</span>
              <div className="flex gap-2">
                {[4, 6, 8, 10].map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => setPinLength(len)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      pinLength === len
                        ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                        : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                    }`}
                  >
                    {len}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-xs cursor-pointer">
              <span className="text-[var(--text-secondary)]">
                Reject sequential & repeated patterns (1234, 1111)
              </span>
              <input
                type="checkbox"
                checked={rejectWeakPin}
                onChange={(e) => setRejectWeakPin(e.target.checked)}
                className="accent-violet-500"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
