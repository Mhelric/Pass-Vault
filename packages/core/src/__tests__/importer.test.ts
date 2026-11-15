import { describe, expect, it } from 'vitest';
import {
  changeCandidateCategory,
  luhnCheck,
  parseGoogleKeepJson,
  parseRawTextToCandidates,
  type CardItem,
  type LoginItem,
  type NoteItem,
  type PinItem,
} from '../index.js';

describe('@vault/core — Smart Local .txt & Keep Importer', () => {
  it('parses messy unstructured .txt notes into Login, PIN (preserving leading zeros), Card, and Note items', () => {
    const rawTxt = `
BDO ATM PIN: 0482
GCash MPIN: 8391

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
Backup codes for gmail:
- 8492 1938
- 3301 7721
- 5190 6624
    `;

    const candidates = parseRawTextToCandidates(rawTxt, 'scattered-passwords.txt');
    expect(candidates).toHaveLength(6);

    const bdoPin = candidates[0]!.item as PinItem;
    expect(bdoPin.category).toBe('pin');
    expect(bdoPin.pinCode).toBe('0482'); // Leading zero preserved!
    expect(bdoPin.pinType).toBe('bank_atm');

    const gcashPin = candidates[1]!.item as PinItem;
    expect(gcashPin.category).toBe('pin');
    expect(gcashPin.pinCode).toBe('8391');

    const netflix = candidates[2]!.item as LoginItem;
    expect(netflix.category).toBe('login');
    expect(netflix.title).toBe('Netflix Family');
    expect(netflix.email).toBe('family+stream@gmail.com');
    expect(netflix.password).toBe('TvNight!Stream#4491');
    expect(netflix.urls).toContain('https://netflix.com');

    const github = candidates[3]!.item as LoginItem;
    expect(github.category).toBe('login');
    expect(github.email).toBe('mhelric@gmail.com');
    expect(github.password).toBe('harbor-cobalt-ember7');

    const visa = candidates[4]!.item as CardItem;
    expect(visa.category).toBe('card');
    expect(visa.brand).toBe('Visa');
    expect(visa.expiryMonth).toBe('08');
    expect(visa.expiryYear).toBe('2029');
    expect(visa.cvv).toBe('842');
    expect(luhnCheck(visa.cardNumber)).toBe(true);

    const recoveryNote = candidates[5]!.item as NoteItem;
    expect(recoveryNote.category).toBe('note');
    expect(recoveryNote.recoveryCodes).toHaveLength(3);
  });

  it('parses Google Keep Takeout JSON exports including checklist items and labels', () => {
    const keepExport = JSON.stringify([
      {
        title: 'Phone & Banking PINs',
        listContent: [
          { text: 'Phone Lock PIN: 094128', isChecked: false },
          { text: 'SIM PUK Code: 55102944', isChecked: false },
        ],
        labels: [{ name: 'personal' }],
        isTrashed: false,
      },
      {
        title: 'Old Deleted Note',
        textContent: 'Should be skipped',
        isTrashed: true,
      },
    ]);

    const parsed = parseGoogleKeepJson(keepExport, 'KeepExport.json');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.item.category).toBe('pin');
    expect((parsed[0]!.item as PinItem).pinCode).toBe('094128');
    expect(parsed[0]!.item.tags).toContain('personal');
    expect((parsed[1]!.item as PinItem).pinType).toBe('sim_puk');
  });

  it('supports 1-click category switching in the Staging Inbox', () => {
    const [candidate] = parseRawTextToCandidates('Door Alarm Code: 4419', 'home.txt');
    expect(candidate!.item.category).toBe('pin');

    const switchedToNote = changeCandidateCategory(candidate!, 'note');
    expect(switchedToNote.item.category).toBe('note');
    expect((switchedToNote.item as NoteItem).content).toBe('Door Alarm Code: 4419');

    const switchedToLogin = changeCandidateCategory(candidate!, 'login');
    expect(switchedToLogin.item.category).toBe('login');
    expect((switchedToLogin.item as LoginItem).password).toBe('4419');
  });
});
