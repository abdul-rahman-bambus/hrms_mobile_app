import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'bambus.hrms.app',
  appName: 'HRMS-App',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    allowNavigation: [],
    cleartext: true,
  },
  plugins: {
    CapacitorHttp: {
      "enabled": true
    },
    StatusBar: {
      "style": "LIGHT",
      "backgroundColor": "#388E3C"
    }
  }
};

export default config;
