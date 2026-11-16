import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeBiometricPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  enroll(options: { userId: string; secretB64: string }): Promise<{ enrolled: boolean }>;
  authenticate(options: { userId: string }): Promise<{ secretB64: string }>;
}

const NativeBiometric = registerPlugin<NativeBiometricPlugin>('NativeBiometric');

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function isNativeBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const res = await NativeBiometric.isAvailable();
    return Boolean(res?.available);
  } catch {
    return false;
  }
}

export async function enrollNativeBiometric(userId: string, secret: Uint8Array): Promise<void> {
  await NativeBiometric.enroll({
    userId,
    secretB64: toBase64(secret),
  });
}

export async function authenticateNativeBiometric(userId: string): Promise<Uint8Array> {
  const res = await NativeBiometric.authenticate({ userId });
  return fromBase64(res.secretB64);
}
