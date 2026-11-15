import { argon2id } from 'hash-wasm';
import { decryptBytes, encryptBytes, VaultCryptoError } from './cipher.js';
import { base64ToBytes, bytesToBase64, randomBytes, toArrayBuffer, utf8ToBytes } from './encoding.js';
import { zeroize } from './memory.js';

const VEK_WRAP_INFO = 'vault-vek-wrap-v1';
const VEK_WRAP_AAD = utf8ToBytes('vault-vek-v1');
const PIN_WRAP_AAD = utf8ToBytes('vault-pin-vek-v1');
const DEFAULT_PIN_MEMORY_KIB = 16_384;
const DEFAULT_PIN_ITERATIONS = 3;

/** Derive a 256-bit purpose-specific subkey via HKDF-SHA256. */
export async function deriveSubkey(
  inputKeyMaterial: Uint8Array,
  info: string,
  saltBytes: Uint8Array = new Uint8Array(32)
): Promise<Uint8Array> {
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(inputKeyMaterial),
    'HKDF',
    false,
    ['deriveBits']
  );

  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(saltBytes),
      info: toArrayBuffer(utf8ToBytes(info)),
    },
    baseKey,
    256
  );

  return new Uint8Array(derivedBits);
}

/** Generate a fresh random 256-bit Vault Encryption Key (VEK). */
export function generateVek(): Uint8Array {
  return randomBytes(32);
}

/** Wrap the VEK with a HKDF subkey derived from the Master Key. */
export async function wrapVek(
  vek: Uint8Array,
  masterKey: Uint8Array
): Promise<{ encryptedVek: string; vekIv: string }> {
  const kwk = await deriveSubkey(masterKey, VEK_WRAP_INFO);
  try {
    const { ciphertext, iv } = await encryptBytes(vek, kwk, VEK_WRAP_AAD);
    return { encryptedVek: ciphertext, vekIv: iv };
  } finally {
    zeroize(kwk);
  }
}

/** Unwrap the VEK using the derived Master Key. */
export async function unwrapVek(
  encryptedVek: string,
  vekIv: string,
  masterKey: Uint8Array
): Promise<Uint8Array> {
  const kwk = await deriveSubkey(masterKey, VEK_WRAP_INFO);
  try {
    return await decryptBytes(encryptedVek, vekIv, kwk, VEK_WRAP_AAD);
  } finally {
    zeroize(kwk);
  }
}

function validateQuickPin(pin: string): void {
  if (!/^\d{6}$/.test(pin)) {
    throw new VaultCryptoError('Quick-unlock PIN must be exactly 6 numeric digits');
  }
}

async function derivePinKek(
  pin: string,
  saltBytes: Uint8Array,
  memoryKiB: number
): Promise<Uint8Array> {
  validateQuickPin(pin);
  return argon2id({
    password: pin,
    salt: saltBytes,
    parallelism: 1,
    iterations: DEFAULT_PIN_ITERATIONS,
    memorySize: memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  });
}

/**
 * Wrap the VEK locally with a 6-digit Quick-Unlock PIN + random device salt.
 * Stored strictly inside local IndexedDB (never synced to Supabase).
 */
export async function wrapVekWithPin(
  vek: Uint8Array,
  pin: string,
  kdfMemoryKiB: number = DEFAULT_PIN_MEMORY_KIB
): Promise<{ pinWrappedVek: string; pinIv: string; pinSalt: string }> {
  const saltBytes = randomBytes(16);
  const pinKek = await derivePinKek(pin, saltBytes, kdfMemoryKiB);
  try {
    const { ciphertext, iv } = await encryptBytes(vek, pinKek, PIN_WRAP_AAD);
    return {
      pinWrappedVek: ciphertext,
      pinIv: iv,
      pinSalt: bytesToBase64(saltBytes),
    };
  } finally {
    zeroize(pinKek);
  }
}

/** Unwrap the locally stored VEK using the user's 6-digit Quick-Unlock PIN. */
export async function unwrapVekWithPin(
  pinWrappedVek: string,
  pinIv: string,
  pinSalt: string,
  pin: string,
  kdfMemoryKiB: number = DEFAULT_PIN_MEMORY_KIB
): Promise<Uint8Array> {
  const saltBytes = base64ToBytes(pinSalt);
  if (saltBytes.byteLength < 16) {
    throw new VaultCryptoError('Invalid device PIN salt');
  }
  const pinKek = await derivePinKek(pin, saltBytes, kdfMemoryKiB);
  try {
    return await decryptBytes(pinWrappedVek, pinIv, pinKek, PIN_WRAP_AAD);
  } finally {
    zeroize(pinKek);
  }
}
