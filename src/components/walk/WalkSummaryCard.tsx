import React from "react";
import {
  Sparkles,
  Camera,
  NotebookPen,
  CheckSquare2,
  TriangleAlert,
  ArrowRight,
  Footprints,
} from "lucide-react";
import type { WalkSessionSummary } from "../../services/walkService";

interface Props {
  durationMs: number;
  summary: WalkSessionSummary;
  onDone: () => void;
  /**
   * Optional — when supplied, the summary card renders a "Walk what's
   * left" button that re-runs the walk. The walk-list query already
   * filters out plants the user actioned today, so this naturally
   * surfaces just the remainder (or lands on the friendly empty state
   * if there's nothing left to walk).
   */
  onWalkAgain?: () => void;
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
export default function WalkSummaryCard({ durationMs, summary, onDone, onWalkAgain }: Props) {
  const stats: { icon: React.ReactNode; label: string; value: number; tone: string }[] = [
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
        <p className="text-sm text-rhozly-on-surface/65 mt-1.5">
          Nice walk. Come back tomorrow to keep the streak going.
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
