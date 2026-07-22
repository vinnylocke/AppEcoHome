// useGardenPresence — the client face of the plant_presence /
// ailment_presence views (Garden Hub v3 Stage A, 2026-07-22;
// docs/plans/garden-hub-v3-presence-curation.md §2b). One fetch per map per
// mount; RLS on the underlying tables gates rows (security_invoker views).
// NOT the Realtime member-presence hook — that's src/hooks/usePresence.ts.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { toPresenceMap } from "../lib/presenceBadge";

export interface GardenPresence {
  /** plants.id → derived presence (absent = no relationship yet). */
  plantPresence: Map<number, "active" | "inactive">;
  /** ailments.id → derived presence. */
  ailmentPresence: Map<string, "active" | "inactive">;
  loading: boolean;
  refresh: () => void;
}

export function useGardenPresence(homeId: string | null | undefined): GardenPresence {
  const [plantPresence, setPlantPresence] = useState<Map<number, "active" | "inactive">>(new Map());
  const [ailmentPresence, setAilmentPresence] = useState<Map<string, "active" | "inactive">>(new Map());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!homeId) {
      // No home → present nothing and don't strand loading=true (review catch).
      setPlantPresence(new Map());
      setAilmentPresence(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [plants, ailments] = await Promise.all([
          supabase.from("plant_presence").select("plant_id, presence").eq("home_id", homeId),
          supabase.from("ailment_presence").select("ailment_id, presence").eq("home_id", homeId),
        ]);
        if (cancelled) return;
        if (plants.error) throw plants.error;
        if (ailments.error) throw ailments.error;
        setPlantPresence(toPresenceMap<number>(plants.data ?? [], "plant_id"));
        setAilmentPresence(toPresenceMap<string>(ailments.data ?? [], "ailment_id"));
      } catch (err) {
        // Presence is an enhancement layer — rows just render unbadged.
        Logger.warn("useGardenPresence fetch failed", { err, homeId });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [homeId, tick]);

  return { plantPresence, ailmentPresence, loading, refresh: () => setTick((t) => t + 1) };
}
