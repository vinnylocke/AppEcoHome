import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { flowRegistry } from "./flowRegistry";
import { isFlowDone, isSameLocalDay } from "./signals";
import type { FlowDef, OnboardingState } from "./types";

const SESSION_KEY = "rhozly_onboarding_triggered";

function getTriggered(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markTriggered(flowId: string) {
  const set = getTriggered();
  set.add(flowId);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set]));
}

// Wave 23.0001 — flow eligibility check.
//
// Returns true when a flow is allowed to fire automatically based on
// the user's current onboarding state and the active route. Used by
// the trigger effect below to sort + filter candidate flows.
function isEligible(
  f: FlowDef,
  state: OnboardingState,
  pathname: string,
  sessionTriggered: Set<string>,
): boolean {
  // Already completed / dismissed → never re-fire automatically.
  if (isFlowDone(state, f.id)) return false;
  // Fired earlier in this browser session → wait for the next session.
  if (sessionTriggered.has(f.id)) return false;
  // Prerequisite gate — chained tours (e.g. dashboard_tour after global_welcome).
  if (f.prerequisite && !isFlowDone(state, f.prerequisite)) return false;
  // Action-based trigger — fires only when the matching signal is recorded.
  if (f.triggerSignal) {
    return !!state.trigger_signals?.[f.triggerSignal];
  }
  // Legacy route-based trigger.
  return f.trigger === "automatic"
    && (f.route === pathname || f.route === "global");
}

interface UseAutoTriggerArgs {
  userId: string | undefined;
  state: OnboardingState;
  setState: (s: OnboardingState) => void;
  triggerFlow: (flowId: string) => void;
  enabled: boolean;
}

/** Wave 23.0001 — paced auto-trigger.
 *
 *  Throttle rules:
 *  1. Flows with `important: true` (Welcome, Home Setup) bypass the
 *     once-per-day cap. They still respect the session-triggered check.
 *  2. Other automatic flows fire at most ONCE per calendar day, tracked
 *     via `onboarding_state.last_auto_trigger_at`.
 *  3. Within a single browser session the same flow never fires twice
 *     regardless of route changes.
 *
 *  Net effect: a new user sees Welcome on day 1, maybe Home Setup, and
 *  then a single contextual tour per day after that — instead of the
 *  pre-23.0001 behaviour where every route change could fire a new tour.
 */
export function useAutoTrigger({
  userId,
  state,
  setState,
  triggerFlow,
  enabled,
}: UseAutoTriggerArgs) {
  const { pathname } = useLocation();
  const sessionTriggeredRef = useRef(getTriggered());

  // Keep state in a ref so the path effect always reads the latest
  // without re-firing on every state mutation.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      sessionTriggeredRef.current = getTriggered();

      const candidates = flowRegistry
        .filter((f) => isEligible(f, current, pathname, sessionTriggeredRef.current))
        .sort((a, b) => a.order - b.order);

      if (candidates.length === 0) return;

      // First-session essentials bypass the per-day throttle. Welcome +
      // Home Setup are designed to fire together when needed.
      const importantFlow = candidates.find((c) => c.important);
      if (importantFlow) {
        markTriggered(importantFlow.id);
        triggerFlow(importantFlow.id);
        return;
      }

      // Per-day throttle for everything else.
      if (isSameLocalDay(current.last_auto_trigger_at, new Date())) return;

      const flow = candidates[0];
      markTriggered(flow.id);
      triggerFlow(flow.id);

      // Persist the throttle stamp so cross-device sessions see the
      // same cap. We do not wait on the network — failure here just
      // means we might fire once more from a fresh device, which is a
      // tolerable edge case.
      const next: OnboardingState = {
        ...current,
        last_auto_trigger_at: new Date().toISOString(),
      };
      setState(next);
      if (userId) {
        void supabase
          .from("user_profiles")
          .update({ onboarding_state: next })
          .eq("uid", userId);
      }
    }, 800);
    return () => clearTimeout(timer);
    // Intentionally omit `state` — read via stateRef so completing a
    // flow doesn't immediately retrigger the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, enabled, triggerFlow, userId]);
}
