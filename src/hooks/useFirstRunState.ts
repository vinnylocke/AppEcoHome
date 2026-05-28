import { useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import type { OnboardingSteps, UserProfile } from "../types";

/**
 * Centralises the Getting Started checklist + persona state.
 *
 * The welcome carousel's "has the user seen it?" flag stays on
 * `user_profiles.onboarding_state.welcome_modal` (existing system —
 * see App.tsx). This hook focuses on:
 *
 *   • persona — read+write the user's self-declared experience
 *     ("new" / "experienced") captured during the welcome flow.
 *
 *   • onboarding_steps — per-step completion of the Getting Started
 *     checklist surface that appears on the dashboard until done.
 *
 * The hook is intentionally read+write thin — it derives display
 * flags from the profile passed in and exposes mutation helpers
 * that issue server-side updates.
 */
export interface FirstRunState {
  /** The user's self-declared persona, or null when not yet captured. */
  persona: UserProfile["persona"];
  /** Number of completed onboarding steps, 0–5. */
  completedSteps: number;
  /** Total number of trackable steps. */
  totalSteps: number;
  /** True when every onboarding step is done. */
  isOnboardingComplete: boolean;
  /** True when the user dismissed the checklist within the last 24h. */
  isChecklistDismissed: boolean;
  /** True when the user has not yet completed the welcome carousel
   *  (welcomed_at IS NULL). Mostly informational — App.tsx uses the
   *  legacy onboarding_state.welcome_modal flag to gate showing it. */
  needsWelcome: boolean;

  /** Persist the persona choice + welcomed_at timestamp. Called by
   *  the WelcomeModal when the user finishes the flow. */
  markWelcomed(persona: UserProfile["persona"]): Promise<void>;
  /** Flip a specific onboarding step to true. Idempotent — safe to
   *  call from auto-detection hooks. */
  markStep(step: keyof OnboardingSteps): Promise<void>;
  /** Hide the checklist for the next 24h. */
  dismissChecklist(): Promise<void>;
}

const TRACKED_STEPS: ReadonlyArray<keyof OnboardingSteps> = [
  "quiz_completed",
  "first_location",
  "first_plant",
  "first_assignment",
  "first_schedule",
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Was the checklist dismissed in the last 24h? Resurfaces after a
 * day so users with stale partial progress still get the nudge.
 */
function isRecentlyDismissed(dismissedAt: string | null | undefined): boolean {
  if (!dismissedAt) return false;
  const ms = Date.parse(dismissedAt);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms < ONE_DAY_MS;
}

export function deriveFirstRunState(profile: UserProfile | null): Omit<
  FirstRunState,
  "markWelcomed" | "markStep" | "dismissChecklist"
> {
  const steps: OnboardingSteps = profile?.onboarding_steps ?? {};
  const completedSteps = TRACKED_STEPS.reduce(
    (sum, key) => sum + (steps[key] ? 1 : 0),
    0,
  );
  return {
    persona: profile?.persona ?? null,
    completedSteps,
    totalSteps: TRACKED_STEPS.length,
    isOnboardingComplete: completedSteps >= TRACKED_STEPS.length,
    isChecklistDismissed: isRecentlyDismissed(steps.dismissed_at),
    needsWelcome: !!profile && profile.welcomed_at == null,
  };
}

export function useFirstRunState(
  profile: UserProfile | null,
  onProfileChange?: (next: UserProfile) => void,
): FirstRunState {
  const derived = useMemo(() => deriveFirstRunState(profile), [profile]);

  const persist = useCallback(
    async (patch: Partial<UserProfile>): Promise<UserProfile | null> => {
      if (!profile) return null;
      const { data, error } = await supabase
        .from("user_profiles")
        .update(patch)
        .eq("uid", profile.uid)
        .select("*")
        .single();
      if (error) {
        Logger.error("First-run state persist failed", error, { patch });
        throw error;
      }
      if (data && onProfileChange) onProfileChange(data as UserProfile);
      return data as UserProfile | null;
    },
    [profile, onProfileChange],
  );

  const markWelcomed = useCallback<FirstRunState["markWelcomed"]>(
    async (persona) => {
      await persist({
        welcomed_at: new Date().toISOString(),
        persona,
      });
    },
    [persist],
  );

  const markStep = useCallback<FirstRunState["markStep"]>(
    async (step) => {
      if (!profile) return;
      const currentSteps = profile.onboarding_steps ?? {};
      // Idempotent — bail early if already set so we don't churn writes.
      if (currentSteps[step]) return;
      const next: OnboardingSteps = { ...currentSteps, [step]: true };
      await persist({ onboarding_steps: next });
    },
    [profile, persist],
  );

  const dismissChecklist = useCallback<FirstRunState["dismissChecklist"]>(
    async () => {
      if (!profile) return;
      const next: OnboardingSteps = {
        ...(profile.onboarding_steps ?? {}),
        dismissed_at: new Date().toISOString(),
      };
      await persist({ onboarding_steps: next });
    },
    [profile, persist],
  );

  return {
    ...derived,
    markWelcomed,
    markStep,
    dismissChecklist,
  };
}
