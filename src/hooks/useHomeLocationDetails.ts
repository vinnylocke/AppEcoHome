import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export interface SoilData {
  ph: number | null;
  clay_pct: number | null;
  sand_pct: number | null;
  silt_pct: number | null;
  organic_carbon_gkg: number | null;
}

export interface LocationDetails {
  soil: SoilData;
  gardening_overview: string;
  climate_summary: string;
  soil_interpretation: string;
  common_pests: Array<{ name: string; description: string; severity: string }>;
  common_diseases: Array<{ name: string; description: string }>;
  beneficial_wildlife: Array<{ name: string; benefit: string }>;
  common_wildlife: Array<{ name: string; notes: string }>;
  seasonal_gardening_calendar: { spring: string; summer: string; autumn: string; winter: string };
  top_tips: string[];
  climate_zone_key: string;
  soil_estimated: boolean;
  generated_at: string;
}

export function useHomeLocationDetails(homeId: string, hasLocation: boolean) {
  const [data, setData]       = useState<LocationDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  // Concurrency guard via a ref so we don't double-fetch while one is in
  // flight, but the `loading` state itself doesn't gate re-entry (the
  // earlier version did, which deadlocked the auto-load effect below
  // because the hook was initialised with loading=true).
  const inFlightRef = useRef(false);

  const load = useCallback(async (bust = false) => {
    if (!hasLocation) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (bust) setData(null);
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke(
        "home-location-details",
        { body: { homeId, bust } },
      );
      if (fnErr) throw fnErr;
      if (res?.error === "location_not_set") { setError("location_not_set"); return; }
      if (res?.error) throw new Error(res.error);
      setData(res.data as LocationDetails);
      setFetched(true);
    } catch (e: any) {
      setError(e.message ?? "Failed to load insights");
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [homeId, hasLocation]);

  const refresh = useCallback(() => load(true), [load]);

  // Auto-load on mount (and whenever the home gains its location) so the
  // server-side cache is hit immediately — no button press required. The
  // edge function returns the cached blob in milliseconds when it exists;
  // first-time generation still pays the AI cost once, then every later
  // visit is instant.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLocation) return;
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    load();
  }, [hasLocation, load]);

  return { data, loading, error, fetched, load, refresh };
}
