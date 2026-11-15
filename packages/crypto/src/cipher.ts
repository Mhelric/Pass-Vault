import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  randomBytes,
  toArrayBuffer,
  utf8ToBytes,
} from './encoding.js';
import { zeroize } from './memory.js';

export const AES_KEY_LENGTH_BYTES = 32;
export const AES_GCM_IV_LENGTH_BYTES = 12;

export class VaultCryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VaultCryptoError';
  }
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

export interface EncryptedJsonResult {
  encryptedPayload: string;
  iv: string;
}

async function importAesGcmKey(
  keyBytes: Uint8Array,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  if (keyBytes.byteLength !== AES_KEY_LENGTH_BYTES) {
    throw new VaultCryptoError(
      `Expected a ${AES_KEY_LENGTH_BYTES}-byte AES-256 key, received ${keyBytes.byteLength} bytes`
    );
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

/** Encrypt raw bytes using AES-256-GCM with a fresh random 96-bit IV and optional AAD. */
export async function encryptBytes(
  plaintext: Uint8Array,
  keyBytes: Uint8Array,
  aad?: Uint8Array
): Promise<EncryptedPayload> {
  const ivBytes = randomBytes(AES_GCM_IV_LENGTH_BYTES);
  const cryptoKey = await importAesGcmKey(keyBytes, ['encrypt']);

  const algorithm: AesGcmParams = {
    name: 'AES-GCM',
    iv: toArrayBuffer(ivBytes),
    tagLength: 128,
    ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
  };

  const encryptedBuffer = await globalThis.crypto.subtle.encrypt(
    algorithm,
    cryptoKey,
    toArrayBuffer(plaintext)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(ivBytes),
  };
}

/** Decrypt AES-256-GCM Base64 ciphertext; throws VaultCryptoError on auth tag mismatch. */
export async function decryptBytes(
  ciphertextB64: string,
  ivB64: string,
  keyBytes: Uint8Array,
  aad?: Uint8Array
): Promise<Uint8Array> {
  let ivBytes: Uint8Array;
  let ciphertextBytes: Uint8Array;

  try {
    ivBytes = base64ToBytes(ivB64);
    ciphertextBytes = base64ToBytes(ciphertextB64);
  } catch (error) {
    throw new VaultCryptoError('Malformed Base64 ciphertext or IV', { cause: error });
  }

  if (ivBytes.byteLength !== AES_GCM_IV_LENGTH_BYTES) {
    throw new VaultCryptoError(
      `Invalid AES-GCM IV length: expected ${AES_GCM_IV_LENGTH_BYTES} bytes, got ${ivBytes.byteLength}`
    );
  }

  const cryptoKey = await importAesGcmKey(keyBytes, ['decrypt']);
  const algorithm: AesGcmParams = {
    name: 'AES-GCM',
    iv: toArrayBuffer(ivBytes),
    tagLength: 128,
    ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
  };

  try {
    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      algorithm,
      cryptoKey,
      toArrayBuffer(ciphertextBytes)
    );
    return new Uint8Array(decryptedBuffer);
  } catch (error) {
    throw new VaultCryptoError('Decryption failed: invalid key or tampered ciphertext', {
      cause: error,
    });
  }
}

/** Serialize and encrypt a vault item payload with optional itemId AAD binding. */
export async function encryptJson<T>(
  data: T,
  vek: Uint8Array,
  itemId?: string
): Promise<EncryptedJsonResult> {
  const plaintextBytes = utf8ToBytes(JSON.stringify(data));
  const aad = itemId ? utf8ToBytes(itemId) : undefined;
  try {
    const { ciphertext, iv } = await encryptBytes(plaintextBytes, vek, aad);
    return { encryptedPayload: ciphertext, iv };
  } finally {
    zeroize(plaintextBytes);
  }
}

/** Decrypt and parse a vault item payload, verifying itemId AAD if provided. */
export async function decryptJson<T>(
  encryptedPayload: string,
  iv: string,
  vek: Uint8Array,
  itemId?: string
): Promise<T> {
  const aad = itemId ? utf8ToBytes(itemId) : undefined;
  const plaintextBytes = await decryptBytes(encryptedPayload, iv, vek, aad);
  try {
    return JSON.parse(bytesToUtf8(plaintextBytes)) as T;
  } catch (error) {
    throw new VaultCryptoError('Decrypted vault payload is not valid JSON', { cause: error });
  } finally {
    zeroize(plaintextBytes);
  }
}
