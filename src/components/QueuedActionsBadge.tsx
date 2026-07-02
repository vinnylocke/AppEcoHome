import React, { useSyncExternalStore } from "react";
import { Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { useOfflineQueue } from "../hooks/useOfflineQueue";

// Live online state: reading navigator.onLine during render froze the value
// until an unrelated re-render — after connectivity returned, the badge
// could stay disabled ("Will sync when you're back online") indefinitely.
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Header chip showing how many actions are waiting to sync. Tappable to
 * trigger a manual flush. Self-hides when the queue is empty.
 */
export default function QueuedActionsBadge() {
  const { count, flush, isFlushing } = useOfflineQueue();
  const online = useOnline();

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={flush}
      disabled={isFlushing || !online}
      data-testid="queued-actions-badge"
      title={online ? "Tap to sync now" : "Will sync when you're back online"}
      className="flex items-center gap-1.5 bg-sky-500/20 border border-sky-300/40 text-sky-100 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full hover:bg-sky-500/30 transition-colors disabled:opacity-60"
    >
      {isFlushing ? (
        <Loader2 size={11} className="animate-spin" />
      ) : online ? (
        <RefreshCw size={11} />
      ) : (
        <UploadCloud size={11} />
      )}
      <span>{count} queued</span>
    </button>
  );
}
