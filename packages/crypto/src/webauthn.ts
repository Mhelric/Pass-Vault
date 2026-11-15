import { decryptBytes, encryptBytes, VaultCryptoError } from './cipher.js';
import { utf8ToBytes } from './encoding.js';
import { deriveSubkey } from './hkdf.js';
import { zeroize } from './memory.js';

const WEBAUTHN_WRAP_INFO = 'vault-webauthn-vek-v1';
const WEBAUTHN_WRAP_AAD = utf8ToBytes('vault-webauthn-v1');

/**
 * Check whether the current device exposes a hardware/OS platform authenticator
 * capable of biometric or local user verification (FaceID, TouchID, Fingerprint, Windows Hello).
 */
export async function isPlatformBiometricAvailable(): Promise<boolean> {
  if (typeof globalThis.window === 'undefined') {
    return false;
  }
  const pkc = globalThis.window.PublicKeyCredential;
  if (!pkc || typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }
  try {
    return await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Wrap the VEK with a hardware-backed biometric or WebAuthn PRF secret.
 * Never store `prfOrBioSecret` unencrypted alongside `bioWrappedVek`.
 */
export async function wrapVekWithBiometricSecret(
  vek: Uint8Array,
  prfOrBioSecret: Uint8Array
): Promise<{ bioWrappedVek: string; bioIv: string }> {
  if (prfOrBioSecret.byteLength < 16) {
    throw new VaultCryptoError('Biometric wrapping secret must be at least 16 bytes');
  }
  const bioKek = await deriveSubkey(prfOrBioSecret, WEBAUTHN_WRAP_INFO);
  try {
    const { ciphertext, iv } = await encryptBytes(vek, bioKek, WEBAUTHN_WRAP_AAD);
    return { bioWrappedVek: ciphertext, bioIv: iv };
  } finally {
    zeroize(bioKek);
  }
}

/** Unwrap the VEK after hardware biometric verification yields `prfOrBioSecret`. */
export async function unwrapVekWithBiometricSecret(
  bioWrappedVek: string,
  bioIv: string,
  prfOrBioSecret: Uint8Array
): Promise<Uint8Array> {
  if (prfOrBioSecret.byteLength < 16) {
    throw new VaultCryptoError('Biometric unwrapping secret must be at least 16 bytes');
  }
  const bioKek = await deriveSubkey(prfOrBioSecret, WEBAUTHN_WRAP_INFO);
  try {
    return await decryptBytes(bioWrappedVek, bioIv, bioKek, WEBAUTHN_WRAP_AAD);
  } finally {
    zeroize(bioKek);
  }
}
