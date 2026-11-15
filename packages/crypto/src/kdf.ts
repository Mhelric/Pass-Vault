import { argon2id } from 'hash-wasm';
import { base64ToBytes, bytesToBase64, randomBytes, toArrayBuffer, utf8ToBytes } from './encoding.js';
import { zeroize } from './memory.js';

export type KdfAlgorithm = 'argon2id' | 'pbkdf2-sha256';

export interface KdfParams {
  algorithm: KdfAlgorithm;
  salt: string;       // Base64 16-byte salt
  iterations: number; // Argon2id: 3 passes | PBKDF2: 600,000 iterations
  memory: number;     // Argon2id memory cost in KiB (default 65536 = 64 MiB)
  parallelism: number;
}

export const DEFAULT_ARGON2_MEMORY_KIB = 65_536;
export const DEFAULT_ARGON2_ITERATIONS = 3;
export const DEFAULT_ARGON2_PARALLELISM = 1;
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

/** Create default KDF parameters with a fresh 128-bit random salt. */
export function createDefaultKdfParams(algorithm: KdfAlgorithm = 'argon2id'): KdfParams {
  const salt = bytesToBase64(randomBytes(16));
  if (algorithm === 'pbkdf2-sha256') {
    return {
      algorithm: 'pbkdf2-sha256',
      salt,
      iterations: DEFAULT_PBKDF2_ITERATIONS,
      memory: 0,
      parallelism: 1,
    };
  }
  return {
    algorithm: 'argon2id',
    salt,
    iterations: DEFAULT_ARGON2_ITERATIONS,
    memory: DEFAULT_ARGON2_MEMORY_KIB,
    parallelism: DEFAULT_ARGON2_PARALLELISM,
  };
}

/**
 * Derive a 256-bit Master Key from the user's Master Password and KDF parameters.
 * Runs strictly on-device; never transmit either the Master Password or derived key.
 */
export async function deriveMasterKey(
  masterPassword: string,
  params: KdfParams
): Promise<Uint8Array> {
  if (!masterPassword) {
    throw new Error('Master password must not be empty');
  }

  const saltBytes = base64ToBytes(params.salt);
  if (saltBytes.byteLength < 16) {
    throw new Error('KDF salt must be at least 16 bytes (128 bits)');
  }

  if (params.algorithm === 'argon2id') {
    return argon2id({
      password: masterPassword,
      salt: saltBytes,
      parallelism: params.parallelism,
      iterations: params.iterations,
      memorySize: params.memory,
      hashLength: 32,
      outputType: 'binary',
    });
  }

  if (params.algorithm === 'pbkdf2-sha256') {
    const passwordBytes = utf8ToBytes(masterPassword);
    try {
      const baseKey = await globalThis.crypto.subtle.importKey(
        'raw',
        toArrayBuffer(passwordBytes),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const derivedBits = await globalThis.crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: toArrayBuffer(saltBytes),
          iterations: params.iterations,
          hash: 'SHA-256',
        },
        baseKey,
        256
      );
      return new Uint8Array(derivedBits);
    } finally {
      zeroize(passwordBytes);
    }
  }

  throw new Error(`Unsupported KDF algorithm: ${String(params.algorithm)}`);
}
