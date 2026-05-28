import { describe, it, expect } from "vitest";
import { deriveFirstRunState } from "../../../src/hooks/useFirstRunState";
import type { UserProfile } from "../../../src/types";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "test-uid",
    email: "test@example.com",
    display_name: null,
    home_id: "home-1",
    ai_enabled: true,
    enable_perenual: true,
    subscription_tier: "sprout",
    notification_interval_hours: 24,
    created_at: "2026-01-01T00:00:00Z",
    onboarding_state: {},
    is_beta: false,
    welcomed_at: null,
    persona: null,
    onboarding_steps: {},
    ...overrides,
  };
}

describe("deriveFirstRunState", () => {
  it("returns safe defaults for a null profile", () => {
    const state = deriveFirstRunState(null);
    expect(state.needsWelcome).toBe(false);
    expect(state.completedSteps).toBe(0);
    expect(state.totalSteps).toBe(5);
    expect(state.isOnboardingComplete).toBe(false);
    expect(state.isChecklistDismissed).toBe(false);
    expect(state.persona).toBe(null);
  });

  it("flags needsWelcome when welcomed_at is null", () => {
    const state = deriveFirstRunState(makeProfile({ welcomed_at: null }));
    expect(state.needsWelcome).toBe(true);
  });

  it("does not flag needsWelcome once welcomed_at is set", () => {
    const state = deriveFirstRunState(
      makeProfile({ welcomed_at: "2026-01-01T00:00:00Z" }),
    );
    expect(state.needsWelcome).toBe(false);
  });

  it("counts completed steps", () => {
    const state = deriveFirstRunState(
      makeProfile({
        onboarding_steps: {
          quiz_completed: true,
          first_location: true,
          first_plant: false,
        },
      }),
    );
    expect(state.completedSteps).toBe(2);
  });

  it("isOnboardingComplete is true at 5/5", () => {
    const state = deriveFirstRunState(
      makeProfile({
        onboarding_steps: {
          quiz_completed: true,
          first_location: true,
          first_plant: true,
          first_assignment: true,
          first_schedule: true,
        },
      }),
    );
    expect(state.completedSteps).toBe(5);
    expect(state.isOnboardingComplete).toBe(true);
  });

  it("flags isChecklistDismissed for recent dismissal", () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const state = deriveFirstRunState(
      makeProfile({ onboarding_steps: { dismissed_at: recent } }),
    );
    expect(state.isChecklistDismissed).toBe(true);
  });

  it("does NOT flag isChecklistDismissed for old (>24h) dismissal", () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const state = deriveFirstRunState(
      makeProfile({ onboarding_steps: { dismissed_at: old } }),
    );
    expect(state.isChecklistDismissed).toBe(false);
  });

  it("ignores invalid dismissed_at strings", () => {
    const state = deriveFirstRunState(
      makeProfile({ onboarding_steps: { dismissed_at: "not-a-date" } }),
    );
    expect(state.isChecklistDismissed).toBe(false);
  });

  it("surfaces persona when set", () => {
    expect(deriveFirstRunState(makeProfile({ persona: "new" })).persona).toBe("new");
    expect(
      deriveFirstRunState(makeProfile({ persona: "experienced" })).persona,
    ).toBe("experienced");
  });
});
