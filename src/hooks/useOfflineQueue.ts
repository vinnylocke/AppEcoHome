import { useEffect, useState } from "react";
import { getQueue, subscribe, flushQueue } from "../lib/offlineQueue";

/**
 * Reactive view of the offline write queue. Re-renders whenever items
 * are enqueued / flushed. Exposes a manual `flush()` for explicit retry.
 */
export function useOfflineQueue() {
  const [items, setItems] = useState(() => getQueue());
  const [isFlushing, setIsFlushing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribe(() => setItems(getQueue()));
    return unsubscribe;
  }, []);

  const flush = async () => {
    setIsFlushing(true);
    try { await flushQueue(); } finally { setIsFlushing(false); }
  };

  return { items, count: items.length, flush, isFlushing };
}
