import React, { useState } from "react";
import { AlertTriangle, Home, Send, CheckCircle, Loader2 } from "lucide-react";

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

export default function ErrorPage({ error, appVersion }: ErrorPageProps) {
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

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
