export const APP_VERSION = '1.0.1';

export const VERSION_MANIFEST_URL = 'https://pass-vault-mhel.vercel.app/version.json';

export interface RemoteVersionManifest {
  version: string;
  apkUrl: string;
  notes?: string;
}

export function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const r = parse(remote);
  const c = parse(current);
  const len = Math.max(r.length, c.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] ?? 0;
    const cv = c[i] ?? 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
}
