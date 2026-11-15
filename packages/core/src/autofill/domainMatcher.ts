import type { DecryptedVaultItem, LoginItem } from '../types/vault.js';

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'com.ph',
  'org.ph',
  'gov.ph',
  'edu.ph',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'ne.jp',
  'or.jp',
  'com.sg',
  'com.br',
  'com.mx',
]);

/** Extract normalized lowercase hostname without leading `www.` from a URL or bare domain. */
export function extractHostname(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    if (!parsed.hostname) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Extract the registrable base domain (e.g., `online.bdo.com.ph` -> `bdo.com.ph`). */
export function getRegistrableDomain(hostname: string): string {
  const clean = hostname.toLowerCase().replace(/^www\./, '');
  const parts = clean.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return clean;
  }

  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * Find login items matching a tab URL, ranking exact hostname matches first,
 * followed by same registrable domain matches, then favorites.
 */
export function matchLoginsForUrl(
  items: DecryptedVaultItem[],
  targetUrl: string
): LoginItem[] {
  const targetHost = extractHostname(targetUrl);
  if (!targetHost) return [];

  const targetDomain = getRegistrableDomain(targetHost);

  interface ScoredMatch {
    item: LoginItem;
    score: number;
  }

  const matches: ScoredMatch[] = [];

  for (const item of items) {
    if (item.category !== 'login') continue;

    let bestScore = 0;
    for (const rawUrl of item.urls) {
      const itemHost = extractHostname(rawUrl);
      if (!itemHost) continue;

      if (itemHost === targetHost) {
        bestScore = Math.max(bestScore, 3);
      } else if (getRegistrableDomain(itemHost) === targetDomain) {
        bestScore = Math.max(bestScore, 2);
      }
    }

    if (bestScore > 0) {
      matches.push({
        item,
        score: bestScore * 10 + (item.isFavorite ? 1 : 0),
      });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
    .map((m) => m.item);
}
