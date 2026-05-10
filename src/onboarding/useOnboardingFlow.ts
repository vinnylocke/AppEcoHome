import { useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { buildTour } from "./shepherdAdapter";
import { flowRegistry } from "./flowRegistry";
import type { OnboardingState } from "./types";

export function useOnboardingFlow(
  flowId: string,
  userId: string | undefined,
  onboardingState: OnboardingState,
  onStateChange: (state: OnboardingState) => void,
) {
  const tourRef = useRef<ReturnType<typeof buildTour> | null>(null);

  const persistState = useCallback(
    async (value: "completed" | "dismissed") => {
      if (!userId) return;
      const next = { ...onboardingState, [flowId]: value };
      onStateChange(next);
      await supabase
        .from("user_profiles")
        .update({ onboarding_state: next })
        .eq("uid", userId);
    },
    [flowId, userId, onboardingState, onStateChange],
  );

  const start = useCallback(() => {
    // Destroy existing tour for this flow if still running
    if (tourRef.current?.isActive()) {
      tourRef.current.cancel();
    }

    const flowDef = flowRegistry.find((f) => f.id === flowId);
    if (!flowDef) return;

    const tour = buildTour(
      flowDef,
      () => persistState("completed"),
      () => persistState("dismissed"),
    );
    tourRef.current = tour;
    tour.start();
  }, [flowId, persistState]);

  const status = onboardingState[flowId] ?? "not-started";

  return { start, status };
}
