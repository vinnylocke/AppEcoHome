import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

/**
 * Reusable 👍/👎 feedback control for guides, documentation and workflows.
 * Writes to `content_feedback` (content-quality signal — distinct from the AI
 * learning signal in `ai_feedback`). A thumbs-down inserts the rating immediately,
 * then reveals an optional "what's wrong / inaccurate?" box that patches the same
 * row so we never lose the negative signal even if no comment is left.
 *
 * Tie it to a piece of content with `surface` + `targetKind`/`targetId`
 * (and `targetLabel` so the admin viewer reads without a join). It never blocks
 * the UI — failures are swallowed.
 */
interface Props {
  /** Which kind of surface produced the content (e.g. "rhozly-guide", "app-help"). */
  surface: string;
  /** What's being rated (e.g. "guide", "answer", "flow"). */
  targetKind?: string;
  /** Stable id of the rated artefact (guide id, plant_<id>, question hash, flow id). */
  targetId?: string;
  /** Human-readable label (guide title, flow name) for the admin viewer. */
  targetLabel?: string;
  homeId?: string | null;
  /** Prompt copy. Defaults to "Was this helpful?". */
  label?: string;
  className?: string;
}

export default function ContentFeedback({
  surface,
  targetKind,
  targetId,
  targetLabel,
  homeId,
  label = "Was this helpful?",
  className,
}: Props) {
  const [rating, setRating] = useState<-1 | 1 | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const insert = async (r: -1 | 1): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("content_feedback")
      .insert({
        user_id: user.id,
        home_id: homeId ?? null,
        surface,
        target_kind: targetKind ?? null,
        target_id: targetId ?? null,
        target_label: targetLabel ?? null,
        rating: r,
      })
      .select("id")
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };

  const onUp = async () => {
    if (rating !== null || busy) return;
    setBusy(true);
    setRating(1);
    try {
      await insert(1);
      setDone(true);
    } catch { /* never block on feedback */ }
    setBusy(false);
  };

  const onDown = async () => {
    if (rating !== null || busy) return;
    setBusy(true);
    setRating(-1);
    try {
      const id = await insert(-1);
      setRowId(id);
      setShowComment(true);
    } catch { /* never block */ }
    setBusy(false);
  };

  const sendComment = async () => {
    const c = comment.trim();
    if (c && rowId) {
      try {
        await supabase.from("content_feedback").update({ comment: c }).eq("id", rowId);
      } catch { /* never block */ }
    }
    setDone(true);
  };

  if (done) {
    return (
      <span className={`text-[10px] font-bold text-rhozly-on-surface/40 ${className ?? ""}`} data-testid="content-feedback-done">
        Thanks for the feedback ✓
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`} data-testid="content-feedback">
      <span className="text-[10px] font-bold text-rhozly-on-surface/30">{label}</span>
      <button
        data-testid="content-feedback-up"
        onClick={onUp}
        disabled={busy || rating !== null}
        aria-label="Helpful"
        className={`p-1 rounded-md hover:bg-rhozly-surface transition-colors disabled:opacity-60 ${rating === 1 ? "text-emerald-600" : "text-rhozly-on-surface/30"}`}
      >
        {busy && rating === 1 ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
      </button>
      <button
        data-testid="content-feedback-down"
        onClick={onDown}
        disabled={busy || rating !== null}
        aria-label="Not helpful"
        className={`p-1 rounded-md hover:bg-rhozly-surface transition-colors disabled:opacity-60 ${rating === -1 ? "text-red-600" : "text-rhozly-on-surface/30"}`}
      >
        {busy && rating === -1 ? <Loader2 size={13} className="animate-spin" /> : <ThumbsDown size={13} />}
      </button>
      {showComment && (
        <div className="flex items-center gap-1">
          <input
            data-testid="content-feedback-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendComment()}
            placeholder="Tell us what's wrong or inaccurate (optional)"
            autoFocus
            className="text-[11px] font-medium text-rhozly-on-surface bg-white rounded-lg px-2 py-1 border border-rhozly-outline/15 outline-none focus:ring-1 focus:ring-rhozly-primary w-56"
          />
          <button
            data-testid="content-feedback-send"
            onClick={sendComment}
            className="text-[10px] font-black text-rhozly-primary px-1.5 py-1 rounded-md hover:bg-rhozly-surface"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
