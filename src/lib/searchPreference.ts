import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Default search source the user picks in Settings. "library" is the default
// for everyone; the others require entitlement (Perenual/Verdantly → enable_perenual,
// AI → ai_enabled). See docs/plans/search-source-preference.md.
export type PlantSource = "library" | "verdantly" | "perenual" | "ai";

export interface SearchEntitlements {
  enablePerenual: boolean; // Perenual AND Verdantly (Verdantly is now gated like Perenual)
  aiEnabled: boolean;
}

export interface SearchPreferenceState {
  /** The stored plant_source, clamped to what the user is entitled to. */
  plantSource: PlantSource;
  enablePerenual: boolean;
  aiEnabled: boolean;
  loading: boolean;
}

/** Clamp a stored source to the user's entitlement — a downgrade silently
 *  falls back to "library" so we never run/offer a source they can't use. */
export function clampPlantSource(
  source: string | null | undefined,
  ent: SearchEntitlements,
): PlantSource {
  switch (source) {
    case "verdantly":
    case "perenual":
      return ent.enablePerenual ? (source as PlantSource) : "library";
    case "ai":
      return ent.aiEnabled ? "ai" : "library";
    default:
      return "library";
  }
}

/** Which plant sources a user may pick, given their entitlements. */
export function availablePlantSources(ent: SearchEntitlements): PlantSource[] {
  const out: PlantSource[] = ["library"];
  if (ent.enablePerenual) out.push("verdantly", "perenual");
  if (ent.aiEnabled) out.push("ai");
  return out;
}

/**
 * Read the user's default plant search source + entitlements from
 * `user_profiles` (single fetch). The result is entitlement-clamped, so callers
 * can trust `plantSource` is always something the user can actually use.
 */
export function useSearchPreference(): SearchPreferenceState {
  const [state, setState] = useState<SearchPreferenceState>({
    plantSource: "library",
    enablePerenual: false,
    aiEnabled: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
        return;
      }
      const { data } = await supabase
        .from("user_profiles")
        .select("enable_perenual, ai_enabled, search_settings")
        .eq("uid", user.id)
        .maybeSingle();
      if (cancelled) return;
      const ent: SearchEntitlements = {
        enablePerenual: !!data?.enable_perenual,
        aiEnabled: !!data?.ai_enabled,
      };
      const stored = (data?.search_settings as { plant_source?: string } | null)?.plant_source;
      setState({
        plantSource: clampPlantSource(stored, ent),
        enablePerenual: ent.enablePerenual,
        aiEnabled: ent.aiEnabled,
        loading: false,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
