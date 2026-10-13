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
  plugins:{
     CapacitorHttp: {
      "enabled": true
    },
    StatusBar: {
      "style": "DEFAULT", // or DARK/LIGHT
      "backgroundColor": "rgb(61, 58, 58)", // Match your app background or header color
      "overlaysWebView": false // <-- CRITICAL FIX: Stops the webview from going behind the status bar
    }
  }
};

export default config;
