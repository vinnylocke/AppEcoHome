import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rhozly.app",
  appName: "Rhozly",
  webDir: "dist",
  server: {
    // 🚀 REPLACE THIS URL WITH YOUR VITE NETWORK IP
    //url: "http://192.168.4.39:5173",
    url: "https://rhozly.com",
    cleartext: true,
  },
};

export default config;
