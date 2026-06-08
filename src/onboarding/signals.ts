import { supabase } from "../lib/supabase";
import type { FlowStatus, OnboardingState } from "./types";

// Wave 23.0001 — process-local cache so repeat calls in the same
// session no-op without a network round-trip. Cleared on full reload.
const recordedThisSession = new Set<string>();

/** Wave 23.0001 — record an action-based onboarding signal.
 *
 *  Idempotent: if the signal is already recorded (either in this session
 *  cache or in the persisted onboarding_state), this is a no-op.
 *  Persists to `user_profiles.onboarding_state` so it survives across
 *  devices and sessions.
 *
 *  Signals are consumed by `useAutoTrigger`: any flow with a matching
 *  `triggerSignal` field becomes eligible once the corresponding signal
 *  is present in `onboarding_state.trigger_signals`.
 *
 *  Use this signature when you already have onboarding state in hand
 *  (e.g. HelpCenter, GettingStartedChecklist). For deep-feature surfaces
 *  that don't want to thread state through, use `recordSignal()` below.
 */
export async function recordOnboardingSignal(args: {
  userId: string | undefined;
  signal: string;
  state: OnboardingState;
  setState: (next: OnboardingState) => void;
}): Promise<void> {
  const { userId, signal, state, setState } = args;
  if (!userId) return;
  if (recordedThisSession.has(signal)) return;
  if (state.trigger_signals?.[signal]) {
    recordedThisSession.add(signal);
    return;
  }
  const next: OnboardingState = {
    ...state,
    trigger_signals: { ...(state.trigger_signals ?? {}), [signal]: true },
  };
  recordedThisSession.add(signal);
  setState(next);
  try {
    await supabase
      .from("user_profiles")
      .update({ onboarding_state: next })
      .eq("uid", userId);
  } catch {
    // Best-effort. A later signal write or status update implicitly retries.
  }
}

/** Wave 23.0001 — standalone signal recorder.
 *
 *  Self-fetches the current user + state and writes a merged update
 *  back. Used by surfaces that don't already hold `onboardingState` in
 *  React state (PlantDoctorChat, NotesPage, WeeklyOverviewPage, etc.).
 *
 *  Safe to call repeatedly: an in-process cache short-circuits repeat
 *  invocations after the first success.
 */
export async function recordSignal(signal: string): Promise<void> {
  if (recordedThisSession.has(signal)) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { data: row } = await supabase
      .from("user_profiles")
      .select("onboarding_state")
      .eq("uid", userId)
      .maybeSingle();
    const state = (row?.onboarding_state ?? {}) as OnboardingState;
    if (state.trigger_signals?.[signal]) {
      recordedThisSession.add(signal);
      return;
    }
    const next: OnboardingState = {
      ...state,
      trigger_signals: { ...(state.trigger_signals ?? {}), [signal]: true },
    };
    recordedThisSession.add(signal);
    await supabase
      .from("user_profiles")
      .update({ onboarding_state: next })
      .eq("uid", userId);
  } catch {
    // Best-effort. Signals are advisory — a missed write just delays the
    // matching tour by one feature-use cycle.
  }
}

/** Helper for tests + internal eligibility checks. A "completed or
 *  dismissed" flow counts as "done" for prerequisite purposes — both
 *  states mean the user has seen the content. */
export function isFlowDone(state: OnboardingState, flowId: string): boolean {
  const v = state[flowId];
  return v === "completed" || v === "dismissed";
}

/** Calendar-day comparison (local time). Used by the throttle check. */
export function isSameLocalDay(isoA: string | undefined, isoB: Date | string): boolean {
  if (!isoA) return false;
  const a = new Date(isoA);
  const b = typeof isoB === "string" ? new Date(isoB) : isoB;
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

export type { FlowStatus };
