import React from "react";
import { createPortal } from "react-dom";
import { Leaf, Sparkles, ArrowRight, Lightbulb, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { LifecycleAnalysis } from "../types";

interface Props {
  isOpen: boolean;
  wasNaturalEnd: boolean;
  analysis: LifecycleAnalysis | null;
  plantName: string;
  aiEnabled: boolean;
  onClose: () => void;
}

/**
 * Closing-state modal shown after the lifecycle-complete flow.
 *
 * - Natural end: warm thanks + "the journey is closed" message.
 * - Non-natural end + AI-enabled: renders the Gemini analysis as
 *   "What likely happened" / "What to try next time" cards.
 * - Non-natural end + non-AI: friendly nudge to upgrade if they want
 *   automatic analysis next time, plus a link back to the journal.
 */
export default function LifecycleAnalysisModal({
  isOpen,
  wasNaturalEnd,
  analysis,
  plantName,
  aiEnabled,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const goToJournal = () => {
    onClose();
    navigate("/journal");
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lifecycle-analysis-title"
        className="bg-rhozly-surface-lowest w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl shadow-2xl border border-rhozly-outline/20"
      >
        <div className="px-6 py-5 border-b border-rhozly-outline/10 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary">
              {wasNaturalEnd ? <Leaf size={20} /> : <Sparkles size={20} />}
            </div>
            <div>
              <h2
                id="lifecycle-analysis-title"
                className="text-lg font-black text-rhozly-on-surface"
              >
                {wasNaturalEnd
                  ? `Thank you for tending ${plantName}`
                  : `Looking back on ${plantName}'s journey`}
              </h2>
              <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5">
                {wasNaturalEnd
                  ? "The journey is closed. The full record stays in your garden journal."
                  : aiEnabled
                    ? "What Rhozly noticed in your records — gentle, not gospel."
                    : "Your records are safe — review them in the global journal to spot what changed."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/40 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {wasNaturalEnd ? (
            <div className="rounded-2xl bg-rhozly-primary/5 border border-rhozly-primary/20 p-5 text-sm font-bold text-rhozly-on-surface leading-relaxed">
              Plants have seasons, and this one's was full. The journal entries, photos and notes you kept will be here whenever you want to revisit them.
            </div>
          ) : analysis ? (
            <>
              {analysis.affirmation && (
                <div className="rounded-2xl bg-rhozly-primary/5 border border-rhozly-primary/20 p-4 text-sm font-bold text-rhozly-on-surface leading-relaxed italic">
                  {analysis.affirmation}
                </div>
              )}
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 flex items-center gap-1.5">
                  <Sparkles size={11} /> What likely happened
                </h3>
                <ul className="space-y-2">
                  {analysis.likely_causes.map((cause, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm font-bold text-rhozly-on-surface leading-relaxed"
                    >
                      <span className="text-rhozly-primary mt-1 shrink-0">•</span>
                      <span>{cause}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 flex items-center gap-1.5">
                  <Lightbulb size={11} /> What to try next time
                </h3>
                <ul className="space-y-2">
                  {analysis.prevention_next_time.map((tip, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm font-bold text-rhozly-on-surface leading-relaxed"
                    >
                      <span className="text-rhozly-primary mt-1 shrink-0">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <div className="rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/15 p-5 text-sm font-bold text-rhozly-on-surface/70 leading-relaxed">
              {aiEnabled
                ? "We couldn't generate an analysis this time, but every record you kept is safe in the global journal."
                : "AI-powered lifecycle analysis is available on Sage and Evergreen tiers. Until then, the journal entries, tasks, and photos for this plant are all preserved — open the global journal to look back at the full timeline."}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-rhozly-outline/10 flex gap-2 justify-end">
          <button
            type="button"
            onClick={goToJournal}
            data-testid="lifecycle-analysis-open-journal"
            className="inline-flex items-center gap-1.5 bg-rhozly-primary text-white text-sm font-black px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition"
          >
            Open garden journal <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface/60 hover:bg-rhozly-surface-low transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
