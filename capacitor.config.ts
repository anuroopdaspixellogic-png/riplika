import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.riplika.app',
  appName: 'Riplika',
  webDir: 'dist',
  backgroundColor: '#080b10',
  server: {
    // Served to the WebView as https://localhost, which is a secure context
    // and allows getUserMedia (camera/microphone) on Android.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
