import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'HRMS-App',
  webDir: 'www',
  plugins:{
     CapacitorHttp: {
      "enabled": true
    },
    StatusBar: {
      "style": "DEFAULT", // or DARK/LIGHT
      "backgroundColor": "rgb(61, 58, 58)", // Match your app background or header color
      "overlay": false // <-- CRITICAL FIX: Stops the webview from going behind the status bar
    }
  }
};

export default config;
