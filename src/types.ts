export interface UserProfile {
  uid: string;
  email: string;
  display_name: string | null;
  home_id: string | null;
  ai_enabled: boolean;
  enable_perenual: boolean;
  subscription_tier: "sprout" | "botanist" | "sage" | "evergreen" | null;
  notification_interval_hours: number;
  created_at: string;
  onboarding_state: Record<string, "completed" | "dismissed">;
  can_view_audit?: boolean;
  is_beta: boolean;
  /** Timestamp the user completed (or skipped) the welcome carousel.
   *  NULL = brand-new account — render the welcome modal on next login. */
  welcomed_at: string | null;
  /** Self-declared gardening experience captured in the welcome flow.
   *  Used by future waves to bias copy (more tooltips for "new",
   *  terser for "experienced"). */
  persona: "new" | "experienced" | null;
  /** Per-step completion of the Getting Started checklist.
   *  Auto-detected from DB state for most fields; persisted here so
   *  the dashboard can render without re-fetching. */
  onboarding_steps: OnboardingSteps;
  /** Task categories that, when completed, automatically create a journal
   *  entry. Empty array = auto-update off. Reads from TASK_CATEGORIES so
   *  adding a new category later requires no schema change. */
  auto_update_journal_categories: string[];
}

export interface OnboardingSteps {
  quiz_completed?: boolean;
  first_location?: boolean;
  first_plant?: boolean;
  first_assignment?: boolean;
  first_schedule?: boolean;
  /** ISO timestamp the user dismissed the checklist for the day. */
  dismissed_at?: string | null;
}

export interface Home {
  id: string;
  name: string;
  created_at: string;
}

export interface HomeMember {
  id: string;
  home_id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  permissions: Record<string, boolean>;
  created_at: string;
}

export interface HomeMemberWithProfile extends HomeMember {
  display_name: string | null;
  email: string | null;
}
export interface Location {
  id: string;
  home_id: string;
  name: string;
  placement: string;
  created_at: string;
}

export interface Area {
  id: string;
  location_id: string;
  name: string;
  is_outside: boolean;
  created_at: string;
}

export interface YieldRecord {
  id: string;
  home_id: string;
  instance_id: string;
  value: number;
  unit: string;
  notes: string | null;
  harvested_at: string;
}

export interface NewYieldRecord {
  home_id: string;
  instance_id: string;
  value: number;
  unit: string;
  notes?: string | null;
}

export interface YieldPrediction {
  estimated_value: number;
  unit: string;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  tips: string[];
}

/**
 * The polymorphic surface a journal entry can be attached to. At most ONE
 * of these is set per entry (enforced by a DB CHECK constraint). When all
 * are null the entry is "unassigned" — a general garden note that lives
 * in the global journal only.
 */
export type JournalTargetType = "plant" | "location" | "area" | "plan" | "none";

export interface JournalTarget {
  type: JournalTargetType;
  /** UUID for location / area / plan; UUID string for plant (inventory_item_id). */
  id: string | null;
  /** Human-readable label for the chip rendered on the entry card. */
  label?: string | null;
}

/**
 * Canonical journal entry shape used by the global feed AND the per-instance
 * Journal tab — both surfaces read the same `plant_journals` table.
 */
export interface JournalEntry {
  id: string;
  home_id: string;
  subject: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  inventory_item_id: string | null;
  location_id: string | null;
  area_id: string | null;
  plan_id: string | null;
  /** Set when the entry was auto-created on task completion. Null for manual. */
  task_id: string | null;
}

/**
 * End-of-life payload captured by the LifecycleCompleteModal. Saved onto the
 * inventory_items row; the analysis (when invoked) uses these fields plus
 * journal / task / weather context to build the Gemini prompt.
 */
export interface LifecycleEndPayload {
  ended_at: string;
  was_natural_end: boolean;
  end_summary: string | null;
}

/**
 * The structured output of `analyse-plant-end-of-life`. Saved verbatim as
 * the description of the closing journal entry; also rendered in the
 * LifecycleAnalysisModal.
 */
export interface LifecycleAnalysis {
  likely_causes: string[];
  prevention_next_time: string[];
  affirmation: string;
}
