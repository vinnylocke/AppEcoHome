// The field-guide detail BODY — hero, action bar (🔭 Watch / ♥ Favourite /
// ✦ Ask AI), the "could affect your garden" strip, and the editorial
// sections. Extracted from AilmentLibrary (hub search-first overhaul Stage 2,
// 2026-07-21) so the SAME surface renders in two hosts:
//   1. AilmentLibrary's full-page `?ailment=` detail (unchanged behaviour), and
//   2. AilmentDetailModal — opened by tapping a result row in the ailment
//      search takeover (the plants-parity "click in and see more" contract).
// Purely presentational: hosts own the watch/favourite state + service calls.

import React from "react";
import {
  Bug, Biohazard, Sprout, AlertTriangle, Loader2, Leaf,
  Binoculars, Heart, Sparkles, Check, CalendarRange,
} from "lucide-react";
import type { LibraryAilment, AilmentKind } from "../../services/ailmentLibraryService";
import { AILMENT_KIND_CLASSES, AILMENT_SEVERITY_CLASSES, matchAffectedPlants } from "../../lib/ailmentPresentation";
import SmartImage from "../SmartImage";

const KIND_ICONS: Record<AilmentKind, typeof Bug> = {
  pest: Bug,
  disease: Biohazard,
  invasive: Sprout,
  disorder: AlertTriangle,
};

export interface AilmentDetailBodyProps {
  ailment: LibraryAilment;
  /** Home watchlist state for the 🔭 button. */
  watching: boolean;
  watchingBusy: boolean;
  canWatch: boolean;
  onWatch: () => void;
  /** Cross-home favourite state for the ♥ button (null = not favourited). */
  favRowId: string | null;
  favBusy: boolean;
  onToggleFavourite: () => void;
  /** ✦ Ask Rhozly AI (hidden when AI is off for the home). */
  aiEnabled: boolean;
  onAskAi: () => void;
  /** Persona-adaptive "could affect" voice + the home's active plant names. */
  isNewGardener: boolean;
  plantNames: string[];
}

export default function AilmentDetailBody({
  ailment,
  watching,
  watchingBusy,
  canWatch,
  onWatch,
  favRowId,
  favBusy,
  onToggleFavourite,
  aiEnabled,
  onAskAi,
  isNewGardener,
  plantNames,
}: AilmentDetailBodyProps) {
  const KindIcon = KIND_ICONS[ailment.kind];
  const kindMeta = AILMENT_KIND_CLASSES[ailment.kind];
  const affects = matchAffectedPlants(
    [...ailment.affected_plant_types, ...ailment.affected_families],
    plantNames,
  );
  const heroImage = ailment.image_url ?? ailment.thumbnail_url;

  return (
    <>
      {/* Hero */}
      <div className="flex items-start gap-4 mb-1">
        {heroImage ? (
          <SmartImage
            src={heroImage}
            alt={ailment.name}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-card object-cover border border-rhozly-outline/10 shrink-0"
          />
        ) : (
          <span className={`w-24 h-24 sm:w-28 sm:h-28 rounded-card flex items-center justify-center shrink-0 ${kindMeta.tile}`}>
            <KindIcon size={36} />
          </span>
        )}
        <div className="min-w-0 pt-1">
          <h1 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-rhozly-on-surface leading-tight">
            {ailment.name}
          </h1>
          {ailment.scientific_name && (
            <p className="text-sm italic text-rhozly-on-surface-variant">{ailment.scientific_name}</p>
          )}
          {ailment.aliases.length > 0 && (
            <p className="text-2xs text-rhozly-on-surface/50 mt-0.5">
              Also known as {ailment.aliases.slice(0, 3).join(", ")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-chip text-2xs font-bold ${kindMeta.chip}`}>
              <KindIcon size={11} /> {kindMeta.label}
            </span>
            {ailment.severity && (
              <span className={`px-2 py-0.5 rounded-chip text-2xs font-bold ${AILMENT_SEVERITY_CLASSES[ailment.severity].chip}`}>
                {AILMENT_SEVERITY_CLASSES[ailment.severity].label} severity
              </span>
            )}
            {ailment.season.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-chip text-2xs font-bold bg-rhozly-surface-low text-rhozly-on-surface-variant border border-rhozly-outline/10">
                <CalendarRange size={11} /> {ailment.season.join(" · ")}
              </span>
            )}
            {ailment.organic_friendly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-chip text-2xs font-bold bg-status-success-fill text-status-success-ink border border-status-success-line">
                <Leaf size={11} /> Organic remedies
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action bar — Watch / Favourite / Ask AI */}
      <div className="flex items-center gap-2 mt-4 mb-5">
        {canWatch && (
          <button
            onClick={onWatch}
            disabled={watching || watchingBusy}
            data-testid="ailment-add-watchlist"
            className={`flex-1 sm:flex-none sm:min-w-[220px] py-3 px-4 rounded-control font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] touch-manipulation ${
              watching
                ? "bg-status-success-fill text-status-success-ink border border-status-success-line"
                : "bg-rhozly-primary text-white disabled:opacity-60"
            }`}
          >
            {watchingBusy ? (
              <Loader2 size={17} className="animate-spin" />
            ) : watching ? (
              <Check size={17} />
            ) : (
              <Binoculars size={17} />
            )}
            {watching ? "Watching in this garden" : "Watch in this garden"}
          </button>
        )}
        {!canWatch && watching && (
          <span className="flex-1 sm:flex-none sm:min-w-[220px] py-3 px-4 rounded-control font-black text-sm flex items-center justify-center gap-2 bg-status-success-fill text-status-success-ink border border-status-success-line">
            <Check size={17} /> Watching in this garden
          </span>
        )}
        <button
          onClick={onToggleFavourite}
          disabled={favBusy}
          data-testid="ailment-detail-favourite"
          aria-pressed={!!favRowId}
          aria-label={favRowId ? `Remove ${ailment.name} from favourites` : `Save ${ailment.name} to favourites`}
          className={`w-12 h-12 shrink-0 rounded-control flex items-center justify-center border transition active:scale-[0.94] touch-manipulation ${
            favRowId
              ? "bg-status-watch-fill border-status-watch-line text-status-watch-ink"
              : "bg-rhozly-surface-lowest border-rhozly-outline/15 text-rhozly-on-surface-variant can-hover:hover:text-status-watch-ink"
          }`}
        >
          {favBusy ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Heart size={18} fill={favRowId ? "currentColor" : "none"} />
          )}
        </button>
        {aiEnabled && (
          <button
            onClick={onAskAi}
            data-testid="ailment-detail-ask-ai"
            aria-label={`Ask Rhozly AI about ${ailment.name}`}
            className="w-12 h-12 shrink-0 rounded-control flex items-center justify-center border border-status-ai-line bg-status-ai-fill text-status-ai-ink transition active:scale-[0.94] touch-manipulation"
          >
            <Sparkles size={18} />
          </button>
        )}
      </div>

      {/* Could affect your garden */}
      {affects.length > 0 && (
        <div
          data-testid="ailment-could-affect"
          className="mb-5 px-4 py-3 rounded-card bg-status-caution-fill border border-status-caution-line"
        >
          {isNewGardener ? (
            <p className="text-sm text-status-caution-ink">
              <span className="font-black">Worth a look:</span> you grow{" "}
              {affects.length === 1 ? "a plant" : `${affects.length} plants`} this{" "}
              {kindMeta.label.toLowerCase()} loves — <span className="font-bold">{affects.join(", ")}</span>.
              A quick check now beats a rescue later.
            </p>
          ) : (
            <p className="text-sm font-bold text-status-caution-ink flex items-center gap-1.5 flex-wrap">
              <Leaf size={13} /> In your garden: {affects.join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Editorial sections — un-boxed, divide-y */}
      <div className="divide-y divide-rhozly-outline/10">
        {ailment.description && (
          <DetailSection title="About">
            <p>{ailment.description}</p>
          </DetailSection>
        )}
        {ailment.symptoms.length > 0 && (
          <DetailSection title="Symptoms">
            <ul className="list-disc pl-5 space-y-1">
              {ailment.symptoms.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </DetailSection>
        )}
        {ailment.causes && (
          <DetailSection title="Causes"><p>{ailment.causes}</p></DetailSection>
        )}
        {ailment.treatment && (
          <DetailSection title="Treatment"><p>{ailment.treatment}</p></DetailSection>
        )}
        {ailment.prevention && (
          <DetailSection title="Prevention"><p>{ailment.prevention}</p></DetailSection>
        )}
        {ailment.affected_plant_types.length > 0 && (
          <DetailSection title="Affected plants">
            <p>{ailment.affected_plant_types.join(", ")}</p>
          </DetailSection>
        )}
        {ailment.affected_families.length > 0 && (
          <DetailSection title="Affected families">
            <p>{ailment.affected_families.join(", ")}</p>
          </DetailSection>
        )}
      </div>
    </>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 first:pt-0">
      <p className="text-3xs font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">{title}</p>
      <div className="text-sm text-rhozly-on-surface/80 leading-relaxed">{children}</div>
    </div>
  );
}
