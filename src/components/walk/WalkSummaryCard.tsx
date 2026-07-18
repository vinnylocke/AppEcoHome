import React from "react";
import {
  Sparkles,
  Camera,
  ClipboardPen,
  NotebookPen,
  CheckSquare2,
  TriangleAlert,
  ArrowRight,
  Footprints,
  MapPin,
} from "lucide-react";
import { usePersona } from "../../hooks/usePersona";
import type { WalkSessionSummary } from "../../services/walkService";

interface Props {
  durationMs: number;
  summary: WalkSessionSummary;
  /**
   * RHO-17 — labels of sections the user skipped during this walk.
   * They reappear on "Walk what's left" (skipped ≠ done).
   */
  skippedSections?: string[];
  onDone: () => void;
  /**
   * Optional — when supplied, the summary card renders a "Walk what's
   * left" button that re-runs the walk. The walk-route rebuild already
   * filters out plants and sections the user actioned today, so this
   * naturally surfaces just the remainder — skipped sections first-class
   * among them (or lands on the friendly empty state if there's nothing
   * left to walk).
   */
  onWalkAgain?: () => void;
  /**
   * Optional — "Start a full walk": rebuilds the route IGNORING today's
   * progress (fresh-walk mode), for gardeners who do more than one round
   * a day. Distinct from onWalkAgain, which walks only what's left.
   */
  onFullWalk?: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * End-of-walk celebration. Shows the rolled-up metrics from the walk
 * session in a single, restrained card — no fireworks. The user
 * presses Done to return to Quick Access.
 */
export default function WalkSummaryCard({
  durationMs,
  summary,
  skippedSections = [],
  onDone,
  onWalkAgain,
  onFullWalk,
}: Props) {
  // §11 persona pass (RHO-17 Phase 3) — the "new" persona (null ⇒ new)
  // gets encouraging framing plus a "what tomorrow holds" line;
  // "experienced" gets stats-first terseness. Copy only — the stats list
  // itself is identical for both.
  const persona = usePersona();
  const isNewGardener = persona !== "experienced";

  const stats: { icon: React.ReactNode; label: string; value: number; tone: string }[] = [
    { icon: <MapPin size={16} />,         label: "Sections visited", value: summary.sectionsVisited, tone: "text-sky-700" },
    { icon: <ClipboardPen size={16} />,   label: "Readings logged",  value: summary.readingsLogged,  tone: "text-blue-700" },
    { icon: <Camera size={16} />,         label: "Photos taken",     value: summary.photosTaken,     tone: "text-rhozly-primary" },
    { icon: <NotebookPen size={16} />,    label: "Notes added",      value: summary.notesAdded,      tone: "text-violet-700" },
    { icon: <CheckSquare2 size={16} />,   label: "Tasks completed",  value: summary.tasksCompleted,  tone: "text-emerald-700" },
    { icon: <TriangleAlert size={16} />,  label: "Ailments flagged", value: summary.ailmentsFlagged, tone: "text-rose-700" },
  ];

  return (
    <div
      data-testid="walk-summary"
      style={{
        paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
      }}
      className="h-full w-full max-w-md mx-auto px-5 flex flex-col"
    >
      <div className="rounded-3xl bg-white border border-rhozly-outline/15 p-6 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.10)] flex-1 flex flex-col">
        <div className="inline-flex items-center gap-1.5 self-start bg-rhozly-primary/10 text-rhozly-primary px-2.5 py-1 rounded-full mb-3 border border-rhozly-primary/15">
          <Sparkles size={11} strokeWidth={2.5} />
          <span className="text-[10px] font-black uppercase tracking-widest">
            Walk complete
          </span>
        </div>

        <h1 className="font-display font-black text-rhozly-on-surface text-2xl leading-tight">
          You walked {summary.plantsVisited}{" "}
          {summary.plantsVisited === 1 ? "plant" : "plants"} in{" "}
          <span className="text-rhozly-primary">{formatDuration(durationMs)}</span>
        </h1>
        <p data-testid="walk-summary-subtitle" className="text-sm text-rhozly-on-surface/65 mt-1.5">
          {isNewGardener
            ? "Nice walk — every lap teaches you a little more about this garden. Tomorrow's walk picks up whatever today left behind, skipped bits included."
            : "Session logged."}
        </p>

        <ul data-testid="walk-summary-stats" className="mt-5 space-y-2">
          {stats.map((s) => (
            <li
              key={s.label}
              className="flex items-center gap-3 rounded-2xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 p-3"
            >
              <span
                className={`shrink-0 w-9 h-9 rounded-xl bg-white border border-rhozly-outline/15 flex items-center justify-center ${s.tone}`}
              >
                {s.icon}
              </span>
              <span className="flex-1 text-sm font-bold text-rhozly-on-surface/75">
                {s.label}
              </span>
              <span className={`text-lg font-black ${s.tone}`}>{s.value}</span>
            </li>
          ))}
        </ul>

        {skippedSections.length > 0 && (
          <div
            data-testid="walk-summary-skipped"
            className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 mb-1">
              Skipped earlier
            </p>
            <p className="text-sm font-bold text-amber-900/85 leading-snug">
              {skippedSections.join(" · ")}
            </p>
            <p className="text-[11px] font-bold text-amber-900/60 mt-1">
              "Walk what's left" brings these back.
            </p>
          </div>
        )}

        <div className="mt-auto pt-5 space-y-2">
          {onWalkAgain && (
            <button
              type="button"
              data-testid="walk-summary-again"
              onClick={onWalkAgain}
              className="w-full min-h-[48px] rounded-2xl bg-white border border-rhozly-primary/25 text-rhozly-primary text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rhozly-primary/5 transition"
            >
              <Footprints size={16} />
              Walk what's left
            </button>
          )}
          {onFullWalk && (
            <button
              type="button"
              data-testid="walk-summary-full-walk"
              onClick={onFullWalk}
              className="w-full min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/70 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rhozly-surface-low transition"
            >
              <Footprints size={16} />
              Start a full walk
            </button>
          )}
          <button
            type="button"
            data-testid="walk-summary-done"
            onClick={onDone}
            className="w-full min-h-[52px] rounded-2xl bg-rhozly-primary text-white text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-95"
          >
            Done
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
