import React from "react";
import { ChevronDown, ChevronUp, Archive, Sparkles, ArrowRight, ThumbsUp, ThumbsDown } from "lucide-react";
import type { OptimisationProposal, ScenarioType } from "../lib/taskOptimiser";
import InfoTooltip from "./InfoTooltip";

const SCENARIO_META: Record<ScenarioType, { label: string; colour: string; tooltip: string }> = {
  fragmentation:      { label: "Fragmentation",     colour: "bg-amber-100 text-amber-800",   tooltip: "You have several small tasks that could be merged into one to save time." },
  redundant:          { label: "Redundant Overlap",  colour: "bg-red-100 text-red-800",      tooltip: "This task duplicates another task in the same area — one of them can be removed." },
  "two-tier":         { label: "Two-Tier Split",     colour: "bg-blue-100 text-blue-800",    tooltip: "Two tasks with different frequencies could be split into separate schedules for better control." },
  pileup:             { label: "Same-Day Pile-Up",   colour: "bg-purple-100 text-purple-800", tooltip: "Multiple tasks are scheduled to land on the same day — spreading them out would make your workload lighter." },
  "frequency-change": { label: "Frequency Change",   colour: "bg-sky-100 text-sky-800",      tooltip: "AI suggests adjusting how often you do this task based on your plants' needs or the season." },
  "new-blueprint":    { label: "New Blueprint",      colour: "bg-emerald-100 text-emerald-800", tooltip: "AI suggests adding a task that's currently missing from your schedule." },
  retire:             { label: "Retire",             colour: "bg-zinc-100 text-zinc-700",    tooltip: "This task may no longer apply to any of your active plants and could be removed." },
};

export interface FeedbackState {
  rating: "positive" | "negative" | null;
  submitting: boolean;
}

interface Props {
  proposal: OptimisationProposal;
  included: boolean;
  onToggle: () => void;
  feedbackState?: FeedbackState;
  onFeedback?: (rating: "positive" | "negative") => void;
}

export default function OptimisationProposalCard({
  proposal,
  included,
  onToggle,
  feedbackState,
  onFeedback,
}: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const meta = SCENARIO_META[proposal.scenario];
  const isAi = proposal.source === "ai";

  return (
    <div
      data-testid={`proposal-card-${proposal.id}`}
      className={`rounded-2xl border transition-colors ${included ? "border-rhozly-primary/30 bg-white" : "border-rhozly-outline/20 bg-rhozly-surface-low opacity-60"}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <input
          type="checkbox"
          data-testid={`proposal-toggle-${proposal.id}`}
          checked={included}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-rhozly-outline accent-rhozly-primary shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.colour}`}>
              {meta.label}
            </span>
            <InfoTooltip content={meta.tooltip} size={12} />
            <span className="text-[10px] font-semibold text-rhozly-on-surface-variant bg-rhozly-surface px-2 py-0.5 rounded-full">
              {proposal.category}
            </span>
            {isAi ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                AI
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rhozly-surface-low text-rhozly-on-surface-variant border border-rhozly-outline/20">
                Rule
              </span>
            )}
          </div>
          <p className="text-sm text-rhozly-on-surface leading-snug">{proposal.displayText}</p>
          {proposal.reasoning && (
            <p className="text-[11px] text-rhozly-on-surface-variant italic mt-1.5 leading-snug">
              ✦ {proposal.reasoning}
            </p>
          )}
        </div>
        <button
          data-testid={`proposal-expand-${proposal.id}`}
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 p-1 text-rhozly-on-surface-variant hover:text-rhozly-on-surface transition-colors"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* AI feedback thumbs */}
      {isAi && onFeedback && (
        <div className="flex items-center gap-2 px-4 pb-3 -mt-1">
          <button
            data-testid={`proposal-thumbs-up-${proposal.id}`}
            disabled={feedbackState?.rating !== null || feedbackState?.submitting}
            onClick={() => onFeedback("positive")}
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
              feedbackState?.rating === "positive"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-transparent border-rhozly-outline/20 text-rhozly-on-surface-variant hover:border-emerald-300 hover:text-emerald-700"
            }`}
          >
            <ThumbsUp size={12} />
            Helpful
          </button>
          <button
            data-testid={`proposal-thumbs-down-${proposal.id}`}
            disabled={feedbackState?.rating !== null || feedbackState?.submitting}
            onClick={() => onFeedback("negative")}
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
              feedbackState?.rating === "negative"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-transparent border-rhozly-outline/20 text-rhozly-on-surface-variant hover:border-red-300 hover:text-red-700"
            }`}
          >
            <ThumbsDown size={12} />
            Not helpful
          </button>
        </div>
      )}

      {/* Expanded before/after */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-rhozly-outline/10 pt-3">
          {/* frequency-change: just show what changes */}
          {proposal.scenario === "frequency-change" && proposal.frequencyChanges?.length ? (
            <div className="space-y-2">
              {proposal.frequencyChanges.map((fc) => {
                const beforeItem = proposal.before.find((b) => b.blueprintId === fc.blueprintId);
                return (
                  <div key={fc.blueprintId} className="flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-sky-800 truncate">{beforeItem?.title ?? fc.blueprintId}</p>
                      <p className="text-[10px] text-sky-600">
                        Every {beforeItem?.frequencyDays ?? "?"} days → every {fc.newFrequencyDays} days
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
              {/* Before column */}
              <div>
                <p className="text-[10px] font-bold text-rhozly-on-surface-variant uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Archive size={10} /> Before
                </p>
                <div className="space-y-2">
                  {proposal.before.map((item) => (
                    <div key={item.blueprintId} className="rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                      <p className="text-xs font-semibold text-red-700 truncate">{item.title}</p>
                      <p className="text-[10px] text-red-600">
                        Every {item.frequencyDays ?? "?"} days
                      </p>
                      {item.plantNames.length > 0 && (
                        <p className="text-[10px] text-red-500 mt-0.5 truncate">
                          {item.plantNames.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Arrow */}
              <div className="hidden sm:flex items-center justify-center text-rhozly-on-surface-variant">
                <ArrowRight size={16} />
              </div>

              {/* After column */}
              <div>
                <p className="text-[10px] font-bold text-rhozly-on-surface-variant uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Sparkles size={10} /> After
                </p>
                <div className="space-y-2">
                  {proposal.after.map((item, i) => (
                    <div
                      key={item.retainedBlueprintId ?? `new-${i}`}
                      className={`rounded-xl border px-3 py-2 ${item.isNew ? "bg-emerald-50 border-emerald-100" : "bg-rhozly-surface border-rhozly-outline/20"}`}
                    >
                      {item.isNew && (
                        <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide">New</span>
                      )}
                      <p className={`text-xs font-semibold truncate ${item.isNew ? "text-emerald-700" : "text-rhozly-on-surface"}`}>
                        {item.title}
                      </p>
                      <p className={`text-[10px] ${item.isNew ? "text-emerald-600" : "text-rhozly-on-surface-variant"}`}>
                        Every {item.frequencyDays} days
                      </p>
                      {item.plantNames.length > 0 && (
                        <p className={`text-[10px] mt-0.5 truncate ${item.isNew ? "text-emerald-500" : "text-rhozly-on-surface-variant"}`}>
                          {item.plantNames.join(", ")}
                        </p>
                      )}
                      {!item.isNew && (
                        <p className="text-[9px] text-rhozly-on-surface-variant mt-0.5">Kept as-is</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
