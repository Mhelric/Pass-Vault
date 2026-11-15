import { describe, expect, it } from 'vitest';
import {
  extractHostname,
  getRegistrableDomain,
  matchLoginsForUrl,
  type LoginItem,
  type PinItem,
} from '../index.js';

function makeLogin(title: string, urls: string[], isFavorite = false): LoginItem {
  const now = '2026-11-15T12:00:00.000Z';
  return {
    id: globalThis.crypto.randomUUID(),
    category: 'login',
    title,
    isFavorite,
    tags: [],
    email: 'user@example.com',
    password: 'SecretPassword!99',
    urls,
    passwordHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('@vault/core — Extension Domain & Autofill Matcher', () => {
  it('normalizes hostnames and extracts registrable domains including .com.ph', () => {
    expect(extractHostname('https://www.GitHub.com/login')).toBe('github.com');
    expect(extractHostname('accounts.google.com')).toBe('accounts.google.com');
    expect(getRegistrableDomain('mail.google.com')).toBe('google.com');
    expect(getRegistrableDomain('online.bdo.com.ph')).toBe('bdo.com.ph');
    expect(getRegistrableDomain('portal.gov.uk')).toBe('portal.gov.uk');
  });

  it('ranks exact hostname matches ahead of subdomain matches and rejects unrelated domains', () => {
    const exactGoogle = makeLogin('Google Accounts Exact', ['https://accounts.google.com']);
    const mailGoogle = makeLogin('Google Mail', ['https://mail.google.com'], true);
    const bdo = makeLogin('BDO Online Banking', ['https://online.bdo.com.ph']);
    const github = makeLogin('GitHub', ['https://github.com']);
    const pin: PinItem = {
      id: globalThis.crypto.randomUUID(),
      category: 'pin',
      title: 'BDO ATM PIN',
      isFavorite: true,
      tags: [],
      pinCode: '0482',
      pinType: 'bank_atm',
      createdAt: '2026-11-15T12:00:00.000Z',
      updatedAt: '2026-11-15T12:00:00.000Z',
    };

    const googleMatches = matchLoginsForUrl(
      [mailGoogle, github, exactGoogle, bdo, pin],
      'https://accounts.google.com/v3/signin'
    );
    expect(googleMatches.map((m) => m.title)).toEqual([
      'Google Accounts Exact',
      'Google Mail',
    ]);

    const bdoMatches = matchLoginsForUrl(
      [mailGoogle, github, exactGoogle, bdo, pin],
      'https://bdo.com.ph/personal'
    );
    expect(bdoMatches.map((m) => m.title)).toEqual(['BDO Online Banking']);

    expect(matchLoginsForUrl([github], 'https://evil-github.com')).toEqual([]);
  });
});
