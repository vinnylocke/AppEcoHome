import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

/**
 * Reusable 👍/👎 feedback control for any AI output. Writes to `ai_feedback`
 * (the Phase 3 learning signal). A thumbs-down inserts the signal immediately,
 * then reveals an optional "what was off?" box that updates the same row.
 *
 * Tie it to a specific call with `targetKind`/`targetId` (and `homeId` for the
 * per-home rollup). It never blocks the UI — failures are swallowed.
 */
interface Props {
  /** The edge function / feature that produced the output (e.g. "agent-chat", "plant-doctor"). */
  functionName: string;
  /** Optional sub-action (e.g. "diagnose", "chat_reply"). */
  action?: string;
  homeId?: string | null;
  /** What's being rated (e.g. "chat_message", "diagnosis", "guide"). */
  targetKind?: string;
  /** Stable id of the rated artefact (message id, diagnosis id, …). */
  targetId?: string;
  className?: string;
}

export default function AiFeedback({
  functionName,
  action,
  homeId,
  targetKind,
  targetId,
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
      .from("ai_feedback")
      .insert({
        user_id: user.id,
        home_id: homeId ?? null,
        function_name: functionName,
        action: action ?? null,
        rating: r,
        target_kind: targetKind ?? null,
        target_id: targetId ?? null,
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
        await supabase.from("ai_feedback").update({ comment: c }).eq("id", rowId);
      } catch { /* never block */ }
    }
    setDone(true);
  };

  if (done) {
    return (
      <span className={`text-[10px] font-bold text-rhozly-on-surface/40 ${className ?? ""}`} data-testid="ai-feedback-done">
        Thanks for the feedback ✓
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`} data-testid="ai-feedback">
      <span className="text-[10px] font-bold text-rhozly-on-surface/30">Helpful?</span>
      <button
        data-testid="ai-feedback-up"
        onClick={onUp}
        disabled={busy || rating !== null}
        aria-label="Helpful"
        className={`p-1 rounded-md hover:bg-rhozly-surface transition-colors disabled:opacity-60 ${rating === 1 ? "text-emerald-600" : "text-rhozly-on-surface/30"}`}
      >
        {busy && rating === 1 ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
      </button>
      <button
        data-testid="ai-feedback-down"
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
            data-testid="ai-feedback-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendComment()}
            placeholder="What was off? (optional)"
            autoFocus
            className="text-[11px] font-medium text-rhozly-on-surface bg-white rounded-lg px-2 py-1 border border-rhozly-outline/15 outline-none focus:ring-1 focus:ring-rhozly-primary w-44"
          />
          <button
            data-testid="ai-feedback-send"
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
