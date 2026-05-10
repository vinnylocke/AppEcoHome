import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { flowRegistry } from "./flowRegistry";
import type { OnboardingState } from "./types";

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

export function useAutoTrigger(
  onboardingState: OnboardingState,
  triggerFlow: (flowId: string) => void,
  enabled: boolean,
) {
  const { pathname } = useLocation();
  const triggered = useRef(getTriggered());

  // Keep a ref so the pathname effect always reads the latest state
  // without taking onboardingState as a dependency. This prevents a
  // completed flow from immediately firing the next one — flows only
  // auto-trigger on route changes, giving the user natural breathing room.
  const stateRef = useRef(onboardingState);
  useEffect(() => {
    stateRef.current = onboardingState;
  }, [onboardingState]);

  useEffect(() => {
    if (!enabled) return;

    // Small delay so the route's components have time to mount
    const timer = setTimeout(() => {
      const state = stateRef.current;

      const candidates = flowRegistry
        .filter(
          (f) =>
            f.trigger === "automatic" &&
            (f.route === pathname || f.route === "global") &&
            !state[f.id] &&
            !triggered.current.has(f.id),
        )
        .sort((a, b) => a.order - b.order);

      if (candidates.length > 0) {
        const flow = candidates[0];
        markTriggered(flow.id);
        triggered.current = getTriggered();
        triggerFlow(flow.id);
      }
    }, 800);

    return () => clearTimeout(timer);
    // Intentionally omit onboardingState — we read it via stateRef so that
    // completing a flow doesn't immediately retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, enabled, triggerFlow]);
}
