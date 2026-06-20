import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Default search source the user picks in Settings. "library" is the default
// for everyone; the others require entitlement (Perenual/Verdantly → enable_perenual,
// AI → ai_enabled). See docs/plans/search-source-preference.md.
export type PlantSource = "library" | "verdantly" | "perenual" | "ai";
// Watchlist/ailment search has no Verdantly tier.
export type AilmentSource = "library" | "perenual" | "ai";

export interface SearchEntitlements {
  enablePerenual: boolean; // Perenual AND Verdantly (Verdantly is now gated like Perenual)
  aiEnabled: boolean;
}

export interface SearchPreferenceState {
  /** The stored plant_source, clamped to what the user is entitled to. */
  plantSource: PlantSource;
  /** The stored ailment_source (Watchlist), clamped. No Verdantly for ailments. */
  ailmentSource: AilmentSource;
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

/** Clamp a stored ailment source to the user's entitlement (no Verdantly). */
export function clampAilmentSource(
  source: string | null | undefined,
  ent: SearchEntitlements,
): AilmentSource {
  switch (source) {
    case "perenual": return ent.enablePerenual ? "perenual" : "library";
    case "ai":       return ent.aiEnabled ? "ai" : "library";
    default:         return "library";
  }
}

/** Which ailment sources a user may pick, given their entitlements. */
export function availableAilmentSources(ent: SearchEntitlements): AilmentSource[] {
  const out: AilmentSource[] = ["library"];
  if (ent.enablePerenual) out.push("perenual");
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
    ailmentSource: "library",
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
      const ss = (data?.search_settings ?? {}) as { plant_source?: string; ailment_source?: string };
      setState({
        plantSource: clampPlantSource(ss.plant_source, ent),
        ailmentSource: clampAilmentSource(ss.ailment_source, ent),
        enablePerenual: ent.enablePerenual,
        aiEnabled: ent.aiEnabled,
        loading: false,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
