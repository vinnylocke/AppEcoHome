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

  useEffect(() => {
    if (!enabled) return;

    // Small delay so the route's components have time to mount
    const timer = setTimeout(() => {
      const candidates = flowRegistry.filter(
        (f) =>
          f.trigger === "automatic" &&
          (f.route === pathname || f.route === "global") &&
          !onboardingState[f.id] &&
          !triggered.current.has(f.id),
      );

      // Fire only the first candidate (don't stack multiple tours)
      if (candidates.length > 0) {
        const flow = candidates[0];
        markTriggered(flow.id);
        triggered.current = getTriggered();
        triggerFlow(flow.id);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [pathname, enabled, onboardingState, triggerFlow]);
}
