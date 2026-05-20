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

  return (
    <div data-testid="analyse-result-card" className="space-y-3">
      {/* Identification — always open */}
      <Section
        icon={<Sprout size={18} />}
        title="Identification"
        testId="analyse-section-identification"
        defaultOpen
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-black text-lg text-rhozly-on-surface">
            {identification.common_name}
          </h3>
          {sciName && (
            <span className="italic text-rhozly-on-surface/55 text-sm">{sciName}</span>
          )}
        </div>
        <span className="inline-block text-[10px] font-black uppercase tracking-widest bg-rhozly-surface-low text-rhozly-on-surface/70 px-2 py-0.5 rounded-md">
          {identification.confidence}% confident
        </span>
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
