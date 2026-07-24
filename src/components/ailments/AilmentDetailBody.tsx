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
  Binoculars, Sparkles, Check, CalendarRange, Link2,
} from "lucide-react";
import type { LibraryAilment, AilmentKind } from "../../services/ailmentLibraryService";
import { splitStepsText } from "../../services/ailmentLibraryService";
import { AILMENT_KIND_CLASSES, AILMENT_SEVERITY_CLASSES, matchAffectedPlants } from "../../lib/ailmentPresentation";
import SmartImage from "../SmartImage";

const KIND_ICONS: Record<AilmentKind, typeof Bug> = {
  pest: Bug,
  disease: Biohazard,
  invasive: Sprout,
  disorder: AlertTriangle,
};

/** Home-authored structured extras (Stage F unification) — the shell that
 *  replaced the watchlist-local modal feeds these; library hosts omit them. */
export interface AilmentStepLike {
  id: string;
  step_order: number;
  title: string;
  description: string;
  task_type: string;
  frequency_type: string;
  frequency_every_n_days?: number;
  duration_minutes?: number;
  product?: string;
}
export interface AilmentSymptomLike {
  id: string;
  title: string;
  description: string;
  severity: "mild" | "moderate" | "severe";
  location: string;
}

export interface AilmentDetailBodyProps {
  ailment: LibraryAilment;
  /** Home watchlist state for the 🔭 button. */
  watching: boolean;
  watchingBusy: boolean;
  canWatch: boolean;
  onWatch: () => void;
  /** Legacy fav props — the ♥ toggle DIED (owner rule: no hearts on
   *  ailments; "Add to watchlist" sets home row + 🔭 in one tap). Kept
   *  optional so older hosts compile; the body ignores them. */
  favRowId?: string | null;
  favBusy?: boolean;
  onToggleFavourite?: () => void;
  /** ✦ Ask Rhozly AI (hidden when AI is off for the home). */
  aiEnabled: boolean;
  onAskAi: () => void;
  /** Persona-adaptive "could affect" voice + the home's active plant names. */
  isNewGardener: boolean;
  plantNames: string[];
  /** Hub v3 Stage E — the second verb: "Link to a plant". Hosts that can
   *  resolve/create the home watchlist row supply this; it opens the live-
   *  instance picker (LinkAilmentToPlantModal). Hidden when absent. */
  onLinkToPlant?: () => void;
  /** Stage F — home-authored rows are RICHER than library strings: severity-
   *  chipped symptoms and scheduled prevention/remedy steps replace the plain
   *  Symptoms/Prevention/Treatment sections when supplied. */
  symptomsRich?: AilmentSymptomLike[];
  preventionSteps?: AilmentStepLike[];
  remedySteps?: AilmentStepLike[];
  /** Home affected-plants chips (replace the library's affected-types line). */
  affectedPlants?: string[];
  /** Rendered under the action bar — AilmentGardenSection lives here. */
  gardenSlot?: React.ReactNode;
  /** Rendered inside the hero image container (e.g. MultiImageGallery). */
  heroExtra?: React.ReactNode;
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
  onLinkToPlant,
  symptomsRich,
  preventionSteps,
  remedySteps,
  affectedPlants,
  gardenSlot,
  heroExtra,
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
        <div className="relative shrink-0">
          {heroImage ? (
            <SmartImage
              src={heroImage}
              alt={ailment.name}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-card object-cover border border-rhozly-outline/10"
            />
          ) : (
            <span className={`w-24 h-24 sm:w-28 sm:h-28 rounded-card flex items-center justify-center ${kindMeta.tile}`}>
              <KindIcon size={36} />
            </span>
          )}
          {heroExtra}
        </div>
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
            {watching ? "On your watchlist" : "Add to watchlist"}
          </button>
        )}
        {!canWatch && watching && (
          <span className="flex-1 sm:flex-none sm:min-w-[220px] py-3 px-4 rounded-control font-black text-sm flex items-center justify-center gap-2 bg-status-success-fill text-status-success-ink border border-status-success-line">
            <Check size={17} /> On your watchlist
          </span>
        )}
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

      {/* Second verb (Stage E) — spotted it on a plant? Link it. */}
      {onLinkToPlant && (
        <button
          onClick={onLinkToPlant}
          data-testid="ailment-detail-link-plant"
          className="w-full -mt-2 mb-5 py-3 px-4 rounded-control font-black text-sm flex items-center justify-center gap-2 bg-white border-2 border-rhozly-primary/25 text-rhozly-primary can-hover:hover:border-rhozly-primary/60 transition active:scale-[0.98] touch-manipulation"
        >
          <Link2 size={16} /> Link to a plant
        </button>
      )}

      {/* In your garden — the host's AilmentGardenSection (Stage F shell). */}
      {gardenSlot && <div className="mb-5">{gardenSlot}</div>}

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
        {symptomsRich && symptomsRich.length > 0 ? (
          <DetailSection title="Symptoms">
            <div className="space-y-2">
              {symptomsRich.map((s) => (
                <div key={s.id} className="bg-rhozly-surface-lowest rounded-2xl p-3 border border-rhozly-outline/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-sm text-rhozly-on-surface">{s.title}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${SEVERITY_CHIP[s.severity]}`}>{s.severity}</span>
                      <span className="text-[10px] font-bold text-rhozly-on-surface/40">{s.location}</span>
                    </div>
                  </div>
                  <p className="text-xs text-rhozly-on-surface/60 leading-relaxed">{s.description}</p>
                </div>
              ))}
            </div>
          </DetailSection>
        ) : ailment.symptoms.length > 0 && (
          <DetailSection title="Symptoms">
            <ul className="list-disc pl-5 space-y-1">
              {ailment.symptoms.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </DetailSection>
        )}
        {ailment.causes && (
          <DetailSection title="Causes"><p>{ailment.causes}</p></DetailSection>
        )}
        {remedySteps && remedySteps.length > 0 ? (
          <DetailSection title="Treatment"><StepList steps={remedySteps} /></DetailSection>
        ) : ailment.treatment && (
          <DetailSection title="Treatment">
            <ul className="list-disc pl-4 space-y-1">
              {splitStepsText(ailment.treatment).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </DetailSection>
        )}
        {preventionSteps && preventionSteps.length > 0 ? (
          <DetailSection title="Prevention"><StepList steps={preventionSteps} /></DetailSection>
        ) : ailment.prevention && (
          <DetailSection title="Prevention">
            <ul className="list-disc pl-4 space-y-1">
              {splitStepsText(ailment.prevention).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </DetailSection>
        )}
        {affectedPlants && affectedPlants.length > 0 ? (
          <DetailSection title="Affected plants">
            <div className="flex flex-wrap gap-1.5">
              {affectedPlants.map((p) => (
                <span key={p} className="px-2.5 py-1 rounded-full text-xs font-black bg-rhozly-surface-low text-rhozly-on-surface/70">{p}</span>
              ))}
            </div>
          </DetailSection>
        ) : ailment.affected_plant_types.length > 0 && (
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

// ── Stage F — home-authored scheduled steps (moved from the deleted
//    watchlist-local modal; label maps are render-only mirrors of the
//    AilmentWatchlist form enums, duplicated to avoid an import cycle). ──────
const SEVERITY_CHIP: Record<string, string> = {
  mild:     "bg-yellow-100 text-yellow-700",
  moderate: "bg-orange-100 text-orange-700",
  severe:   "bg-red-100 text-red-700",
};
const STEP_TASK_LABEL: Record<string, string> = {
  inspect: "Inspect", spray: "Spray", prune: "Prune", remove: "Remove",
  water: "Water", fertilize: "Fertilize", other: "Other",
};
const STEP_FREQ_LABEL: Record<string, string> = {
  once: "Once", daily: "Daily", every_n_days: "Every N days",
  weekly: "Weekly", monthly: "Monthly",
};

function StepList({ steps }: { steps: AilmentStepLike[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.id} className="bg-rhozly-surface-lowest rounded-2xl p-4 border border-rhozly-outline/10">
          <div className="flex items-start justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black flex items-center justify-center shrink-0">
                {step.step_order}
              </span>
              <span className="font-black text-sm text-rhozly-on-surface">{step.title}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className="text-[10px] font-black bg-rhozly-surface-low px-2 py-0.5 rounded-full text-rhozly-on-surface/60">
                {STEP_TASK_LABEL[step.task_type] ?? step.task_type}
              </span>
              <span className="text-[10px] font-black bg-rhozly-surface-low px-2 py-0.5 rounded-full text-rhozly-on-surface/60">
                {step.frequency_type === "every_n_days"
                  ? `Every ${step.frequency_every_n_days ?? "?"} days`
                  : STEP_FREQ_LABEL[step.frequency_type] ?? step.frequency_type}
              </span>
            </div>
          </div>
          <p className="text-xs text-rhozly-on-surface/60 leading-relaxed ml-8">{step.description}</p>
          {step.product && (
            <p className="text-[10px] font-black text-rhozly-primary mt-1 ml-8">Product: {step.product}</p>
          )}
          {step.duration_minutes && (
            <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-0.5 ml-8">~{step.duration_minutes} min</p>
          )}
        </div>
      ))}
    </div>
  );
}
