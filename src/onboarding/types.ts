export type TriggerMode = "automatic" | "manual-only";

export type FlowCategory =
  | "Getting Started"
  | "Garden"
  | "Planning"
  | "Tools"
  | "Community";

export interface StepDef {
  title: string;
  body: string;
  attachTo: {
    element: string | null;
    on: "bottom" | "top" | "left" | "right" | null;
  };
  image?: string;
  advanceOn?: {
    selector: string;
    event: string;
  };
  noSpotlight?: boolean;
}

export interface FlowDef {
  id: string;
  order: number;
  trigger: TriggerMode;
  route: string;
  title: string;
  description: string;
  category: FlowCategory;
  estimated_minutes: number;
  steps: StepDef[];
  /** Wave 23.0001 — flow can require another to be completed first.
   *  When set, eligibility check returns false if the prerequisite flow
   *  isn't in onboarding_state with status "completed" or "dismissed". */
  prerequisite?: string;
  /** Wave 23.0001 — replaces route-based auto-trigger with action-based.
   *  When set, the flow fires only after the named signal is recorded
   *  in onboarding_state.trigger_signals. */
  triggerSignal?: string;
  /** Wave 23.0001 — bypass the once-per-day throttle for first-session
   *  essentials (Welcome, Home Setup). Defaults to false. */
  important?: boolean;
}

/** Per-flow completion status. */
export type FlowStatus = "completed" | "dismissed";

/** Onboarding state persisted on user_profiles.onboarding_state jsonb.
 *
 *  Combines:
 *  - Per-flow status keys (any string id → "completed" | "dismissed")
 *  - Reserved meta keys (Wave 23.0001): last_auto_trigger_at, trigger_signals
 *
 *  Reserved keys are namespaced under a single underscore prefix-free
 *  convention; flow ids never start with `last_` / `trigger_` so they
 *  cannot collide.
 */
export interface OnboardingState {
  [flowId: string]: FlowStatus | string | Record<string, true> | undefined;
  /** ISO timestamp of the last non-important automatic flow fire. The
   *  throttle reads this and skips firing when its calendar day matches
   *  today's. */
  last_auto_trigger_at?: string;
  /** Map of recorded "first time the user did X" signals. Flows with a
   *  matching `triggerSignal` become eligible to fire once their signal
   *  is present here. */
  trigger_signals?: Record<string, true>;
}
