import React, { useState, useEffect, useRef } from "react";
import { Star, X, ThumbsUp, ThumbsDown } from "lucide-react";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import { BETA_FEEDBACK_CONTEXTS } from "../constants/betaFeedbackContexts";

export default function BetaFeedbackSheet() {
  const { pendingFeedback, submitFeedback, dismissFeedback } = useBetaFeedbackContext();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Animate in when feedback appears
  useEffect(() => {
    if (pendingFeedback) {
      setRatings({});
      setDescription("");
      setVisible(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
    }
  }, [pendingFeedback]);

  if (!pendingFeedback) return null;

  const ctx = BETA_FEEDBACK_CONTEXTS[pendingFeedback.context];

  const handleSubmit = async () => {
    setSubmitting(true);
    await submitFeedback(ratings, description);
    setSubmitting(false);
  };

  const handleQuickRate = async (sentiment: "up" | "down") => {
    if (submitting) return;
    setSubmitting(true);
    const score = sentiment === "up" ? 5 : 1;
    const quickRatings: Record<string, number> = {};
    ctx.criteria.forEach((_, i) => { quickRatings[i] = score; });
    const note = sentiment === "up" ? "👍 Quick rating" : "👎 Quick rating";
    await submitFeedback(quickRatings, description ? `${note} — ${description}` : note);
    setSubmitting(false);
  };

  const allRated = ctx.criteria.every((_, i) => ratings[i] != null);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[200] bg-black/40 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={dismissFeedback}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        data-testid="beta-feedback-sheet"
        className={`fixed bottom-0 left-0 right-0 z-[201] bg-rhozly-surface rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out
          ${visible ? "translate-y-0" : "translate-y-full"}`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-rhozly-on-surface/20" />
        </div>

        <div className="px-6 pb-8 pt-2 max-w-lg mx-auto w-full">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="inline-block px-2 py-0.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-xs font-bold tracking-wider mb-2">
                Beta Feedback
              </span>
              <h2 className="text-base font-black text-rhozly-on-surface">{ctx.label}</h2>
            </div>
            <button
              data-testid="beta-feedback-dismiss"
              onClick={dismissFeedback}
              className="p-2 rounded-xl hover:bg-rhozly-on-surface/10 transition-colors text-rhozly-on-surface/50 -mt-1 -mr-2"
              aria-label="Dismiss"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick rating shortcut */}
          <div className="flex gap-2 mb-4">
            <button
              data-testid="beta-feedback-sheet-quick-up"
              onClick={() => handleQuickRate("up")}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
              aria-label="Thumbs up — quick positive rating"
            >
              <ThumbsUp size={16} />
              Working well
            </button>
            <button
              data-testid="beta-feedback-sheet-quick-down"
              onClick={() => handleQuickRate("down")}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-sm font-bold hover:bg-rose-100 transition-colors disabled:opacity-50"
              aria-label="Thumbs down — quick negative rating"
            >
              <ThumbsDown size={16} />
              Needs work
            </button>
          </div>

          <div className="relative mb-4 flex items-center gap-2 text-[10px] font-bold text-rhozly-on-surface/30 uppercase tracking-widest">
            <div className="flex-1 h-px bg-rhozly-on-surface/10" />
            Or rate in detail
            <div className="flex-1 h-px bg-rhozly-on-surface/10" />
          </div>

          {/* Rating rows */}
          <div className="space-y-4 mb-5">
            {ctx.criteria.map((criterion, i) => (
              <div key={i}>
                <p className="text-sm text-rhozly-on-surface/70 mb-1.5">{criterion}</p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      data-testid={`beta-feedback-star-${i}-${star}`}
                      onClick={() => setRatings((prev) => ({ ...prev, [i]: star }))}
                      className="p-0.5 transition-transform hover:scale-110 active:scale-95"
                      aria-label={`${star} star`}
                    >
                      <Star
                        size={28}
                        className={
                          ratings[i] != null && star <= ratings[i]
                            ? "fill-rhozly-primary text-rhozly-primary"
                            : "text-rhozly-on-surface/20"
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Free text */}
          <textarea
            data-testid="beta-feedback-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anything else to add? (optional)"
            rows={2}
            className="w-full text-sm rounded-2xl border border-rhozly-on-surface/15 bg-rhozly-bg px-4 py-3 text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40 resize-none mb-4"
          />

          {/* Actions */}
          <div className="flex gap-3">
            <button
              data-testid="beta-feedback-skip"
              onClick={dismissFeedback}
              className="flex-1 py-3 rounded-2xl border border-rhozly-on-surface/15 text-rhozly-on-surface/70 text-sm font-bold hover:bg-rhozly-on-surface/5 transition-colors"
            >
              Skip
            </button>
            <button
              data-testid="beta-feedback-submit"
              onClick={handleSubmit}
              disabled={!allRated || submitting}
              className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
