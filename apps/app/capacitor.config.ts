import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cm.sabitori.app',
  appName: 'SabiTori',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
