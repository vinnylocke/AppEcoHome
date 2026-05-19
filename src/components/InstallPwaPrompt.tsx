import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";

const LS_DISMISSED = "rhozly_pwa_install_dismissed";
const LS_INSTALLED = "rhozly_pwa_installed";

/**
 * Listens for the browser's `beforeinstallprompt` event (Chrome/Edge/Android)
 * and surfaces a compact "Install Rhozly" card. Hides itself when:
 *   - running inside Capacitor (already a native app),
 *   - the user is already running the installed PWA (display-mode: standalone),
 *   - the user dismissed the prompt previously,
 *   - the browser already raised `appinstalled` for this device.
 *
 * Safari iOS doesn't fire beforeinstallprompt; we don't show anything there to
 * avoid showing a button that doesn't work.
 */
export default function InstallPwaPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    // Already running as installed PWA
    if (window.matchMedia?.("(display-mode: standalone)").matches) return;
    if (localStorage.getItem(LS_DISMISSED) === "true") return;
    if (localStorage.getItem(LS_INSTALLED) === "true") return;

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    const onInstalled = () => {
      localStorage.setItem(LS_INSTALLED, "true");
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible || !deferred) return null;

  const install = async () => {
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice?.outcome === "accepted") {
        localStorage.setItem(LS_INSTALLED, "true");
      } else {
        localStorage.setItem(LS_DISMISSED, "true");
      }
    } catch { /* ignore */ }
    setVisible(false);
    setDeferred(null);
  };

  const dismiss = () => {
    localStorage.setItem(LS_DISMISSED, "true");
    setVisible(false);
  };

  return (
    <div
      data-testid="pwa-install-prompt"
      className="bg-gradient-to-br from-rhozly-primary to-emerald-600 text-white rounded-3xl p-4 shadow-md relative overflow-hidden"
    >
      <button
        data-testid="pwa-install-dismiss"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors"
      >
        <X size={14} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="bg-white/20 p-2.5 rounded-2xl shrink-0">
          <Download size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm leading-tight">Install Rhozly on this device</p>
          <p className="text-xs text-white/80 leading-snug mt-0.5">
            Faster load, full-screen, and a home-screen icon — works offline for recent data.
          </p>
          <button
            data-testid="pwa-install-accept"
            onClick={install}
            className="mt-2.5 bg-white text-rhozly-primary text-xs font-black px-3.5 py-2 min-h-[36px] rounded-full hover:bg-white/90 transition"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
