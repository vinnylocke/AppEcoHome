import { useEffect, useRef } from "react";
import {
  HomeRealtimeTable,
  useHomeRealtimeContext,
} from "../context/HomeRealtimeContext";

/**
 * Subscribe to external Supabase Realtime changes for a home-scoped table.
 * The callback is debounced so rapid bursts (e.g. bulk operations) trigger
 * only one re-fetch once activity settles.
 *
 * Must be called inside a HomeRealtimeProvider.
 */
export function useHomeRealtime(
  table: HomeRealtimeTable,
  callback: () => void,
  debounceMs = 500,
) {
  const { subscribe } = useHomeRealtimeContext();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const debounced = () => {
      clearTimeout(timerId);
      timerId = setTimeout(() => callbackRef.current(), debounceMs);
    };
    const unsubscribe = subscribe(table, debounced);
    return () => {
      unsubscribe();
      clearTimeout(timerId);
    };
  }, [table, subscribe, debounceMs]);
}
