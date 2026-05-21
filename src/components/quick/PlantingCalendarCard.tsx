import React, { useEffect, useState } from "react";
import { Sprout, Snowflake, Sun, Ruler, Calendar, Loader2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../../lib/errorHandler";
import { supabase } from "../../lib/supabase";
import {
  PlantDoctorService,
  type FrostDates,
  type PlantingGuidance,
} from "../../services/plantDoctorService";

const FROST_TTL_MS = 180 * 864e5; // 180 days

/**
 * Try a direct read of `home_climate` first — RLS lets home members SELECT
 * the row without the edge function. On a fresh cache hit this avoids the
 * 300-800ms edge-fn cold-start penalty. Falls back to the edge fn when the
 * row is missing or stale (so the cache-miss path still hits Gemini through
 * the existing infrastructure).
 */
async function loadFrostDates(homeId: string): Promise<FrostDates> {
  const { data: row } = await supabase
    .from("home_climate")
    .select(
      "last_frost_iso, first_frost_iso, growing_season_days, notes, rain_skip_mm, rain_water_mm, last_frost_lookup_at",
    )
    .eq("home_id", homeId)
    .maybeSingle();

  const isFresh =
    !!row?.last_frost_iso &&
    !!row?.first_frost_iso &&
    !!row?.last_frost_lookup_at &&
    Date.now() - new Date(row.last_frost_lookup_at as string).getTime() < FROST_TTL_MS;

  if (isFresh && row) {
    return {
      last_frost_iso: row.last_frost_iso as string,
      first_frost_iso: row.first_frost_iso as string,
      growing_season_days: Number(row.growing_season_days ?? 0),
      notes: (row.notes as string | null) ?? null,
      rain_skip_mm: Number(row.rain_skip_mm ?? 5),
      rain_water_mm: Number(row.rain_water_mm ?? 1),
      from_cache: true,
    };
  }

  // Missing or stale — fall through to the edge fn, which will refresh
  // via Gemini and write the row back.
  return PlantDoctorService.lookupFrostDates(homeId);
}

interface Props {
  homeId: string;
  /** Controls whether the per-plant AI query is offered. False on non-AI tiers. */
  aiEnabled: boolean;
}

/**
 * Top-of-screen card on /quick/calendar. Loads the home's frost dates
 * silently on mount (free on cache hit, one AI call per home per 6 months
 * on cache miss). Below the dates, a small text input + Submit lets the
 * user ask "when should I plant X?" — answer renders inline.
 *
 * AI-gated: the per-plant lookup requires Sage+. The frost-date lookup is
 * open to all tiers (cached result is treated as a fact).
 */
export default function PlantingCalendarCard({ homeId, aiEnabled }: Props) {
  const [frost, setFrost] = useState<FrostDates | null>(null);
  const [frostLoading, setFrostLoading] = useState(true);
  const [frostError, setFrostError] = useState<string | null>(null);

  const [plantInput, setPlantInput] = useState("");
  const [guidance, setGuidance] = useState<PlantingGuidance | null>(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;
    setFrostLoading(true);
    setFrostError(null);
    loadFrostDates(homeId)
      .then((data) => {
        if (cancelled) return;
        setFrost(data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        Logger.error("Frost date lookup failed", err, { homeId });
        setFrostError(err?.message ?? "Couldn't fetch frost dates.");
      })
      .finally(() => {
        if (cancelled) return;
        setFrostLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [homeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plantInput.trim()) return;
    if (!aiEnabled) {
      toast.error("Upgrade to AI tier to use the planting helper.");
      return;
    }
    setGuidanceLoading(true);
    setGuidance(null);
    try {
      const result = await PlantDoctorService.plantWhenToPlant(plantInput.trim(), homeId);
      setGuidance(result);
    } catch (err: any) {
      Logger.error("plant_when_to_plant failed", err, { plant: plantInput, homeId });
      toast.error(err?.message ?? "Couldn't fetch planting guidance.");
    } finally {
      setGuidanceLoading(false);
    }
  };

  const formatIsoDate = (iso: string): string => {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  return (
    <section
      data-testid="planting-calendar-card"
      className="rounded-3xl bg-white border border-rhozly-outline/15 shadow-sm p-5 sm:p-6"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="shrink-0 w-10 h-10 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
          <Sprout size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-base sm:text-lg text-rhozly-on-surface tracking-tight">
            Plant something
          </h2>
          <p className="text-xs sm:text-sm text-rhozly-on-surface/55 mt-0.5 leading-snug">
            When can I plant this where I live?
          </p>
        </div>
      </div>

      {/* Frost dates row */}
      <div
        data-testid="planting-calendar-frost-row"
        className="grid grid-cols-2 gap-2 mb-4"
      >
        {frostLoading ? (
          <div className="col-span-2 flex items-center gap-2 text-xs text-rhozly-on-surface/50 px-3 py-3 rounded-2xl bg-rhozly-surface-low">
            <Loader2 className="animate-spin" size={14} />
            Looking up your frost dates…
          </div>
        ) : frostError ? (
          <div
            data-testid="planting-calendar-frost-error"
            className="col-span-2 flex items-center gap-2 text-xs text-amber-800 px-3 py-3 rounded-2xl bg-amber-50 border border-amber-200"
          >
            <AlertCircle size={14} />
            Frost dates unavailable — guidance below uses general seasonal rules.
          </div>
        ) : frost ? (
          <>
            <div className="bg-sky-50 border border-sky-100 rounded-2xl px-3 py-2.5">
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-sky-700 mb-1">
                <Snowflake size={12} />
                Last frost
              </div>
              <p
                data-testid="planting-calendar-last-frost"
                className="text-sm font-black text-rhozly-on-surface"
              >
                {formatIsoDate(frost.last_frost_iso)}
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2.5">
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">
                <Snowflake size={12} />
                First frost
              </div>
              <p
                data-testid="planting-calendar-first-frost"
                className="text-sm font-black text-rhozly-on-surface"
              >
                {formatIsoDate(frost.first_frost_iso)}
              </p>
            </div>
            {frost.notes && (
              <p className="col-span-2 text-[11px] text-rhozly-on-surface/55 italic px-1">
                {frost.notes}
              </p>
            )}
          </>
        ) : null}
      </div>

      {/* Plant lookup form */}
      <form
        data-testid="planting-calendar-form"
        onSubmit={handleSubmit}
        className="flex items-stretch gap-2 mb-4"
      >
        <input
          data-testid="planting-calendar-input"
          type="text"
          value={plantInput}
          onChange={(e) => setPlantInput(e.target.value)}
          placeholder="e.g. tomato, garlic, sunflower…"
          className="flex-1 min-w-0 px-4 py-2.5 min-h-[44px] rounded-2xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30 focus:outline-none focus:border-rhozly-primary"
          aria-label="Plant name"
          disabled={guidanceLoading}
        />
        <button
          data-testid="planting-calendar-submit"
          type="submit"
          disabled={!plantInput.trim() || guidanceLoading}
          className="px-5 min-h-[44px] rounded-2xl text-sm font-black bg-rhozly-primary text-white shadow-sm hover:opacity-90 disabled:opacity-40 transition"
        >
          {guidanceLoading ? <Loader2 className="animate-spin" size={16} /> : "Go"}
        </button>
      </form>

      {!aiEnabled && (
        <p className="text-[11px] text-rhozly-on-surface/50 italic mb-3">
          Per-plant guidance requires an AI tier — frost dates above are available on every plan.
        </p>
      )}

      {/* Guidance result */}
      {guidance && (
        <div
          data-testid="planting-calendar-result"
          className="space-y-3 mt-3 p-4 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10"
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="font-black text-rhozly-on-surface">
              {guidance.plant_name}
            </h3>
            {guidance.scientific_name && (
              <span className="italic text-xs text-rhozly-on-surface/55">
                {guidance.scientific_name}
              </span>
            )}
          </div>

          <div
            data-testid="planting-calendar-verdict"
            className={`inline-block text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${
              guidance.can_plant_outdoors_now
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : "bg-amber-100 text-amber-800 border-amber-200"
            }`}
          >
            {guidance.can_plant_outdoors_now
              ? "Safe to plant outdoors now"
              : "Hold off — too early/late"}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Field icon={<Calendar size={12} />} label="Earliest outdoor">
              {formatIsoDate(guidance.earliest_outdoor_date)}
            </Field>
            <Field icon={<Calendar size={12} />} label="Latest outdoor">
              {formatIsoDate(guidance.latest_outdoor_date)}
            </Field>
            {guidance.indoor_start_recommended && guidance.indoor_start_date && (
              <Field icon={<Sprout size={12} />} label="Start indoors">
                {formatIsoDate(guidance.indoor_start_date)}
              </Field>
            )}
            {guidance.spacing_cm != null && (
              <Field icon={<Ruler size={12} />} label="Spacing">
                {guidance.spacing_cm} cm
              </Field>
            )}
            {guidance.depth_cm != null && (
              <Field icon={<Ruler size={12} />} label="Depth">
                {guidance.depth_cm} cm
              </Field>
            )}
            <Field icon={<Sun size={12} />} label="Sun">
              {guidance.sun_requirement}
            </Field>
          </div>

          {guidance.tips.length > 0 && (
            <ul className="text-xs text-rhozly-on-surface/80 list-disc pl-5 space-y-1 leading-snug">
              {guidance.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2 rounded-xl bg-white border border-rhozly-outline/10">
      <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-0.5">
        {icon}
        {label}
      </div>
      <p className="text-xs font-bold text-rhozly-on-surface">{children}</p>
    </div>
  );
}
