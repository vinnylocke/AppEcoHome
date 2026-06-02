import React, { useState } from "react";
import {
  Sprout,
  Heart,
  Scissors,
  Wheat,
  Syringe,
  Bug,
  Sun,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { AnalyseResult } from "../../services/plantDoctorService";
import { TaskActionButtons } from "../TaskActionButtons";

interface Props {
  result: AnalyseResult;
  homeId: string;
  onTasksAdded?: () => void;
}

const HEALTH_PILL: Record<AnalyseResult["health"]["state"], { label: string; classes: string }> = {
  healthy:       { label: "Healthy",       classes: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  stressed:      { label: "Stressed",      classes: "bg-amber-100 text-amber-800 border-amber-200" },
  diseased:      { label: "Diseased",      classes: "bg-red-100 text-red-800 border-red-200" },
  pest_damaged:  { label: "Pest damage",   classes: "bg-red-100 text-red-800 border-red-200" },
};

const RIPENESS_PILL: Record<NonNullable<NonNullable<AnalyseResult["edibility"]>["ripeness"]>, { label: string; classes: string }> = {
  not_yet:    { label: "Not yet ripe",   classes: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  near_ripe:  { label: "Nearly ripe",    classes: "bg-amber-100 text-amber-800 border-amber-200" },
  ripe:       { label: "Ripe",           classes: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  overripe:   { label: "Overripe",       classes: "bg-orange-100 text-orange-800 border-orange-200" },
};

function Section({
  icon,
  title,
  testId,
  defaultOpen = false,
  accent = "default",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  testId: string;
  defaultOpen?: boolean;
  accent?: "default" | "danger";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const borderClasses =
    accent === "danger"
      ? "border-red-200 bg-red-50/40"
      : "border-rhozly-outline/15 bg-white";

  return (
    <div
      data-testid={testId}
      className={`rounded-2xl border ${borderClasses} overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] text-left hover:bg-rhozly-surface-low/40 transition"
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
      >
        <span className="flex items-center gap-3">
          <span className="text-rhozly-primary shrink-0">{icon}</span>
          <span className="font-black text-sm text-rhozly-on-surface tracking-tight">
            {title}
          </span>
        </span>
        {open ? (
          <ChevronUp size={16} className="text-rhozly-on-surface/40 shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-rhozly-on-surface/40 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-sm text-rhozly-on-surface/80 leading-relaxed space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">
        {label}
      </p>
      <div className="text-sm text-rhozly-on-surface/85">{value}</div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-rhozly-on-surface/85">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function OrderedList({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <ol className="list-decimal pl-5 space-y-1 text-sm text-rhozly-on-surface/85">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ol>
  );
}

export default function AnalyseResultCard({ result, homeId, onTasksAdded }: Props) {
  const { identification, health, pruning, propagation, edibility, disease, pest, suggested_tasks } = result;

  const healthPill = HEALTH_PILL[health.state];
  const sciName = identification.scientific_name?.[0];
  const plantnet = result.plantnet ?? null;
  const provenance = plantnet?.identification_source ?? null;
  const pnBest = plantnet?.best_match ?? null;
  const provenanceLabel = (() => {
    switch (provenance) {
      case "plantnet": return "Pl@ntNet";
      case "plantnet+ai_confirmed": return "Pl@ntNet + AI agreed";
      case "plantnet_vs_ai_disagreement": return "Pl@ntNet (AI disagreed)";
      case "ai_fallback": return "AI only";
      default: return null;
    }
  })();
  const provenanceClasses = provenance === "plantnet" || provenance === "plantnet+ai_confirmed"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : provenance === "plantnet_vs_ai_disagreement"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rhozly-surface-low text-rhozly-on-surface/60 border-rhozly-outline/20";

  return (
    <div data-testid="analyse-result-card" className="space-y-3">
      {/* Identification — always open */}
      <Section
        icon={<Sprout size={18} />}
        title="Identification"
        testId="analyse-section-identification"
        defaultOpen
      >
        <div className="space-y-0.5">
          <h3
            data-testid="analyse-identification-common-name"
            className="font-black text-xl sm:text-2xl text-rhozly-on-surface leading-tight"
          >
            {identification.common_name}
          </h3>
          {sciName && (
            <p
              data-testid="analyse-identification-scientific-name"
              className="italic font-semibold text-rhozly-on-surface/65 text-sm sm:text-base leading-tight"
            >
              {sciName}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="inline-block text-[10px] font-black uppercase tracking-widest bg-rhozly-surface-low text-rhozly-on-surface/70 px-2 py-0.5 rounded-md">
            {identification.confidence}% confident
          </span>
          {provenanceLabel && (
            <span
              data-testid="analyse-identification-source"
              title={
                provenance === "plantnet"
                  ? "Identified by Pl@ntNet — Gemini was skipped for this step because Pl@ntNet was highly confident."
                  : provenance === "plantnet+ai_confirmed"
                    ? "Pl@ntNet and Rhozly AI agreed on the species."
                    : provenance === "plantnet_vs_ai_disagreement"
                      ? `Pl@ntNet picked ${pnBest?.scientificName} but the AI suggested ${plantnet?.ai_suggested_name}. Verify in the photo.`
                      : "Pl@ntNet wasn't usable for this image (low confidence, rejected, or unavailable) — identified by Rhozly AI alone."
              }
              className={`inline-block text-[10px] font-black uppercase tracking-widest border px-2 py-0.5 rounded-md ${provenanceClasses}`}
            >
              {provenanceLabel}
              {pnBest && ` · ${Math.round(pnBest.score * 100)}%`}
            </span>
          )}
        </div>
        {provenance === "plantnet_vs_ai_disagreement" && plantnet?.ai_suggested_name && (
          <p
            data-testid="analyse-identification-disagreement"
            className="text-[11px] font-semibold text-amber-700/90 leading-snug mt-2 max-w-md"
          >
            Pl@ntNet matched as <span className="italic">{pnBest?.scientificName}</span>, but Rhozly AI suggested <span className="italic">{plantnet.ai_suggested_name}</span>. Compare both names against the photo to confirm.
          </p>
        )}
        {plantnet && plantnet.top_matches.length > 1 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70">
              Pl@ntNet candidates ({plantnet.top_matches.length})
            </summary>
            <ul className="mt-2 space-y-1 text-[11px] font-semibold text-rhozly-on-surface/65">
              {plantnet.top_matches.slice(0, 5).map((m, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {m.commonName ?? m.scientificName}
                    {m.commonName && (
                      <span className="italic text-rhozly-on-surface/45"> · {m.scientificName}</span>
                    )}
                  </span>
                  <span className="text-rhozly-on-surface/45 tabular-nums">
                    {Math.round(m.score * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      {/* Health — always open */}
      <Section
        icon={<Heart size={18} />}
        title="Health & Light"
        testId="analyse-section-health"
        defaultOpen
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="analyse-health-pill"
            className={`inline-block text-[10px] font-black uppercase tracking-widest border px-2.5 py-1 rounded-md ${healthPill.classes}`}
          >
            {healthPill.label}
          </span>
        </div>
        <p>{health.notes}</p>
        {(health.sunlight_appears_appropriate !== null || health.sunlight_notes) && (
          <div className="flex items-start gap-2 mt-2 p-3 rounded-xl bg-rhozly-surface-low/60">
            <Sun size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              {health.sunlight_appears_appropriate !== null && (
                <p className="text-sm font-bold text-rhozly-on-surface mb-0.5">
                  Sunlight looks {health.sunlight_appears_appropriate ? "appropriate" : "off"}
                </p>
              )}
              {health.sunlight_notes && (
                <p className="text-xs text-rhozly-on-surface/70">{health.sunlight_notes}</p>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Pruning */}
      <Section icon={<Scissors size={18} />} title="Pruning" testId="analyse-section-pruning">
        <Field label="Method" value={pruning.method} />
        <Field label="Where to cut" value={pruning.where_to_cut} />
        <Field label="How to cut" value={pruning.how_to_cut} />
        {pruning.tips.length > 0 && (
          <Field label="Tips" value={<BulletList items={pruning.tips} />} />
        )}
      </Section>

      {/* Propagation */}
      <Section icon={<Sprout size={18} />} title="Propagation & Cuttings" testId="analyse-section-propagation">
        <Field label="Method" value={propagation.method} />
        <Field label="When" value={propagation.when} />
        {propagation.steps.length > 0 && (
          <Field label="Steps" value={<OrderedList items={propagation.steps} />} />
        )}
      </Section>

      {/* Edibility — only when edible */}
      {edibility?.is_edible && (
        <Section icon={<Wheat size={18} />} title="Edibility & Ripeness" testId="analyse-section-edibility">
          {edibility.ripeness && (
            <span
              className={`inline-block text-[10px] font-black uppercase tracking-widest border px-2.5 py-1 rounded-md ${RIPENESS_PILL[edibility.ripeness].classes}`}
            >
              {RIPENESS_PILL[edibility.ripeness].label}
            </span>
          )}
          {edibility.estimated_days_until_ripe !== null &&
            edibility.estimated_days_until_ripe !== undefined && (
              <p>
                <span className="font-bold">~{edibility.estimated_days_until_ripe} days</span> until
                ready to harvest.
              </p>
            )}
          {edibility.notes && <p>{edibility.notes}</p>}
        </Section>
      )}

      {/* Disease — only when present */}
      {disease && (
        <Section
          icon={<Syringe size={18} />}
          title={`Disease: ${disease.name}`}
          testId="analyse-section-disease"
          defaultOpen
          accent="danger"
        >
          <Field label="How to treat" value={<BulletList items={disease.cure_methods} />} />
          <Field label="How to prevent" value={<BulletList items={disease.prevention_methods} />} />
        </Section>
      )}

      {/* Pest — only when present */}
      {pest && (
        <Section
          icon={<Bug size={18} />}
          title={`Pest: ${pest.name}`}
          testId="analyse-section-pest"
          defaultOpen
          accent="danger"
        >
          <Field label="How to remove" value={<BulletList items={pest.removal_methods} />} />
          <Field label="How to prevent" value={<BulletList items={pest.prevention_methods} />} />
        </Section>
      )}

      {/* Suggested tasks — reuses the chat's existing component verbatim */}
      {suggested_tasks?.length > 0 ? (
        <TaskActionButtons
          tasks={suggested_tasks}
          homeId={homeId}
          onSuccess={onTasksAdded}
        />
      ) : (
        <div
          data-testid="analyse-no-tasks"
          className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800"
        >
          Nothing to schedule — this plant looks happy.
        </div>
      )}
    </div>
  );
}
