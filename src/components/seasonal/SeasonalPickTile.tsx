import React, { useEffect, useState } from "react";
import {
  Sprout, Home as HomeIcon, Scissors, Combine, MoveRight,
  Sun, CloudSun, Cloud, Trees, Carrot, Flower2, ChevronRight,
  Loader2,
} from "lucide-react";
import type { SeasonalPick } from "../../services/seasonalPicksService";
import { getPlantWikiInfo } from "../../lib/wikipedia";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";
import { logEvent, EVENT } from "../../events/registry";

interface Props {
  pick: SeasonalPick;
  /** Test-id suffix so list rendering produces unique ids. */
  index: number;
  /** Open this pick in the shared `PlantDetailModal` overlay (Care / Grow
   *  Guide / Companions / Light). The parent card owns the modal state. */
  onOpen: (result: ProviderSearchResult) => void;
}

const SOW_ICON: Record<SeasonalPick["sow_method"], React.ReactNode> = {
  direct:     <Sprout size={12} />,
  indoor:     <HomeIcon size={12} />,
  cutting:    <Scissors size={12} />,
  division:   <Combine size={12} />,
  transplant: <MoveRight size={12} />,
};

const SOW_LABEL: Record<SeasonalPick["sow_method"], string> = {
  direct:     "Direct sow",
  indoor:     "Indoor start",
  cutting:    "Cutting",
  division:   "Division",
  transplant: "Transplant",
};

const SUN_ICON: Record<SeasonalPick["sun"][number], React.ReactNode> = {
  full_sun:   <Sun size={11} />,
  part_sun:   <CloudSun size={11} />,
  part_shade: <Cloud size={11} />,
  full_shade: <Trees size={11} />,
};

function shortMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * One tile in the Seasonal Picks card. Renders a Wikipedia thumbnail
 * lazily (we cache per common_name in sessionStorage via the wiki helper
 * so the second time the card mounts the image is instant).
 *
 * Tap → hands a synthesised `ProviderSearchResult` up to the parent card,
 * which opens it in the shared `PlantDetailModal` overlay (Care / Grow
 * Guide / Companions / Light). The catalogue ensure (clone-from-library or
 * Gemini) happens inside the modal's `useCataloguePlantFromResult` hook —
 * same path every other plant-search consumer takes.
 */
export default function SeasonalPickTile({ pick, index, onOpen }: Props) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [imgErrored, setImgErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const query = wikiQueryForPick(pick.common_name, pick.scientific_name);
    getPlantWikiInfo(query)
      .then((info) => {
        if (cancelled) return;
        setThumb(info?.thumbnail ?? null);
      })
      .catch(() => {
        if (!cancelled) setThumb(null);
      });
    return () => { cancelled = true; };
  }, [pick.common_name, pick.scientific_name]);

  const openPreview = () => {
    const synthResult: ProviderSearchResult = {
      id: `seasonal-${pick.scientific_name.toLowerCase().replace(/\s+/g, "-")}`,
      common_name: pick.common_name,
      scientific_name: [pick.scientific_name],
      thumbnail_url: thumb ?? null,
      _provider: "ai",
      // When the picks handler resolved this pick to an existing
      // plant_library row, hand the id forward. The catalogue-ensure
      // path will clone the library row into the home `plants` table
      // instead of calling Gemini — saving the care-guide generation cost.
      ...(pick.plant_library_id ? { plant_library_id: pick.plant_library_id } : {}),
    };
    logEvent(EVENT.SEASONAL_PICK_OPENED, {
      common_name: pick.common_name,
      sow_method: pick.sow_method,
      effort: pick.effort,
      edible: pick.edible,
    });
    onOpen(synthResult);
  };

  const window =
    pick.sow_window_start && pick.sow_window_end
      ? `${shortMonth(pick.sow_window_start)} – ${shortMonth(pick.sow_window_end)}`
      : null;

  const FallbackIcon = pick.edible ? Carrot : Flower2;

  return (
    <button
      type="button"
      data-testid={`seasonal-pick-${index}`}
      onClick={openPreview}
      className="group shrink-0 w-[260px] sm:w-[280px] text-left rounded-2xl border border-rhozly-outline/15 bg-white hover:border-rhozly-primary/40 hover:shadow-md active:scale-[0.99] transition-all p-3 flex flex-col gap-2.5"
    >
      {/* Hero — thumbnail or fallback icon */}
      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-rhozly-surface-low border border-rhozly-outline/10">
        {thumb && !imgErrored ? (
          <img
            src={thumb}
            alt={pick.common_name}
            loading="lazy"
            onError={() => setImgErrored(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-rhozly-primary/40">
            {thumb === null && !imgErrored ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <FallbackIcon size={28} />
            )}
          </div>
        )}
        {/* Sow method chip — top-left */}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 text-rhozly-primary text-[10px] font-black uppercase tracking-widest shadow-sm">
          {SOW_ICON[pick.sow_method]}
          {SOW_LABEL[pick.sow_method]}
        </span>
      </div>

      {/* Title block */}
      <div>
        <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
          {pick.common_name}
        </p>
        <p className="text-[10px] text-rhozly-on-surface/55 italic truncate">
          {pick.scientific_name}
        </p>
      </div>

      {/* Reasoning */}
      <p className="text-[11px] text-rhozly-on-surface/75 leading-snug line-clamp-3">
        {pick.reasoning}
      </p>

      {/* Footer chips */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {window && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rhozly-surface-low text-rhozly-on-surface/70 text-[10px] font-black uppercase tracking-widest">
            Sow {window}
          </span>
        )}
        {pick.harvest_window && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
            Harvest {shortMonth(pick.harvest_window.start)}
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest">
          {pick.effort}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-rhozly-on-surface/50">
          {pick.sun.slice(0, 2).map((s, i) => (
            <span key={i}>{SUN_ICON[s]}</span>
          ))}
        </span>
      </div>

      {/* Affordance — small chevron lower-right */}
      <span className="self-end inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-primary/70 group-hover:text-rhozly-primary -mt-1">
        Open
        <ChevronRight size={11} />
      </span>
    </button>
  );
}

/**
 * Build a Wikipedia query that disambiguates plant names from
 * non-plant homonyms ("Rocket" → "Eruca vesicaria" not SpaceX,
 * "Mint" → "Mentha" not Mint candy). Three-tier fallback:
 *
 *   1. Override common homonyms via the lookup below first — even when
 *      an AI scientific name is present, "Rocket" still tends to outrank
 *      it in Wikipedia's image-search heuristics.
 *   2. Use the AI-provided scientific name when there's no homonym risk.
 *   3. Last resort: append " plant" so Wikipedia's search ranking
 *      biases botanical hits over technology / company pages.
 */
const AMBIGUOUS_COMMON_NAMES: Record<string, string> = {
  // Salad greens that share a name with vehicles / candy / brand names.
  rocket: "Eruca vesicaria",
  arugula: "Eruca vesicaria",
  mint: "Mentha",
  // Herbs that match cosmetic brands or other industries.
  sage: "Salvia officinalis",
  thyme: "Thymus vulgaris",
  // Flowers / brand homonyms.
  lily: "Lilium",
  // Vegetables prone to disambiguation hijacks.
  cabbage: "Brassica oleracea capitata",
};

export function wikiQueryForPick(
  commonName: string,
  scientificName: string | null | undefined,
): string {
  const key = commonName.trim().toLowerCase();
  const known = AMBIGUOUS_COMMON_NAMES[key];
  if (known) return known;
  const sci = scientificName?.trim();
  if (sci) return sci;
  return `${commonName} plant`;
}
