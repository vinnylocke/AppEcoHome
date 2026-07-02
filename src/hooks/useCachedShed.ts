import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useHomeRealtime } from "./useHomeRealtime";

const CACHE_KEY = "rhozly_shed_cache";

/**
 * Remove every per-home shed cache entry. Called on sign-out (alongside
 * clearAllDashboardCaches) so another account on the same device — or a
 * member since removed from the home — never sees the previous inventory.
 */
export function clearAllShedCaches(): void {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(`${CACHE_KEY}_`)) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function useCachedShed(homeId: string) {
  const [plants, setPlants] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // isInitialLoading is ONLY true if we have zero cached data.
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [isError, setIsError] = useState(false);

  // Generation counter: each fetch takes a ticket; results from a superseded
  // fetch (home switch, overlapping mutate) are discarded instead of racing
  // whichever response lands last into state — home A's plants were
  // rendering under home B's header on slow connections.
  const fetchGen = useRef(0);

  const fetchShedData = useCallback(
    async (forceRefresh = false) => {
      if (!homeId) return;
      const gen = ++fetchGen.current;
      const isStale = () => gen !== fetchGen.current;
      setIsError(false);

      // 1. Instantly load from browser cache
      if (!forceRefresh) {
        const cachedData = localStorage.getItem(`${CACHE_KEY}_${homeId}`);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            setPlants(parsed.plants || []);
            setLocations(parsed.locations || []);
            setIsInitialLoading(false); // Dismiss main spinner instantly!
            setIsBackgroundSyncing(true); // Show silent background sync spinner
          } catch (e) {
            console.error("Failed to parse cache", e);
          }
        }
      } else {
        // If it's a forced refresh (like after adding a plant), show background sync
        setIsBackgroundSyncing(true);
      }

      // 2. Fetch fresh data from Supabase in the background
      try {
        const { data: shedData, error: shedError } = await supabase
          .from("plants")
          .select(`*, inventory_items(id)`)
          .eq("home_id", homeId)
          .order("created_at", { ascending: false });

        if (shedError) throw shedError;

        const { data: locData, error: locError } = await supabase
          .from("locations")
          .select(`id, name, areas ( * )`)
          .eq("home_id", homeId);

        if (locError) throw locError;

        if (isStale()) return;

        const enrichedPlants = (shedData || []).map((p) => ({
          ...p,
          instance_count: p.inventory_items?.length || 0,
        }));

        // 3. Update React State
        setPlants(enrichedPlants);
        setLocations(locData || []);

        // 4. Update Browser Cache with the fresh data. In its own
        // try/catch: a quota failure on this write must not flip the hook
        // into an error state after the fetch itself succeeded.
        try {
          localStorage.setItem(
            `${CACHE_KEY}_${homeId}`,
            JSON.stringify({ plants: enrichedPlants, locations: locData }),
          );
        } catch {
          /* quota or disabled — the fetch still succeeded */
        }
      } catch (err: any) {
        if (isStale()) return;
        console.error("Shed sync error:", err);
        setIsError(true);
      } finally {
        if (!isStale()) {
          setIsInitialLoading(false);
          setIsBackgroundSyncing(false);
        }
      }
    },
    [homeId],
  );

  useEffect(() => {
    // Home switch: drop the previous home's rows immediately rather than
    // showing them under the new home until its fetch resolves.
    setPlants([]);
    setLocations([]);
    setIsInitialLoading(true);
    fetchShedData();
  }, [fetchShedData]);

  const mutate = useCallback(() => fetchShedData(true), [fetchShedData]);

  useHomeRealtime("plants", mutate);
  useHomeRealtime("inventory_items", mutate);

  return { plants, setPlants, locations, isInitialLoading, isBackgroundSyncing, isError, mutate };

}
