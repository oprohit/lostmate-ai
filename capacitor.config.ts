import type { CapacitorConfig } from "@capacitor/cli";

const deployedUrl = process.env.CAPACITOR_SERVER_URL || "https://lostmate-ai.netlify.app";

const config: CapacitorConfig = {
  appId: "ai.lostmate.app",
  appName: "LostMate AI",
  webDir: "public",
  server: {
    url: deployedUrl,
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#09091a",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#09091a",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
