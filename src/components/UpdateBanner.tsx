import React, { useState, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [reloadFn, setReloadFn] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { reload } = (e as CustomEvent<{ reload: () => void }>).detail;
      setReloadFn(() => reload);
      setVisible(true);
    };
    window.addEventListener("pwa-update-available", handler);
    return () => window.removeEventListener("pwa-update-available", handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      data-testid="update-banner"
      className="fixed bottom-6 left-4 right-4 z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-rhozly-primary text-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300 sm:left-auto sm:right-6 sm:w-80"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black leading-tight">Update available</p>
        <p className="text-xs text-white/65 font-medium mt-0.5">
          A new version of Rhozly is ready.
        </p>
      </div>
      <button
        data-testid="update-banner-reload"
        onClick={() => reloadFn?.()}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 transition-colors text-sm font-bold"
      >
        <RefreshCw size={13} />
        Reload
      </button>
      <button
        data-testid="update-banner-dismiss"
        onClick={() => setVisible(false)}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/20 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
