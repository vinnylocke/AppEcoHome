import React from "react";
import { AlertTriangle, Home } from "lucide-react";

interface ErrorPageProps {
  error?: Error;
}

export default function ErrorPage({ error }: ErrorPageProps) {
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

        <button
          data-testid="error-page-go-home"
          onClick={() => { window.location.href = "/dashboard"; }}
          className="inline-flex items-center gap-2 px-6 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all shadow-lg"
        >
          <Home size={16} />
          Go to Dashboard
        </button>

        {import.meta.env.DEV && error && (
          <details className="text-left bg-rhozly-surface rounded-2xl p-4 border border-rhozly-outline/20">
            <summary className="text-xs font-black text-rhozly-on-surface/50 uppercase tracking-widest cursor-pointer">
              Technical details
            </summary>
            <pre className="mt-3 text-[10px] text-red-600 whitespace-pre-wrap break-words font-mono leading-relaxed">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
