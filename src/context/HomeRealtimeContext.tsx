import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

// Realtime subscriptions are a per-connected-client cost on the Supabase
// realtime server (memory + CPU scale with concurrent users × tables ×
// write rate). We subscribe ONLY to tables that change from user action
// and need sub-second cross-client freshness.
//
// Deliberately NOT here (scalability Wave D): `weather_snapshots` and
// `weather_alerts`. Those change on an hourly cron, never from user
// action — realtime push is overkill. The dashboard refetches weather
// on tab-focus instead (see App.tsx visibility handler).
const HOME_TABLES = [
  { table: "locations",         filter: (id: string) => `home_id=eq.${id}` },
  { table: "areas",             filter: (id: string) => `home_id=eq.${id}` },
  { table: "homes",             filter: (id: string) => `id=eq.${id}` },
  { table: "inventory_items",   filter: (id: string) => `home_id=eq.${id}` },
  { table: "tasks",             filter: (id: string) => `home_id=eq.${id}` },
  { table: "task_blueprints",   filter: (id: string) => `home_id=eq.${id}` },
  { table: "plants",            filter: (id: string) => `home_id=eq.${id}` },
  { table: "ailments",          filter: (id: string) => `home_id=eq.${id}` },
  { table: "plans",             filter: (id: string) => `home_id=eq.${id}` },
  { table: "shopping_lists",    filter: (id: string) => `home_id=eq.${id}` },
  { table: "shopping_list_items", filter: (id: string) => `home_id=eq.${id}` },
  // plant_instance_ailments: needed by AilmentWatchlist's affected-plant
  // counts. Trade-off: one more table on the shared channel means the
  // realtime server evaluates its RLS filter for every connected client,
  // but the table only changes on explicit user action (linking/unlinking
  // an ailment) so the extra write-rate cost is negligible.
  { table: "plant_instance_ailments", filter: (id: string) => `home_id=eq.${id}` },
] as const;

export type HomeRealtimeTable = (typeof HOME_TABLES)[number]["table"];

interface HomeRealtimeContextValue {
  subscribe: (table: HomeRealtimeTable, callback: () => void) => () => void;
}

const HomeRealtimeContext = createContext<HomeRealtimeContextValue | null>(null);

export function HomeRealtimeProvider({
  homeId,
  children,
}: {
  homeId: string;
  children: React.ReactNode;
}) {
  const registry = useRef<Map<HomeRealtimeTable, Set<() => void>>>(new Map());

  useEffect(() => {
    if (!homeId) return;

    let channel = supabase.channel(`home-realtime-${homeId}`);

    for (const { table, filter } of HOME_TABLES) {
      const t = table;
      channel = channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: t, filter: filter(homeId) },
        () => registry.current.get(t as HomeRealtimeTable)?.forEach((cb) => cb()),
      );
    }

    // Status-aware subscribe: without a callback, a failed join
    // (CHANNEL_ERROR / TIMED_OUT — token race at app start, realtime quota)
    // was invisible and every "self-refreshing" list stayed static for the
    // whole session. And events that occur during a websocket gap are NOT
    // replayed on rejoin — so on any recovery we fan out one refetch per
    // registered table to reconcile whatever was missed.
    let hadDisconnect = false;
    const notifyAll = () => {
      for (const cbs of registry.current.values()) {
        cbs.forEach((cb) => {
          try { cb(); } catch { /* consumer errors must not kill the loop */ }
        });
      }
    };
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (hadDisconnect) {
          hadDisconnect = false;
          notifyAll();
        }
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // supabase-js retries the join itself; we just remember the gap so
        // the eventual SUBSCRIBED triggers a reconciling refetch.
        hadDisconnect = true;
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [homeId]);

  const subscribe = useCallback(
    (table: HomeRealtimeTable, callback: () => void): (() => void) => {
      if (!registry.current.has(table)) {
        registry.current.set(table, new Set());
      }
      registry.current.get(table)!.add(callback);
      return () => {
        registry.current.get(table)?.delete(callback);
      };
    },
    [],
  );

  return (
    <HomeRealtimeContext.Provider value={{ subscribe }}>
      {children}
    </HomeRealtimeContext.Provider>
  );
}

export function useHomeRealtimeContext(): HomeRealtimeContextValue {
  const ctx = useContext(HomeRealtimeContext);
  if (!ctx) throw new Error("useHomeRealtimeContext must be used within HomeRealtimeProvider");
  return ctx;
}
