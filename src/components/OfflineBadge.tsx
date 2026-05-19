import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Top-bar offline indicator. Listens to the browser's `online` / `offline`
 * events and renders a small chip when the user is offline. Self-hides as soon
 * as connectivity returns. Render anywhere — it positions absolutely.
 */
export default function OfflineBadge() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      data-testid="offline-badge"
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-300/40 text-amber-100 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
      title="You're offline — changes will sync when connection returns"
    >
      <WifiOff size={11} />
      Offline
    </div>
  );
}
