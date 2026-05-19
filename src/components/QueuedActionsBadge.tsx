import React from "react";
import { Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { useOfflineQueue } from "../hooks/useOfflineQueue";

/**
 * Header chip showing how many actions are waiting to sync. Tappable to
 * trigger a manual flush. Self-hides when the queue is empty.
 */
export default function QueuedActionsBadge() {
  const { count, flush, isFlushing } = useOfflineQueue();

  if (count === 0) return null;

  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

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
