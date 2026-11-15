import {
  changeCandidateCategory,
  parseGoogleKeepJson,
  parseRawTextToCandidates,
  type DecryptedVaultItem,
  type ParsedImportCandidate,
  type VaultCategory,
} from '@vault/core';
import { CategoryBadge } from '@vault/ui';
import {
  CheckSquare,
  FileUp,
  Merge,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

export interface ImportViewProps {
  onImportItems: (items: DecryptedVaultItem[]) => Promise<void>;
}

const SAMPLE_MESSY_NOTES = `---
BDO ATM PIN: 0482
GCash MPIN: 8391
Phone Lock Passcode: 094128

[Netflix Family]
email: family+stream@gmail.com
password: TvNight!Stream#4491
url: netflix.com

GitHub: mhelric@gmail.com / harbor-cobalt-ember7

---
Visa Debit Card
Cardholder: MHELRIC USER
4111 1111 1111 1111
Exp: 08/29
CVV: 842

# Google 2FA Recovery Codes
Backup codes for primary gmail:
- 8492 1938
- 3301 7721
- 5190 6624`;

export function ImportView({ onImportItems }: ImportViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rawText, setRawText] = useState('');
  const [candidates, setCandidates] = useState<ParsedImportCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const appendCandidates = (next: ParsedImportCandidate[], sourceNote: string) => {
    if (next.length === 0) {
      setStatusMessage(`No credential blocks found in ${sourceNote}.`);
      return;
    }
    setCandidates((prev) => [...prev, ...next]);
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      for (const c of next) copy.add(c.candidateId);
      return copy;
    });
    setStatusMessage(`Parsed ${next.length} candidate item(s) locally from ${sourceNote}.`);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const collected: ParsedImportCandidate[] = [];

    for (const file of Array.from(files)) {
      const content = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        try {
          collected.push(...parseGoogleKeepJson(content, file.name));
        } catch (err) {
          setStatusMessage(err instanceof Error ? err.message : `Failed to parse ${file.name}`);
        }
      } else {
        collected.push(...parseRawTextToCandidates(content, file.name));
      }
    }

    appendCandidates(collected, `${files.length} file(s)`);
  };

  const handleParseText = () => {
    if (!rawText.trim()) return;
    const parsed = parseRawTextToCandidates(rawText, 'pasted-notes.txt');
    appendCandidates(parsed, 'pasted text');
    setRawText('');
  };

  const handleLoadSample = () => {
    const parsed = parseRawTextToCandidates(SAMPLE_MESSY_NOTES, 'old-passwords-2024.txt');
    appendCandidates(parsed, 'old-passwords-2024.txt');
  };

  const updateCandidateItem = (candidateId: string, updater: (item: DecryptedVaultItem) => DecryptedVaultItem) => {
    setCandidates((prev) =>
      prev.map((c) => (c.candidateId === candidateId ? { ...c, item: updater(c.item) } : c))
    );
  };

  const handleSwitchCategory = (candidateId: string, category: VaultCategory) => {
    setCandidates((prev) =>
      prev.map((c) => (c.candidateId === candidateId ? changeCandidateCategory(c, category) : c))
    );
  };

  const handleMergeWithNext = (index: number) => {
    if (index >= candidates.length - 1) return;
    const current = candidates[index]!;
    const next = candidates[index + 1]!;
    const mergedRaw = `${current.rawSnippet}\n${next.rawSnippet}`;
    const [reclassified] = parseRawTextToCandidates(mergedRaw, current.sourceName);
    if (!reclassified) return;

    setCandidates((prev) => [
      ...prev.slice(0, index),
      reclassified,
      ...prev.slice(index + 2),
    ]);
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(current.candidateId);
      copy.delete(next.candidateId);
      copy.add(reclassified.candidateId);
      return copy;
    });
  };

  const handleRemoveCandidate = (candidateId: string) => {
    setCandidates((prev) => prev.filter((c) => c.candidateId !== candidateId));
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(candidateId);
      return copy;
    });
  };

  const toggleSelect = (candidateId: string) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(candidateId)) copy.delete(candidateId);
      else copy.add(candidateId);
      return copy;
    });
  };

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.candidateId)),
    [candidates, selectedIds]
  );

  const handleImportSelected = async () => {
    if (selectedCandidates.length === 0) return;
    setIsImporting(true);
    try {
      await onImportItems(selectedCandidates.map((c) => c.item));
      setCandidates((prev) => prev.filter((c) => !selectedIds.has(c.candidateId)));
      setSelectedIds(new Set());
      setStatusMessage(`Encrypted & imported ${selectedCandidates.length} item(s) into your vault.`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28 md:pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            Smart Local Importer (.txt & Google Keep)
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            100% client-side parsing. Your raw notes never leave this device before AES-256-GCM encryption.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadSample}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent-tint)] border border-[var(--accent-primary)]/40 text-xs font-semibold text-[var(--accent-soft)] hover:text-white transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Load Sample Messy .txt Notes
        </button>
      </div>

      {/* Dropzone & Paste Input */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[180px] ${
            isDragging
              ? 'border-[var(--accent-primary)] bg-[var(--accent-tint)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--accent-primary)]/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.json"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center mb-3">
            <FileUp className="w-6 h-6 text-[var(--accent-soft)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Drop .txt, .md, or Google Keep .json files
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Or tap to browse files on your phone or computer
          </p>
        </div>

        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4 flex flex-col gap-3">
          <textarea
            rows={5}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={'Paste scattered passwords, Keep notes, or PINs here...\n\nExample:\nBDO ATM PIN: 0482\nNetflix: me@gmail.com / MyPass!'}
            className="w-full flex-1 font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!rawText.trim()}
              onClick={handleParseText}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-xs font-semibold text-white disabled:opacity-40"
            >
              <Upload className="w-3.5 h-3.5" />
              Parse into Staging Inbox
            </button>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--accent-primary)]/35 px-4 py-2.5 text-xs text-[var(--accent-soft)]">
          {statusMessage}
        </div>
      )}

      {/* Interactive Staging Inbox */}
      {candidates.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Staging Inbox ({candidates.length} parsed)
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.size === candidates.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(candidates.map((c) => c.candidateId)));
                  }
                }}
                className="text-xs text-[var(--accent-soft)] hover:underline"
              >
                {selectedIds.size === candidates.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <button
              type="button"
              disabled={selectedCandidates.length === 0 || isImporting}
              onClick={() => void handleImportSelected()}
              className="px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-xs font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.35)] disabled:opacity-50"
            >
              {isImporting
                ? 'Encrypting…'
                : `Encrypt & Import ${selectedCandidates.length} Selected Item(s)`}
            </button>
          </div>

          <div className="space-y-3">
            {candidates.map((candidate, index) => {
              const isSelected = selectedIds.has(candidate.candidateId);
              const { item } = candidate;

              return (
                <div
                  key={candidate.candidateId}
                  className={`rounded-2xl border p-4 transition-colors ${
                    isSelected
                      ? 'bg-[var(--bg-elevated)] border-[var(--accent-primary)]/45'
                      : 'bg-[var(--bg-elevated)]/60 border-[var(--border-subtle)] opacity-75'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleSelect(candidate.candidateId)}
                        aria-label="Toggle item selection"
                        className="text-[var(--accent-soft)]"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 text-[var(--text-muted)]" />
                        )}
                      </button>
                      <CategoryBadge category={item.category} />
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {candidate.sourceName} • {candidate.confidence} confidence
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(['login', 'pin', 'card', 'note'] as const).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => handleSwitchCategory(candidate.candidateId, cat)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium capitalize border ${
                            item.category === cat
                              ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}

                      {index < candidates.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMergeWithNext(index)}
                          title="Merge with next block"
                          className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white"
                        >
                          <Merge className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveCandidate(candidate.candidateId)}
                        title="Discard"
                        className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Side-by-Side Raw Snippet vs Structured Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-3">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                        Original Raw Text
                      </div>
                      <pre className="font-mono-secret text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                        {candidate.rawSnippet}
                      </pre>
                    </div>

                    <div className="space-y-2.5">
                      <input
                        value={item.title}
                        onChange={(e) =>
                          updateCandidateItem(candidate.candidateId, (cur) => ({
                            ...cur,
                            title: e.target.value,
                          }))
                        }
                        placeholder="Item title"
                        className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />

                      {item.category === 'login' && (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={item.email ?? item.username ?? ''}
                            onChange={(e) =>
                              updateCandidateItem(candidate.candidateId, (cur) =>
                                cur.category === 'login'
                                  ? { ...cur, email: e.target.value }
                                  : cur
                              )
                            }
                            placeholder="Email / Username"
                            className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                          <input
                            value={item.password}
                            onChange={(e) =>
                              updateCandidateItem(candidate.candidateId, (cur) =>
                                cur.category === 'login'
                                  ? { ...cur, password: e.target.value }
                                  : cur
                              )
                            }
                            placeholder="Password"
                            className="font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--accent-soft)] focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>
                      )}

                      {item.category === 'pin' && (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={item.pinCode}
                            onChange={(e) =>
                              updateCandidateItem(candidate.candidateId, (cur) =>
                                cur.category === 'pin'
                                  ? { ...cur, pinCode: e.target.value }
                                  : cur
                              )
                            }
                            placeholder="PIN code"
                            className="font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--accent-soft)] focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                          <input
                            value={item.associatedAccount ?? ''}
                            onChange={(e) =>
                              updateCandidateItem(candidate.candidateId, (cur) =>
                                cur.category === 'pin'
                                  ? { ...cur, associatedAccount: e.target.value }
                                  : cur
                              )
                            }
                            placeholder="Account / Device"
                            className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>
                      )}

                      {item.category === 'card' && (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={item.cardNumber}
                            onChange={(e) =>
                              updateCandidateItem(candidate.candidateId, (cur) =>
                                cur.category === 'card'
                                  ? { ...cur, cardNumber: e.target.value }
                                  : cur
                              )
                            }
                            placeholder="Card Number"
                            className="font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                          <input
                            value={item.cvv}
                            onChange={(e) =>
                              updateCandidateItem(candidate.candidateId, (cur) =>
                                cur.category === 'card'
                                  ? { ...cur, cvv: e.target.value }
                                  : cur
                              )
                            }
                            placeholder="CVV"
                            className="font-mono-secret rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--accent-soft)] focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>
                      )}

                      {item.category === 'note' && (
                        <textarea
                          rows={2}
                          value={item.content}
                          onChange={(e) =>
                            updateCandidateItem(candidate.candidateId, (cur) =>
                              cur.category === 'note'
                                ? { ...cur, content: e.target.value }
                                : cur
                            )
                          }
                          className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
