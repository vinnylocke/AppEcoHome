import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@imgly/background-removal", "onnxruntime-web"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "three": ["three"],
        },
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // This tells Vite to bundle your manifest automatically
      manifest: false,
      workbox: {
        clientsClaim: true,
        // skipWaiting intentionally omitted — new SW waits until the user
        // taps "Reload" in the UpdateBanner, preventing old JS running with
        // a new SW (which was causing mid-session white screens).
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,mjs,css,html,ico,png,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\//,
            handler: "NetworkFirst",
            options: { cacheName: "remote-resources" },
          },
        ],
      },
    }),
  ],
});
