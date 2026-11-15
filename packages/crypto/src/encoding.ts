const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** Encode a UTF-8 string into bytes. */
export function utf8ToBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

/** Decode UTF-8 bytes back into a string (throws on invalid UTF-8). */
export function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/** Encode arbitrary bytes to standard Base64 safely across browsers, workers, and Node. */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Decode a Base64 string back into a Uint8Array. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Generate cryptographically secure random bytes via Web Crypto CSPRNG. */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError(`randomBytes length must be a positive integer, got ${length}`);
  }
  const buffer = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buffer);
  return buffer;
}

/** Return an exact ArrayBuffer copy suitable for strict Web Crypto BufferSource inputs. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
