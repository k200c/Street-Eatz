import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ie.streeteatzwaterford.app',
  appName: 'Street Eatz',
  webDir: 'dist',
  ios: {
    backgroundColor: '#000000',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
