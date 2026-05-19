import { useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { BETA_FEEDBACK_CONTEXTS, type FeedbackContext } from "../constants/betaFeedbackContexts";

// Tracks only contexts where the user actually submitted — dismissals don't block re-shows
const SUBMITTED_KEY = "rhozly_beta_feedback_submitted";
const COOLDOWN_MS = 60_000;

export interface PendingFeedback {
  context: FeedbackContext;
  metadata: Record<string, unknown>;
}

export function useBetaFeedback(isBeta: boolean, userId: string | undefined) {
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback | null>(null);
  const cooldownUntil = useRef<number>(0);

  const getSubmitted = (): FeedbackContext[] => {
    try {
      return JSON.parse(sessionStorage.getItem(SUBMITTED_KEY) ?? "[]");
    } catch {
      return [];
    }
  };

  const markSubmitted = (context: FeedbackContext) => {
    const submitted = getSubmitted();
    if (!submitted.includes(context)) {
      sessionStorage.setItem(SUBMITTED_KEY, JSON.stringify([...submitted, context]));
    }
  };

  const requestFeedback = useCallback(
    (context: FeedbackContext, metadata: Record<string, unknown> = {}) => {
      if (!isBeta || !userId) return;
      if (Date.now() < cooldownUntil.current) return;
      if (getSubmitted().includes(context)) return;

      setTimeout(() => {
        setPendingFeedback({ context, metadata });
      }, 30_000);
    },
    [isBeta, userId],
  );

  const dismissFeedback = useCallback(() => {
    // Dismiss: just clear pending and start cooldown — does NOT mark as submitted
    setPendingFeedback(null);
    cooldownUntil.current = Date.now() + COOLDOWN_MS;
  }, []);

  const submitFeedback = useCallback(
    async (ratings: Record<string, number>, description: string) => {
      if (!pendingFeedback || !userId) return;
      await supabase.from("beta_feedback").insert({
        user_id: userId,
        action_context: pendingFeedback.context,
        ratings,
        description: description || null,
        metadata: pendingFeedback.metadata,
      });
      markSubmitted(pendingFeedback.context);
      setPendingFeedback(null);
      cooldownUntil.current = Date.now() + COOLDOWN_MS;
    },
    [pendingFeedback, userId],
  );

  const submitGeneralFeedback = useCallback(
    async (actionContext: string, description: string) => {
      if (!userId) return;
      await supabase.from("beta_feedback").insert({
        user_id: userId,
        action_context: actionContext,
        ratings: {},
        description: description || null,
        metadata: { source: "manual" },
      });
    },
    [userId],
  );

  return { requestFeedback, pendingFeedback, submitFeedback, dismissFeedback, submitGeneralFeedback, isBeta, userId };
}

export { BETA_FEEDBACK_CONTEXTS };
