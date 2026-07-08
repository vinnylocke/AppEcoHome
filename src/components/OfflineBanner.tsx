import React from "react";
import { WifiOff, RefreshCw, Loader2, CloudOff } from "lucide-react";
import { useOnline } from "../hooks/useOnline";
import { useOfflineQueue } from "../hooks/useOfflineQueue";

/**
 * Full-width connectivity strip below the header (offline-first Phase 0).
 *
 * Clearer than the old tiny header chip: it tells the user in plain words
 * that they can keep working offline, shows how many changes are waiting,
 * and offers a manual sync. Self-hides when online with an empty queue.
 *
 * `bootedFromCache` surfaces the specific "opened offline, showing your last
 * saved data" state so a stale dashboard doesn't look like a bug.
 */
export default function OfflineBanner({ bootedFromCache = false }: { bootedFromCache?: boolean }) {
  const online = useOnline();
  const { count, flush, isFlushing } = useOfflineQueue();

  // Nothing to say: online, synced, and not showing stale cached data.
  if (online && count === 0 && !bootedFromCache) return null;

  const queuedLabel =
    count === 0 ? "" : count === 1 ? "1 change waiting to sync" : `${count} changes waiting to sync`;

  if (!online) {
    return (
      <div
        data-testid="offline-banner"
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 bg-amber-100 border-b border-amber-300 text-amber-900 px-4 md:px-8 py-2 text-xs font-bold"
      >
        <WifiOff size={14} className="shrink-0" />
        <span className="flex-1 min-w-0">
          You're offline — keep working; your changes save on this device and sync when you reconnect.
          {queuedLabel ? ` (${queuedLabel})` : ""}
        </span>
      </div>
    );
  }

  // Online but with pending items (or freshly reconnected): offer a sync.
  if (count > 0) {
    return (
      <div
        data-testid="offline-banner-syncing"
        role="status"
        className="flex items-center gap-2.5 bg-sky-100 border-b border-sky-300 text-sky-900 px-4 md:px-8 py-2 text-xs font-bold"
      >
        <CloudOff size={14} className="shrink-0" />
        <span className="flex-1 min-w-0">Back online — {queuedLabel}.</span>
        <button
          type="button"
          data-testid="offline-banner-sync"
          onClick={flush}
          disabled={isFlushing}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-sky-700 disabled:opacity-60 transition-colors"
        >
          {isFlushing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {isFlushing ? "Syncing…" : "Sync now"}
        </button>
      </div>
    );
  }

  // Online, synced, but showing cached data from an offline boot.
  return (
    <div
      data-testid="offline-banner-cached"
      role="status"
      className="flex items-center gap-2.5 bg-slate-100 border-b border-slate-300 text-slate-700 px-4 md:px-8 py-2 text-xs font-bold"
    >
      <RefreshCw size={14} className="shrink-0" />
      <span>Showing your last saved data — refreshing…</span>
    </div>
  );
}
