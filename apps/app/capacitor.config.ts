import type { CapacitorConfig } from '@capacitor/cli';

// Same stone as --ground in DESIGN.md (light / dark).
const GROUND = '#EEF0EC';

const config: CapacitorConfig = {
  appId: 'cm.sabitori.app',
  appName: 'SabiTori',
  webDir: 'dist',
  backgroundColor: GROUND,
  android: { allowMixedContent: false },
  plugins: {
    // Edge-to-edge: the page draws under the bars and uses env(safe-area-inset-*) (viewport-fit=cover).
    // The bar icons follow the phone's light/dark setting, the same switch the CSS theme follows.
    SystemBars: { insetsHandling: 'css', style: 'DEFAULT' },
    // The native splash (res/values/styles.xml) stays until the first screen is ready (App.tsx calls hide()).
    // 3 s is only a safety net so a failed start can never leave the splash stuck.
    SplashScreen: { launchShowDuration: 3000, launchAutoHide: true, launchFadeOutDuration: 200, backgroundColor: GROUND },
    LocalNotifications: { smallIcon: 'ic_stat_sabitori', iconColor: '#121A16' },
  },
};

export default config;
