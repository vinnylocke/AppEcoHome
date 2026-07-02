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
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/leaflet") || id.includes("node_modules/react-leaflet")) return "leaflet";
          if (id.includes("node_modules/konva") || id.includes("node_modules/react-konva")) return "konva";
          if (id.includes("node_modules/recharts")) return "recharts";
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
        // Only static media gets a runtime cache. Anything without a route
        // here (Supabase REST / Auth / Edge Functions / Realtime, Open-Meteo,
        // Firebase) is NetworkOnly — the documented PWA contract (22-pwa.md).
        // The previous /^https:\/\// NetworkFirst catch-all wrote every
        // authenticated PostgREST response into Cache Storage: stale data
        // replayed after mutations on flaky networks, another account's rows
        // readable at rest on shared devices, and unbounded growth.
        runtimeCaching: [
          {
            // Supabase Storage PUBLIC objects (plant/journal photos) —
            // content-addressed by URL, not permission-gated.
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-public-media",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
            },
          },
          {
            // External image hosts used by SmartImage / guides.
            urlPattern: /^https:\/\/(images\.unsplash\.com|upload\.wikimedia\.org|perenual\.com)\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "remote-images",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
            },
          },
        ],
      },
    }),
  ],
});
