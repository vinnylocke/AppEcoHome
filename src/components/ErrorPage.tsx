import React, { useMemo, useState } from "react";
import { AlertTriangle, Home, Send, CheckCircle, Loader2, Copy, ArrowLeft, RefreshCw, Trash2 } from "lucide-react";

interface ErrorPageProps {
  error?: Error;
  appVersion?: string;
}

function collectDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screenSize: `${screen.width}×${screen.height} (dpr ${window.devicePixelRatio ?? 1})`,
    language: navigator.language,
    onLine: navigator.onLine,
    pageUrl: window.location.href,
    timestamp: new Date().toISOString(),
  };
}

// Stable short ID for this render — gives the user something to copy / quote
// in a support email without exposing the full stack trace.
function generateErrorId(error?: Error): string {
  const base = (error?.message ?? "unknown") + Date.now();
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }
  const positive = Math.abs(hash).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `RZ-${positive}`;
}

export default function ErrorPage({ error, appVersion }: ErrorPageProps) {
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [copied, setCopied] = useState(false);
  const errorId = useMemo(() => generateErrorId(error), [error]);

  const copyErrorId = async () => {
    try {
      await navigator.clipboard.writeText(errorId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/dashboard";
  };

  const hardReload = () => {
    // Clear known caches that could be holding broken state, then reload
    try {
      sessionStorage.clear();
      // Don't clear localStorage entirely — preserves their preferences.
      // The offline queue is preserved too: it holds the user's UNSYNCED
      // garden actions, not cached state — wiping it here silently lost
      // work. Both prefix conventions are matched (`rhozly_` legacy and
      // `rhozly:` colon-namespaced — dashboard/seasonal-picks caches, the
      // most likely holders of poisoned state, use the latter).
      const preserve = [
        "rhozly_welcomed",
        "rhozly_notif_prefs",
        "rhozly_dashboard_view",
        "rhozly_offline_queue_v1",
      ];
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (preserve.includes(k)) continue;
        if (k.startsWith("rhozly_") || k.startsWith("rhozly:")) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
    // Runtime service-worker caches can hold the broken responses too.
    if ("caches" in window) {
      void caches.keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .catch(() => {})
        .finally(() => window.location.reload());
      return;
    }
    // Cast: TS narrows `window` to `never` here because the DOM lib types
    // `caches` as always present; older browsers can still reach this line.
    (window as Window).location.reload();
  };

  const sendReport = async () => {
    setReportState("sending");
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/report-error`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          errorId,
          errorMessage: error?.message ?? "Unknown error",
          errorStack: error?.stack ?? null,
          appVersion: appVersion ?? null,
          ...collectDeviceInfo(),
        }),
      });
      setReportState(res.ok ? "sent" : "failed");
    } catch {
      setReportState("failed");
    }
  };

  return (
    <div
      data-testid="error-page"
      className="min-h-screen bg-rhozly-bg flex flex-col items-center justify-center p-6"
    >
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="w-16 h-16 bg-red-100 rounded-3xl flex items-center justify-center mx-auto">
          <AlertTriangle size={28} className="text-red-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-rhozly-on-surface">
            Something went wrong
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/50 leading-snug">
            An unexpected error occurred. Your data is safe.
          </p>
        </div>

        {/* Copy-able error ID — quick reference for support */}
        <button
          data-testid="error-page-copy-id"
          onClick={copyErrorId}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-rhozly-surface-low border border-rhozly-outline/20 rounded-2xl text-xs font-bold text-rhozly-on-surface/70 hover:bg-rhozly-surface hover:border-rhozly-outline/40 transition-colors"
          title="Copy error reference"
        >
          <span className="flex flex-col items-start min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/40 leading-none">
              Error reference
            </span>
            <span className="font-mono font-black text-rhozly-primary mt-0.5">{errorId}</span>
          </span>
          <span className="flex items-center gap-1.5 text-rhozly-on-surface/50 shrink-0">
            {copied ? <CheckCircle size={13} className="text-emerald-600" /> : <Copy size={13} />}
            <span className="text-[10px] font-black uppercase tracking-widest">{copied ? "Copied" : "Copy"}</span>
          </span>
        </button>

        {/* Recovery suggestions */}
        <div className="text-left space-y-2 bg-white border border-rhozly-outline/15 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">
            Try one of these
          </p>
          <button
            data-testid="error-page-back"
            onClick={goBack}
            className="w-full flex items-center gap-3 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold text-rhozly-on-surface/75 hover:bg-rhozly-primary/5 transition-colors"
          >
            <ArrowLeft size={14} className="text-rhozly-primary shrink-0" />
            <span className="text-left">Go back to the previous screen</span>
          </button>
          <button
            data-testid="error-page-reload"
            onClick={hardReload}
            className="w-full flex items-center gap-3 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold text-rhozly-on-surface/75 hover:bg-rhozly-primary/5 transition-colors"
          >
            <RefreshCw size={14} className="text-rhozly-primary shrink-0" />
            <span className="text-left">Reload the app (keeps your preferences)</span>
          </button>
          <button
            data-testid="error-page-clear"
            onClick={() => {
              try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
              window.location.href = "/dashboard";
            }}
            className="w-full flex items-center gap-3 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold text-rhozly-on-surface/75 hover:bg-rhozly-primary/5 transition-colors"
          >
            <Trash2 size={14} className="text-rhozly-on-surface/50 shrink-0" />
            <span className="text-left">Clear local data and start fresh</span>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <button
            data-testid="error-page-go-home"
            onClick={() => { window.location.href = "/dashboard"; }}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all shadow-lg"
          >
            <Home size={16} />
            Go to Dashboard
          </button>

          {reportState === "sent" ? (
            <div className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-50 text-green-700 rounded-2xl font-black text-sm border border-green-200">
              <CheckCircle size={16} />
              Report sent — thank you
            </div>
          ) : (
            <button
              data-testid="error-page-send-report"
              onClick={sendReport}
              disabled={reportState === "sending" || !error}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-rhozly-on-surface/70 rounded-2xl font-black text-sm border border-rhozly-outline/30 hover:border-rhozly-primary/40 hover:text-rhozly-primary active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reportState === "sending" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              {reportState === "sending" ? "Sending…" : reportState === "failed" ? "Try again" : "Send error report"}
            </button>
          )}
        </div>

        {error && (
          <details className="text-left bg-rhozly-surface rounded-2xl p-4 border border-rhozly-outline/20">
            <summary className="text-xs font-black text-rhozly-on-surface/50 uppercase tracking-widest cursor-pointer">
              Technical details
            </summary>
            <pre className="mt-3 text-[10px] text-red-600 whitespace-pre-wrap break-words font-mono leading-relaxed">
              {appVersion ? `Version: ${appVersion}\n\n` : ""}
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
