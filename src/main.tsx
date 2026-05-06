import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import * as Sentry from "@sentry/react";

import { registerSW } from "virtual:pwa-register";

// When a new service worker activates it replaces cached JS chunks.
// If the running app tries to lazy-load an old chunk that no longer exists
// it gets a network error and React renders nothing.  Reload once to pick
// up the fresh bundle — the sessionStorage flag prevents infinite loops.
function handleChunkError(msg: string) {
  if (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Unable to preload CSS") ||
    msg.includes("Loading chunk")
  ) {
    if (!sessionStorage.getItem("chunk_reload")) {
      sessionStorage.setItem("chunk_reload", "1");
      window.location.reload();
    }
  }
}
window.addEventListener("error", e => handleChunkError(e.message ?? ""));
window.addEventListener("unhandledrejection", e =>
  handleChunkError((e.reason as Error)?.message ?? ""),
);

// Auto-reload when a new SW version is waiting — keeps cached assets in sync.
registerSW({
  immediate: true,
  onNeedRefresh() {
    if (!sessionStorage.getItem("sw_refresh")) {
      sessionStorage.setItem("sw_refresh", "1");
      window.location.reload();
    }
  },
  onOfflineReady() {},
});

// Initialize Sentry before the app renders
Sentry.init({
  // You will get this DSN from your Sentry.io dashboard
  dsn: import.meta.env.VITE_SENTRY_DSN,

  // Only send errors to Sentry if we are in production,
  // so we don't spam our quota with local 'localhost' testing errors!
  enabled: import.meta.env.PROD,
  //enabled: true,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  // Performance Monitoring
  tracesSampleRate: 1.0,

  // Session Replay (Records a video of the user's screen when it crashes!)
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

function RootCrashFallback() {
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, fontFamily: "sans-serif", background: "#f0fdf4" }}>
      <p style={{ fontWeight: 900, fontSize: 16, color: "#166534", margin: 0 }}>Something went wrong</p>
      <p style={{ fontSize: 13, color: "#4b7c60", margin: 0, textAlign: "center" }}>Tap below to reload the app.</p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: "12px 28px", borderRadius: 16, background: "#22c55e", color: "#fff", fontWeight: 900, fontSize: 14, border: "none", cursor: "pointer" }}
      >
        Reload
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<RootCrashFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
