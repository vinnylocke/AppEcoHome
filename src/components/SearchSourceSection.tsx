import React, { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../lib/supabase";
import {
  availablePlantSources, clampPlantSource, type PlantSource,
  availableAilmentSources, clampAilmentSource, type AilmentSource,
} from "../lib/searchPreference";

const PLANT_LABEL: Record<PlantSource, string> = {
  library: "Library (free, instant)",
  verdantly: "Verdantly",
  perenual: "Perenual",
  ai: "Rhozly AI",
};
const AILMENT_LABEL: Record<AilmentSource, string> = {
  library: "Library (free, instant)",
  perenual: "Perenual",
  ai: "Rhozly AI",
};

/**
 * Account-tab control to pick the default first source for plant searches and
 * Watchlist (pest/disease) searches. Only renders for users with a non-library
 * entitlement (Perenual/Verdantly via enable_perenual, or AI via ai_enabled).
 * Writes user_profiles.search_settings { plant_source, ailment_source }.
 */
export default function SearchSourceSection({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [ent, setEnt] = useState({ enablePerenual: false, aiEnabled: false });
  const [plantSource, setPlantSource] = useState<PlantSource>("library");
  const [ailmentSource, setAilmentSource] = useState<AilmentSource>("library");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("enable_perenual, ai_enabled, search_settings")
        .eq("uid", userId)
        .maybeSingle();
      if (cancelled) return;
      const e = { enablePerenual: !!data?.enable_perenual, aiEnabled: !!data?.ai_enabled };
      const ss = (data?.search_settings ?? {}) as { plant_source?: string; ailment_source?: string };
      setEnt(e);
      setSettings(ss);
      setPlantSource(clampPlantSource(ss.plant_source, e));
      setAilmentSource(clampAilmentSource(ss.ailment_source, e));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const plantOptions = availablePlantSources(ent);
  const ailmentOptions = availableAilmentSources(ent);

  // Library-only (Sprout) users have nothing to choose — hide the control.
  if (loading || (plantOptions.length <= 1 && ailmentOptions.length <= 1)) return null;

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    const merged = { ...settings, ...patch };
    const { error } = await supabase
      .from("user_profiles")
      .update({ search_settings: merged })
      .eq("uid", userId);
    setSaving(false);
    if (error) toast.error("Couldn't save search preference");
    else { setSettings(merged); toast.success("Default search source updated"); }
  };

  const selectClass =
    "flex-1 w-full text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary disabled:opacity-60";

  return (
    <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3" data-testid="search-source-section">
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1.5">
          <Search size={12} /> Default search source
        </h3>
        <p className="text-[11px] font-medium text-rhozly-on-surface/50 leading-snug mt-1">
          Which source searches run <span className="font-bold">first</span>. Library is free and instant;
          the others use your API / AI access (the rest stay one tap away as a fallback).
        </p>
      </div>

      {plantOptions.length > 1 && (
        <label className="block space-y-1">
          <span className="text-[11px] font-bold text-rhozly-on-surface/60">Plants</span>
          <select
            data-testid="search-source-plant-select"
            value={plantSource}
            onChange={(e) => { setPlantSource(e.target.value as PlantSource); save({ plant_source: e.target.value }); }}
            disabled={saving}
            className={selectClass}
          >
            {plantOptions.map((o) => <option key={o} value={o}>{PLANT_LABEL[o]}</option>)}
          </select>
        </label>
      )}

      {ailmentOptions.length > 1 && (
        <label className="block space-y-1">
          <span className="text-[11px] font-bold text-rhozly-on-surface/60">Watchlist (pests &amp; diseases)</span>
          <select
            data-testid="search-source-ailment-select"
            value={ailmentSource}
            onChange={(e) => { setAilmentSource(e.target.value as AilmentSource); save({ ailment_source: e.target.value }); }}
            disabled={saving}
            className={selectClass}
          >
            {ailmentOptions.map((o) => <option key={o} value={o}>{AILMENT_LABEL[o]}</option>)}
          </select>
        </label>
      )}

      {saving && (
        <div className="flex items-center gap-1.5 text-[11px] text-rhozly-on-surface/40">
          <Loader2 size={12} className="animate-spin" /> Saving…
        </div>
      )}
    </section>
  );
}
