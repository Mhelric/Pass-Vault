import { describe, expect, it } from 'vitest';
import {
  VaultCryptoError,
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  constantTimeEqual,
  createDefaultKdfParams,
  decryptBytes,
  decryptJson,
  deriveMasterKey,
  deriveSubkey,
  encryptBytes,
  encryptJson,
  evaluateSecretStrength,
  generatePassphrase,
  generatePassword,
  generatePin,
  generateVek,
  isPlatformBiometricAvailable,
  isWeakPinPattern,
  randomBytes,
  unwrapVek,
  unwrapVekWithBiometricSecret,
  unwrapVekWithPin,
  utf8ToBytes,
  wrapVek,
  wrapVekWithBiometricSecret,
  wrapVekWithPin,
  zeroize,
} from '../index.js';

describe('@vault/crypto — encoding & memory utilities', () => {
  it('round-trips UTF-8 and Base64 accurately', () => {
    const text = 'Zero-Knowledge 🔐 PIN: 0482 — Café!';
    const bytes = utf8ToBytes(text);
    const b64 = bytesToBase64(bytes);
    expect(bytesToUtf8(base64ToBytes(b64))).toBe(text);
  });

  it('zeroizes buffers in place and compares in constant time', () => {
    const keyA = randomBytes(32);
    const keyB = new Uint8Array(keyA);
    expect(constantTimeEqual(keyA, keyB)).toBe(true);

    keyB[10] = (keyB[10]! + 1) & 0xff;
    expect(constantTimeEqual(keyA, keyB)).toBe(false);

    zeroize(keyA, keyB);
    expect(keyA.every((byte) => byte === 0)).toBe(true);
    expect(keyB.every((byte) => byte === 0)).toBe(true);
  });
});

describe('@vault/crypto — KDF & VEK key hierarchy', () => {
  it('derives deterministic 256-bit Master Keys via Argon2id and wraps/unwraps VEK', async () => {
    const params = createDefaultKdfParams('argon2id');
    const masterKey1 = await deriveMasterKey('correct-horse-battery-staple!', params);
    const masterKey2 = await deriveMasterKey('correct-horse-battery-staple!', params);
    const wrongKey = await deriveMasterKey('wrong-master-password!', params);

    expect(masterKey1.byteLength).toBe(32);
    expect(constantTimeEqual(masterKey1, masterKey2)).toBe(true);
    expect(constantTimeEqual(masterKey1, wrongKey)).toBe(false);

    const vek = generateVek();
    expect(vek.byteLength).toBe(32);

    const { encryptedVek, vekIv } = await wrapVek(vek, masterKey1);
    const unwrapped = await unwrapVek(encryptedVek, vekIv, masterKey2);
    expect(constantTimeEqual(vek, unwrapped)).toBe(true);

    await expect(unwrapVek(encryptedVek, vekIv, wrongKey)).rejects.toThrow(VaultCryptoError);

    zeroize(masterKey1, masterKey2, wrongKey, vek, unwrapped);
  });

  it('supports PBKDF2-HMAC-SHA256 fallback KDF', async () => {
    const params = createDefaultKdfParams('pbkdf2-sha256');
    const key1 = await deriveMasterKey('FallbackPassphrase#99', params);
    const key2 = await deriveMasterKey('FallbackPassphrase#99', params);
    expect(key1.byteLength).toBe(32);
    expect(constantTimeEqual(key1, key2)).toBe(true);
    zeroize(key1, key2);
  });

  it('derives distinct HKDF subkeys for distinct info contexts', async () => {
    const ikm = randomBytes(32);
    const sub1 = await deriveSubkey(ikm, 'vault-vek-wrap-v1');
    const sub2 = await deriveSubkey(ikm, 'vault-webauthn-vek-v1');
    expect(sub1.byteLength).toBe(32);
    expect(constantTimeEqual(sub1, sub2)).toBe(false);
    zeroize(ikm, sub1, sub2);
  });
});

describe('@vault/crypto — AES-256-GCM item encryption & tamper detection', () => {
  it('encrypts and decrypts structured vault items with unique IVs and AAD binding', async () => {
    const vek = generateVek();
    const itemId = '7d13d92f-92ce-4bb8-a764-7fd4586a23b1';
    const sampleLogin = {
      id: itemId,
      category: 'login',
      title: 'GitHub',
      username: 'mhelric',
      password: 'SuperSecret!Password#2026',
      urls: ['https://github.com'],
    };

    const enc1 = await encryptJson(sampleLogin, vek, itemId);
    const enc2 = await encryptJson(sampleLogin, vek, itemId);

    // Every encryption call uses a fresh random 96-bit IV
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.encryptedPayload).not.toBe(enc2.encryptedPayload);

    const decrypted = await decryptJson<typeof sampleLogin>(
      enc1.encryptedPayload,
      enc1.iv,
      vek,
      itemId
    );
    expect(decrypted).toEqual(sampleLogin);

    // Mismatched itemId AAD must fail authentication
    await expect(
      decryptJson(enc1.encryptedPayload, enc1.iv, vek, 'wrong-item-id')
    ).rejects.toThrow(VaultCryptoError);

    // Tampered ciphertext byte must fail authentication
    const rawCiphertext = base64ToBytes(enc1.encryptedPayload);
    rawCiphertext[0] = (rawCiphertext[0]! ^ 0xff) & 0xff;
    const tamperedB64 = bytesToBase64(rawCiphertext);
    await expect(decryptJson(tamperedB64, enc1.iv, vek, itemId)).rejects.toThrow(VaultCryptoError);

    zeroize(vek);
  });

  it('rejects malformed IV lengths on AES-GCM decryption', async () => {
    const vek = generateVek();
    const { ciphertext } = await encryptBytes(utf8ToBytes('hello'), vek);
    const badIv = bytesToBase64(randomBytes(8));
    await expect(decryptBytes(ciphertext, badIv, vek)).rejects.toThrow(VaultCryptoError);
    zeroize(vek);
  });
});

describe('@vault/crypto — Quick-Unlock PIN & WebAuthn biometric wrappers', () => {
  it('wraps and unwraps VEK with a 6-digit PIN and rejects wrong PINs', async () => {
    const vek = generateVek();
    const { pinWrappedVek, pinIv, pinSalt } = await wrapVekWithPin(vek, '048291', 4096);

    const unwrapped = await unwrapVekWithPin(pinWrappedVek, pinIv, pinSalt, '048291', 4096);
    expect(constantTimeEqual(vek, unwrapped)).toBe(true);

    await expect(
      unwrapVekWithPin(pinWrappedVek, pinIv, pinSalt, '999999', 4096)
    ).rejects.toThrow(VaultCryptoError);

    await expect(wrapVekWithPin(vek, '1234')).rejects.toThrow(VaultCryptoError);
    zeroize(vek, unwrapped);
  });

  it('wraps and unwraps VEK with a WebAuthn biometric secret', async () => {
    const vek = generateVek();
    const prfOutput = randomBytes(32);

    const { bioWrappedVek, bioIv } = await wrapVekWithBiometricSecret(vek, prfOutput);
    const unwrapped = await unwrapVekWithBiometricSecret(bioWrappedVek, bioIv, prfOutput);
    expect(constantTimeEqual(vek, unwrapped)).toBe(true);

    const wrongPrf = randomBytes(32);
    await expect(unwrapVekWithBiometricSecret(bioWrappedVek, bioIv, wrongPrf)).rejects.toThrow(
      VaultCryptoError
    );

    expect(await isPlatformBiometricAvailable()).toBe(false);
    zeroize(vek, unwrapped, prfOutput, wrongPrf);
  });
});

describe('@vault/crypto — CSPRNG Password, Passphrase & PIN generators', () => {
  it('generates passwords matching requested length and character pools', () => {
    const pw = generatePassword({
      length: 24,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
      excludeAmbiguous: true,
    });

    expect(pw).toHaveLength(24);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/\d/.test(pw)).toBe(true);
    expect(/[!@#$%^&*\-_=+?]/.test(pw)).toBe(true);
    expect(/[0O1lI]/.test(pw)).toBe(false);
  });

  it('generates Diceware passphrases with requested word count and options', () => {
    const phrase = generatePassphrase({
      words: 5,
      separator: '_',
      capitalize: true,
      includeNumber: true,
    });

    const parts = phrase.split('_');
    expect(parts).toHaveLength(5);
    expect(parts.every((part) => /^[A-Z][a-z]+\d?$/.test(part))).toBe(true);
    expect(/\d/.test(phrase)).toBe(true);
  });

  it('generates valid PINs avoiding trivial weak patterns', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generatePin({ length: 6, rejectWeakPatterns: true });
      expect(pin).toMatch(/^\d{6}$/);
      expect(isWeakPinPattern(pin)).toBe(false);
    }

    expect(isWeakPinPattern('123456')).toBe(true);
    expect(isWeakPinPattern('1111')).toBe(true);
    expect(isWeakPinPattern('1212')).toBe(true);
    expect(isWeakPinPattern('2580')).toBe(true);
  });

  it('evaluates password and PIN strength locally', () => {
    expect(evaluateSecretStrength('1234', 'pin').isWeak).toBe(true);
    expect(evaluateSecretStrength('1998', 'pin').isWeak).toBe(true);
    expect(evaluateSecretStrength('849203', 'pin').isWeak).toBe(false);

    expect(evaluateSecretStrength('pass123', 'password').isWeak).toBe(true);
    const strong = evaluateSecretStrength(generatePassword({ length: 20 }), 'password');
    expect(strong.isWeak).toBe(false);
    expect(strong.score).toBe(4);
  });
});
