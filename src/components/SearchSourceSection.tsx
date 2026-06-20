import React, { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { availablePlantSources, clampPlantSource, type PlantSource } from "../lib/searchPreference";

const LABEL: Record<PlantSource, string> = {
  library: "Library (free, instant)",
  verdantly: "Verdantly",
  perenual: "Perenual",
  ai: "Rhozly AI",
};

/**
 * Account-tab control to pick the default first source for plant searches.
 * Only renders for users with a non-library entitlement (Perenual/Verdantly via
 * enable_perenual, or AI via ai_enabled). Writes user_profiles.search_settings.
 */
export default function SearchSourceSection({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [ent, setEnt] = useState({ enablePerenual: false, aiEnabled: false });
  const [source, setSource] = useState<PlantSource>("library");
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
      const ss = (data?.search_settings ?? {}) as Record<string, unknown>;
      setEnt(e);
      setSettings(ss);
      setSource(clampPlantSource((ss as { plant_source?: string }).plant_source, e));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const options = availablePlantSources(ent);

  // Library-only (Sprout) users have nothing to choose — hide the control.
  if (loading || options.length <= 1) return null;

  const save = async (next: PlantSource) => {
    setSource(next);
    setSaving(true);
    const merged = { ...settings, plant_source: next };
    const { error } = await supabase
      .from("user_profiles")
      .update({ search_settings: merged })
      .eq("uid", userId);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save search preference");
    } else {
      setSettings(merged);
      toast.success("Default search source updated");
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-2" data-testid="search-source-section">
      <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1.5">
        <Search size={12} /> Default search source
      </h3>
      <p className="text-[11px] font-medium text-rhozly-on-surface/50 leading-snug">
        Which source plant searches run <span className="font-bold">first</span>. Library is free and
        instant; the others use your API / AI access (the rest stay one tap away as a fallback).
      </p>
      <div className="flex items-center gap-2">
        <select
          data-testid="search-source-select"
          value={source}
          onChange={(e) => save(e.target.value as PlantSource)}
          disabled={saving}
          className="flex-1 text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={o} value={o}>{LABEL[o]}</option>
          ))}
        </select>
        {saving && <Loader2 size={14} className="animate-spin text-rhozly-on-surface/40" />}
      </div>
    </section>
  );
}
