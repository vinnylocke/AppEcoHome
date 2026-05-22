import React, { useMemo, useState } from "react";
import {
  Droplets,
  Mountain,
  Sun,
  Scissors,
  Sprout,
  Flower2,
  Wheat,
  Hourglass,
  ChevronDown,
  ChevronUp,
  CalendarPlus,
  CalendarDays,
} from "lucide-react";
import type {
  GrowGuideCategory,
  GrowGuideSection,
  GrowGuideSchedulableTask,
} from "../../services/plantDoctorService";
import AddToCalendarSheet from "./AddToCalendarSheet";
import { flattenSectionsForCalendar } from "../../lib/scheduleFromSchedulableTask";

const MONTH_ORDER = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
] as const;

/**
 * Format the union of `active_months` across this section's
 * schedulable tasks as a short human-readable "when" string. Examples:
 *   ["Mar","Apr","May"]                     → "Mar – May"
 *   ["Mar","May"]                            → "Mar, May"
 *   null in any task                         → "Year-round"
 *   empty union                              → null (caller hides line)
 */
function formatActiveWindow(
  tasks: GrowGuideSchedulableTask[] | undefined,
): string | null {
  if (!tasks || tasks.length === 0) return null;
  let anyYearRound = false;
  const months = new Set<string>();
  for (const t of tasks) {
    if (t.active_months == null) {
      anyYearRound = true;
      continue;
    }
    for (const m of t.active_months) months.add(m);
  }
  if (anyYearRound && months.size === 0) return "Year-round";
  if (months.size === 0) return null;

  const sorted = MONTH_ORDER.filter((m) => months.has(m));
  if (sorted.length === 0) return null;

  // Try to detect a contiguous run (handles Mar–May, Apr–Sep etc).
  const indices = sorted.map((m) => MONTH_ORDER.indexOf(m as (typeof MONTH_ORDER)[number]));
  let contiguous = true;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] - indices[i - 1] !== 1) {
      contiguous = false;
      break;
    }
  }
  if (contiguous && sorted.length > 1) {
    return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
  }
  if (sorted.length === 1) return sorted[0];
  return sorted.join(", ");
}

interface Props {
  section: GrowGuideSection;
  /** Auto-expand the first section in the list. Defaults to false. */
  defaultOpen?: boolean;
  /** Test-id namespace so multiple sections render cleanly in a list. */
  testIdPrefix?: string;
  /**
   * Required for the Add-to-calendar affordance. When absent, the button
   * is hidden (read-only contexts pass nothing).
   */
  homeId?: string;
  plantId?: number;
  plantName?: string;
}

const CATEGORY_ICON: Record<GrowGuideCategory, React.ReactNode> = {
  water:       <Droplets size={18} />,
  soil:        <Mountain size={18} />,
  sunlight:    <Sun size={18} />,
  propagation: <Scissors size={18} />,
  germination: <Sprout size={18} />,
  pruning:     <Scissors size={18} />,
  flowering:   <Flower2 size={18} />,
  harvesting:  <Wheat size={18} />,
  senescence:  <Hourglass size={18} />,
};

const CATEGORY_TINT: Record<GrowGuideCategory, string> = {
  water:       "text-sky-600 bg-sky-50",
  soil:        "text-amber-700 bg-amber-50",
  sunlight:    "text-amber-500 bg-amber-50",
  propagation: "text-emerald-600 bg-emerald-50",
  germination: "text-rhozly-primary bg-rhozly-primary/8",
  pruning:     "text-rose-600 bg-rose-50",
  flowering:   "text-pink-600 bg-pink-50",
  harvesting:  "text-orange-600 bg-orange-50",
  senescence:  "text-zinc-600 bg-zinc-100",
};

/**
 * Renders one section of a plant grow guide. Sections marked
 * `applicable: false` are NEVER rendered by the caller — this component
 * assumes the section is relevant. The collapse state is local.
 */
export default function GuideSectionCard({
  section,
  defaultOpen = false,
  testIdPrefix = "guide-section",
  homeId,
  plantId,
  plantName,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [sheetOpen, setSheetOpen] = useState(false);

  const testId = `${testIdPrefix}-${section.category}`;
  const tint = CATEGORY_TINT[section.category];
  const icon = CATEGORY_ICON[section.category];

  const hasFacts = section.key_facts.length > 0;
  const hasSteps = section.steps.length > 0;
  const hasTips = section.tips.length > 0;
  const hasNotes = !!section.notes?.trim();
  const schedulable = section.schedulable_tasks ?? [];
  const canAddToCalendar =
    !!homeId && !!plantId && !!plantName && schedulable.length > 0;
  const whenLine = formatActiveWindow(schedulable);
  // Fold this section's how-to steps into the first schedulable task's
  // description so the calendar entry carries the full instructions —
  // the gardener tapping the reminder days later sees what to do without
  // re-opening the grow guide.
  const enrichedTasks = useMemo(
    () => flattenSectionsForCalendar([section]),
    [section],
  );

  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-rhozly-primary/15 bg-white shadow-sm overflow-hidden"
    >
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[56px] text-left hover:bg-rhozly-surface-low/40 transition"
      >
        <span className="flex items-center gap-3">
          <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${tint}`}>
            {icon}
          </span>
          <span className="flex flex-col">
            <span className="font-black text-sm text-rhozly-on-surface tracking-tight">
              {section.title}
            </span>
            <span className="text-[11px] text-rhozly-on-surface/55 line-clamp-1">
              {section.summary}
            </span>
          </span>
        </span>
        {open ? (
          <ChevronUp size={16} className="text-rhozly-on-surface/40 shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-rhozly-on-surface/40 shrink-0" />
        )}
      </button>

      {open && (
        <div
          data-testid={`${testId}-body`}
          className="px-4 pb-4 space-y-3 text-sm text-rhozly-on-surface/80"
        >
          {whenLine && (
            <div
              data-testid={`${testId}-when`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rhozly-primary/10 border border-rhozly-primary/20 text-rhozly-primary text-[11px] font-black uppercase tracking-widest"
            >
              <CalendarDays size={11} />
              When: {whenLine}
            </div>
          )}

          <p className="text-rhozly-on-surface/85 leading-relaxed">{section.summary}</p>

          {hasFacts && (
            <div data-testid={`${testId}-facts`} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {section.key_facts.map((fact, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 px-3 py-2"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                    {fact.label}
                  </p>
                  <p className="text-sm font-bold text-rhozly-on-surface mt-0.5">
                    {fact.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {hasSteps && (
            <ol data-testid={`${testId}-steps`} className="space-y-2 list-none">
              {section.steps.map((s) => (
                <li
                  key={s.step}
                  className="flex gap-3 px-3 py-2 rounded-xl bg-rhozly-surface-low/40 border border-rhozly-outline/10"
                >
                  <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${tint}`}>
                    {s.step}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-rhozly-on-surface">{s.title}</p>
                    <p className="text-xs text-rhozly-on-surface/70 leading-snug mt-0.5">
                      {s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {hasTips && (
            <ul data-testid={`${testId}-tips`} className="list-disc pl-5 space-y-1 text-sm text-rhozly-on-surface/80 leading-relaxed">
              {section.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}

          {hasNotes && (
            <p
              data-testid={`${testId}-notes`}
              className="text-xs italic text-rhozly-on-surface/55 px-3 py-2 rounded-xl bg-rhozly-tertiary/20 border border-rhozly-tertiary/30"
            >
              {section.notes}
            </p>
          )}

          {canAddToCalendar && (
            <button
              type="button"
              data-testid={`${testId}-add-to-calendar`}
              onClick={() => setSheetOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-95 transition"
            >
              <CalendarPlus size={14} />
              Add {schedulable.length === 1 ? "task" : `${schedulable.length} tasks`} to calendar
            </button>
          )}
        </div>
      )}

      {canAddToCalendar && (
        <AddToCalendarSheet
          open={sheetOpen}
          homeId={homeId!}
          plantId={plantId!}
          plantName={plantName!}
          schedulableTasks={enrichedTasks}
          heading={`Add ${section.title.toLowerCase()} tasks`}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </section>
  );
}
