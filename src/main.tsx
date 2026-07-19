/// <reference types="vite-plugin-pwa/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
// Self-hosted variable fonts — imported here (not via CSS @import) so Vite
// rebases and emits the woff2 files; Tailwind's PostCSS inliner does not.
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./index.css";
import "shepherd.js/dist/css/shepherd.css";
import "./onboarding/shepherdTheme.css";
import * as Sentry from "@sentry/react";
import { bootstrapHighContrast } from "./hooks/useHighContrast";
import { bootstrapOfflineQueue } from "./lib/offlineQueue";

import { registerSW } from "virtual:pwa-register";

// Apply persisted accessibility preference before the first paint.
bootstrapHighContrast();

// Wire window 'online' to auto-flush any writes queued from a previous session.
bootstrapOfflineQueue();

// Module-scope flag — resets on every real page load but survives
// background/foreground cycles within the same session (unlike sessionStorage).
// This prevents the blank-screen loop where sessionStorage's persistence
// across foreground events caused the chunk-error reload to fire only once.
let chunkReloading = false;

function handleChunkError(msg: string) {
  if (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Unable to preload CSS") ||
    msg.includes("Loading chunk")
  ) {
    // Offline-first: NEVER reload while offline — a reload hits the dead
    // network and lands on a blank/error screen, turning a retryable
    // precache miss into a hard crash. Offline, `lazyWithRetry` re-attempts
    // the import from the SW precache; if the chunk genuinely isn't cached
    // the route's error boundary shows a message the user can act on. A
    // stale-chunk reload only makes sense when we can actually fetch fresh
    // assets — i.e. online.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!chunkReloading) {
      chunkReloading = true;
      window.location.reload();
    }
  }
}
window.addEventListener("error", e => handleChunkError(e.message ?? ""));
window.addEventListener("unhandledrejection", e =>
  handleChunkError((e.reason as Error)?.message ?? ""),
);

// When a new SW version is waiting, dispatch an event so the UpdateBanner
// component can show a user-facing "Reload" prompt instead of silently
// reloading mid-session (which was disorienting and could also loop).
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // Proactively check for a new service worker while the app is open and on
    // resume, so installed PWAs pick up deploys without needing a full
    // relaunch (the SW otherwise only re-checks on navigation). Error-safe: a
    // transient iOS Safari "Load failed" during the check must never become an
    // unhandled rejection.
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      registration.update().catch(() => {
        /* offline / backgrounded mid-fetch — ignore, we'll retry on next resume */
      });
    };
    window.setInterval(checkForUpdate, 60 * 60 * 1000); // hourly while open
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
  },
  onRegisterError(error) {
    // SW registration/update fetch failed — almost always a transient iOS
    // Safari "Load failed" (offline or backgrounded mid-fetch). Handling it
    // here stops it surfacing as an unhandled rejection (Sentry RHOZLY-W).
    console.warn("[pwa] service worker registration error:", error);
  },
  onNeedRefresh() {
    if (sessionStorage.getItem("rhozly_just_saw_release_notes")) {
      sessionStorage.removeItem("rhozly_just_saw_release_notes");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("pwa-update-available", {
        detail: { reload: () => updateSW(true) },
      }),
    );
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

  beforeSend(event, hint) {
    const err = hint?.originalException;
    if (err instanceof Error && err.name === "AbortError") return null;
    if (typeof err === "string" && err.includes("AbortError")) return null;
    // Benign transient iOS Safari noise: the service-worker script update fetch
    // failed (offline / app backgrounded mid-check). Not actionable — drop it.
    // Specific match so real chunk-load failures (handled by handleChunkError)
    // still report.
    const m = err instanceof Error ? err.message : typeof err === "string" ? err : "";
    if (m.includes("sw.js") && m.toLowerCase().includes("load failed")) return null;
    return event;
  },

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
