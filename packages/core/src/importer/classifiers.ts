import type {
  CardItem,
  DecryptedVaultItem,
  LoginItem,
  NoteItem,
  PinItem,
  PinType,
  RecoveryCodeEntry,
  VaultCategory,
} from '../types/vault.js';
import { splitRawTextIntoBlocks, type RawTextBlock } from './blockSplitter.js';

export type ImportConfidence = 'high' | 'medium' | 'low';

export interface ParsedImportCandidate {
  candidateId: string;
  sourceName: string;
  rawSnippet: string;
  confidence: ImportConfidence;
  item: DecryptedVaultItem;
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_RE = /\bhttps?:\/\/[^\s]+/gi;
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|ph|co|ai)\b/gi;
const PIN_KEYWORD_RE =
  /\b(?:pin|mpin|atm|passcode|lock\s*screen|phone\s*lock|puk|sim|gcash|maya|bdo|bpi|unionbank|metrobank|landbank|security\s*bank|door|alarm|pass\s*code)\b/i;
const LABELED_PIN_VALUE_RE = /\b(?:pin|mpin|passcode|code|puk)\s*[:=\-#]?\s*(\d{4,12})\b/i;
const STANDALONE_PIN_RE = /\b(\d{4,12})\b/g;

/** Standard Luhn checksum validation for payment card numbers. */
export function luhnCheck(rawDigits: string): boolean {
  const digits = rawDigits.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function detectPinType(text: string): PinType {
  const lower = text.toLowerCase();
  if (/(sim|puk|globe|smart|dito)/.test(lower)) return 'sim_puk';
  if (/(phone|iphone|android|ipad|laptop|mac|windows|screen)/.test(lower)) return 'device_phone';
  if (/(door|gate|alarm|padlock|safe|locker)/.test(lower)) return 'door_alarm';
  if (/(sss|tin|pagibig|philhealth|umid|gov|office|work)/.test(lower)) return 'gov_work_id';
  if (/(bank|atm|bdo|bpi|unionbank|metrobank|landbank|gcash|maya|mpin|card|debit)/.test(lower)) {
    return 'bank_atm';
  }
  return 'other';
}

function inferTitle(block: RawTextBlock, fallback: string): string {
  if (block.titleHint) return block.titleHint;

  const lines = block.rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return fallback;

  const first = lines[0]!;
  // Strip bracket/markdown prefixes
  const cleanedHeader = first.replace(/^#+\s*/, '').replace(/^\[(.*)\]$/, '$1').trim();

  // If first line is "Service: email / pass" or "BDO ATM PIN: 0482", extract prefix before delimiter
  const colonIdx = cleanedHeader.indexOf(':');
  if (colonIdx > 0 && colonIdx < 36) {
    const left = cleanedHeader.slice(0, colonIdx).trim();
    if (!/^(user|username|email|pass|password|pw|pwd|url|site|link)$/i.test(left)) {
      return left;
    }
  }

  if (lines.length > 1 && !EMAIL_RE.test(cleanedHeader) && !/[:=]/.test(cleanedHeader)) {
    return cleanedHeader.slice(0, 60);
  }

  const urls = block.rawText.match(URL_RE) ?? block.rawText.match(BARE_DOMAIN_RE);
  if (urls && urls[0]) {
    try {
      const host = new URL(urls[0].startsWith('http') ? urls[0] : `https://${urls[0]}`).hostname;
      return host.replace(/^www\./, '');
    } catch {
      return urls[0];
    }
  }

  return cleanedHeader.slice(0, 48) || fallback;
}

function extractLabeledValue(lines: string[], keyRegex: RegExp): string | undefined {
  for (const line of lines) {
    const match = keyRegex.exec(line);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return undefined;
}

function extractCardCandidate(block: RawTextBlock, now: string): ParsedImportCandidate | null {
  const numberMatches = block.rawText.match(/(?:\d[ -]*?){13,19}/g);
  if (!numberMatches) return null;

  let validCardDigits: string | null = null;
  for (const raw of numberMatches) {
    const digits = raw.replace(/\D/g, '');
    if (luhnCheck(digits)) {
      validCardDigits = digits;
      break;
    }
  }
  if (!validCardDigits) return null;

  const lines = block.rawText.split('\n').map((l) => l.trim());
  const expiryMatch = /\b(0[1-9]|1[0-2])\s*[/\-]\s*(\d{2}|\d{4})\b/.exec(block.rawText);
  const cvvMatch = /\b(?:cvv|cvc|cid|sec(?:urity)?)\s*[:=\-]?\s*(\d{3,4})\b/i.exec(
    block.rawText
  );
  const cardholder =
    extractLabeledValue(lines, /^(?:name|holder|cardholder)\s*[:=\-]\s*(.+)$/i) ?? 'CARDHOLDER';

  let brand = 'Card';
  if (/^4/.test(validCardDigits)) brand = 'Visa';
  else if (/^5[1-5]/.test(validCardDigits)) brand = 'Mastercard';
  else if (/^3[47]/.test(validCardDigits)) brand = 'Amex';

  const yearRaw = expiryMatch?.[2] ?? '2028';
  const expiryYear = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

  const formattedNumber = validCardDigits.replace(/(\d{4})(?=\d)/g, '$1 ');

  const item: CardItem = {
    id: globalThis.crypto.randomUUID(),
    category: 'card',
    title: inferTitle(block, `${brand} Card`),
    isFavorite: false,
    tags: ['imported'],
    cardholderName: cardholder,
    cardNumber: formattedNumber,
    brand,
    expiryMonth: expiryMatch?.[1] ?? '01',
    expiryYear,
    cvv: cvvMatch?.[1] ?? '',
    notes: block.rawText,
    createdAt: now,
    updatedAt: now,
  };

  return {
    candidateId: block.blockId,
    sourceName: block.sourceName,
    rawSnippet: block.rawText,
    confidence: expiryMatch || cvvMatch ? 'high' : 'medium',
    item,
  };
}

function extractPinCandidate(block: RawTextBlock, now: string): ParsedImportCandidate | null {
  if (!PIN_KEYWORD_RE.test(block.rawText)) {
    return null;
  }

  // Prefer explicit labeled PINs, otherwise inspect standalone 4-12 digit tokens
  let pinCode = LABELED_PIN_VALUE_RE.exec(block.rawText)?.[1];
  if (!pinCode) {
    const matches = Array.from(block.rawText.matchAll(STANDALONE_PIN_RE)).map((m) => m[1]!);
    const plausible = matches.filter((m) => m.length >= 4 && m.length <= 12);
    pinCode = plausible[plausible.length - 1];
  }

  if (!pinCode) return null;

  const title = inferTitle(block, 'Imported PIN');
  const item: PinItem = {
    id: globalThis.crypto.randomUUID(),
    category: 'pin',
    title,
    isFavorite: false,
    tags: ['imported'],
    pinCode,
    pinType: detectPinType(block.rawText),
    associatedAccount: title,
    notes: block.rawText.includes('\n') ? block.rawText : undefined,
    createdAt: now,
    updatedAt: now,
  };

  return {
    candidateId: block.blockId,
    sourceName: block.sourceName,
    rawSnippet: block.rawText,
    confidence: 'high',
    item,
  };
}

function extractLoginCandidate(block: RawTextBlock, now: string): ParsedImportCandidate | null {
  const lines = block.rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let email = extractLabeledValue(lines, /^(?:email|e-mail|mail)\s*[:=\-]\s*(.+)$/i);
  let username = extractLabeledValue(lines, /^(?:user(?:name)?|login|id|acct)\s*[:=\-]\s*(.+)$/i);
  let password = extractLabeledValue(lines, /^(?:pass(?:word)?|pw|pwd|secret)\s*[:=\-]\s*(.+)$/i);

  if (!email) {
    email = EMAIL_RE.exec(block.rawText)?.[0];
  }

  // Handle single-line shorthand: "Netflix: me@mail.com / MyPass123!" or "me@mail.com : MyPass123!"
  if (!password) {
    for (const line of lines) {
      const compactMatch =
        /^(?:[^:\n]{1,40}:\s*)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*(?:[:|/]| - )\s*(\S+)/i.exec(
          line
        );
      if (compactMatch) {
        email = compactMatch[1];
        password = compactMatch[2];
        break;
      }

      const serviceSlashMatch = /^[^:\n]{1,40}:\s*([^\s/]+)\s*\/\s*(\S+)/i.exec(line);
      if (serviceSlashMatch && !/^https?$/i.test(serviceSlashMatch[1]!)) {
        if (!email && EMAIL_RE.test(serviceSlashMatch[1]!)) {
          email = serviceSlashMatch[1];
        } else if (!username) {
          username = serviceSlashMatch[1];
        }
        password = serviceSlashMatch[2];
        break;
      }
    }
  }

  const urlsFound = Array.from(
    new Set([
      ...(block.rawText.match(URL_RE) ?? []),
      ...(block.rawText.match(BARE_DOMAIN_RE) ?? []).filter(
        (d) => !email?.toLowerCase().endsWith(d.toLowerCase())
      ),
    ])
  ).map((u) => (u.startsWith('http') ? u : `https://${u}`));

  const hasLoginSignal = Boolean(password || ((email || username) && urlsFound.length > 0));
  if (!hasLoginSignal) return null;

  const item: LoginItem = {
    id: globalThis.crypto.randomUUID(),
    category: 'login',
    title: inferTitle(block, email ?? username ?? 'Imported Login'),
    isFavorite: false,
    tags: ['imported'],
    ...(email ? { email } : {}),
    ...(username ? { username } : {}),
    password: password ?? '',
    urls: urlsFound,
    notes: lines.length > 2 ? block.rawText : undefined,
    passwordHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    candidateId: block.blockId,
    sourceName: block.sourceName,
    rawSnippet: block.rawText,
    confidence: password && (email || username) ? 'high' : 'medium',
    item,
  };
}

function buildFallbackNote(block: RawTextBlock, now: string): ParsedImportCandidate {
  const lines = block.rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const mentionsRecovery = /\b(recovery|backup|2fa|codes?|seed)\b/i.test(block.rawText);
  const codeMatches: RecoveryCodeEntry[] = [];

  if (mentionsRecovery) {
    for (const line of lines) {
      const cleaned = line.replace(/^[-*•\d.)\s]+/, '').trim();
      if (/^[a-z0-9]{4}(?:[\s-][a-z0-9]{4}){1,3}$/i.test(cleaned)) {
        codeMatches.push({ code: cleaned, used: false });
      }
    }
  }

  const item: NoteItem = {
    id: globalThis.crypto.randomUUID(),
    category: 'note',
    title: inferTitle(block, 'Imported Note'),
    isFavorite: false,
    tags: ['imported'],
    content: block.rawText,
    ...(codeMatches.length >= 2 ? { recoveryCodes: codeMatches } : {}),
    createdAt: now,
    updatedAt: now,
  };

  return {
    candidateId: block.blockId,
    sourceName: block.sourceName,
    rawSnippet: block.rawText,
    confidence: codeMatches.length >= 2 ? 'high' : 'low',
    item,
  };
}

/** Classify a single text block into Login, PIN, Card, or Note without losing raw text. */
export function classifyBlock(block: RawTextBlock): ParsedImportCandidate {
  const now = new Date().toISOString();

  // 1. Payment Card (Luhn-verified)
  const card = extractCardCandidate(block, now);
  if (card) return card;

  // 2. Explicit Password/Login block takes precedence if labeled password: or email + password
  const hasExplicitPasswordField = /\b(?:pass(?:word)?|pw|pwd)\s*[:=\-]/i.test(block.rawText);
  if (hasExplicitPasswordField) {
    const login = extractLoginCandidate(block, now);
    if (login) return login;
  }

  // 3. PIN / Passcode
  const pin = extractPinCandidate(block, now);
  if (pin) return pin;

  // 4. Shorthand / URL-backed Login
  const login = extractLoginCandidate(block, now);
  if (login) return login;

  // 5. Safe Note fallback
  return buildFallbackNote(block, now);
}

/** Reclassify an existing Staging Inbox candidate to another category cleanly. */
export function changeCandidateCategory(
  candidate: ParsedImportCandidate,
  nextCategory: VaultCategory
): ParsedImportCandidate {
  if (candidate.item.category === nextCategory) return candidate;

  const { id, title, isFavorite, tags, createdAt, updatedAt } = candidate.item;
  const raw = candidate.rawSnippet;

  let secretCarry = '';
  if (candidate.item.category === 'login') secretCarry = candidate.item.password;
  else if (candidate.item.category === 'pin') secretCarry = candidate.item.pinCode;
  else if (candidate.item.category === 'card') secretCarry = candidate.item.cardNumber;

  let nextItem: DecryptedVaultItem;
  if (nextCategory === 'login') {
    const email = EMAIL_RE.exec(raw)?.[0];
    nextItem = {
      id,
      category: 'login',
      title,
      isFavorite,
      tags,
      createdAt,
      updatedAt,
      ...(email ? { email } : {}),
      password: secretCarry,
      urls: [],
      notes: raw,
      passwordHistory: [],
    };
  } else if (nextCategory === 'pin') {
    const digitsMatch = /\b(\d{4,12})\b/.exec(secretCarry || raw);
    nextItem = {
      id,
      category: 'pin',
      title,
      isFavorite,
      tags,
      createdAt,
      updatedAt,
      pinCode: digitsMatch?.[1] ?? secretCarry,
      pinType: detectPinType(raw),
      associatedAccount: title,
      notes: raw,
    };
  } else if (nextCategory === 'card') {
    nextItem = {
      id,
      category: 'card',
      title,
      isFavorite,
      tags,
      createdAt,
      updatedAt,
      cardholderName: 'CARDHOLDER',
      cardNumber: secretCarry,
      expiryMonth: '01',
      expiryYear: '2029',
      cvv: '',
      notes: raw,
    };
  } else {
    nextItem = {
      id,
      category: 'note',
      title,
      isFavorite,
      tags,
      createdAt,
      updatedAt,
      content: raw,
    };
  }

  return {
    ...candidate,
    item: nextItem,
  };
}

/** Parse unstructured text directly into Staging Inbox candidates. */
export function parseRawTextToCandidates(
  rawText: string,
  sourceName: string = 'pasted-notes.txt'
): ParsedImportCandidate[] {
  return splitRawTextIntoBlocks(rawText, sourceName).map(classifyBlock);
}
