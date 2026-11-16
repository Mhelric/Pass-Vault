import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mhelric.passvault',
  appName: 'Pass-Vault',
  webDir: 'dist',
  backgroundColor: '#09090b',
  android: {
    allowMixedContent: false,
    backgroundColor: '#09090b',
  },
};

export default config;
