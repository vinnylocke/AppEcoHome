import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const CACHE_KEY = "rhozly_shed_cache";

export function useCachedShed(homeId: string) {
  const [plants, setPlants] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // isInitialLoading is ONLY true if we have zero cached data.
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  const fetchShedData = useCallback(
    async (forceRefresh = false) => {
      if (!homeId) return;

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

        const enrichedPlants = (shedData || []).map((p) => ({
          ...p,
          instance_count: p.inventory_items?.length || 0,
        }));

        // 3. Update React State
        setPlants(enrichedPlants);
        setLocations(locData || []);

        // 4. Update Browser Cache with the fresh data
        localStorage.setItem(
          `${CACHE_KEY}_${homeId}`,
          JSON.stringify({ plants: enrichedPlants, locations: locData }),
        );
      } catch (err: any) {
        console.error("Shed sync error:", err);
      } finally {
        setIsInitialLoading(false);
        setIsBackgroundSyncing(false);
      }
    },
    [homeId],
  );

  useEffect(() => {
    fetchShedData();
  }, [fetchShedData]);

  // Expose mutate to force a background sync when a user alters the database
  const mutate = () => fetchShedData(true);

  return { plants, locations, isInitialLoading, isBackgroundSyncing, mutate };
}
