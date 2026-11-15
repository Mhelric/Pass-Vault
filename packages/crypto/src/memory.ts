/**
 * Overwrite sensitive byte buffers in place when keys or plaintexts leave scope.
 * Note: JavaScript strings are immutable and cannot be deterministically wiped,
 * so cryptographic secrets should stay in Uint8Array buffers whenever possible.
 */
export function zeroize(...buffers: Array<Uint8Array | null | undefined>): void {
  for (const buffer of buffers) {
    if (buffer) {
      buffer.fill(0);
    }
  }
}

/** Compare two equal-length byte buffers in constant time to prevent timing leaks. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
