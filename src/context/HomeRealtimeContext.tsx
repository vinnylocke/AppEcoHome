import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

const HOME_TABLES = [
  { table: "locations",         filter: (id: string) => `home_id=eq.${id}` },
  { table: "areas",             filter: (id: string) => `home_id=eq.${id}` },
  { table: "homes",             filter: (id: string) => `id=eq.${id}` },
  { table: "inventory_items",   filter: (id: string) => `home_id=eq.${id}` },
  { table: "weather_alerts",    filter: (id: string) => `home_id=eq.${id}` },
  { table: "tasks",             filter: (id: string) => `home_id=eq.${id}` },
  { table: "task_blueprints",   filter: (id: string) => `home_id=eq.${id}` },
  { table: "weather_snapshots", filter: (id: string) => `home_id=eq.${id}` },
  { table: "plants",            filter: (id: string) => `home_id=eq.${id}` },
  { table: "ailments",          filter: (id: string) => `home_id=eq.${id}` },
  { table: "plans",             filter: (id: string) => `home_id=eq.${id}` },
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

    channel.subscribe();

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
