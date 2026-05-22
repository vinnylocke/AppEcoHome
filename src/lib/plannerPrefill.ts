// Cross-screen hand-off for the "Create this Plan" CTA in the Plant
// Doctor chat. The chat overlay closes, navigates to /planner with the
// existing `?open=new-plan` flag, and stashes the pre-fill payload here.
// PlannerDashboard reads + clears it on mount.
//
// Stored as a JSON blob keyed by PREFILL_KEY rather than URL params
// because plan descriptions can be a couple of sentences long.

const PREFILL_KEY = "rhozly:plannerPrefill";

export interface PlannerPrefill {
  name: string;
  description: string;
}

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
}

export function writePlannerPrefill(payload: PlannerPrefill): void {
  if (!isStorageAvailable()) return;
  try {
    window.sessionStorage.setItem(PREFILL_KEY, JSON.stringify(payload));
  } catch {
    // QuotaExceeded / private-mode fallthroughs — non-fatal.
  }
}

export function readPlannerPrefill(): PlannerPrefill | null {
  if (!isStorageAvailable()) return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(PREFILL_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.name === "string" &&
      typeof parsed.description === "string"
    ) {
      return { name: parsed.name, description: parsed.description };
    }
  } catch {
    // Malformed JSON — treat as absent.
  }
  return null;
}

export function clearPlannerPrefill(): void {
  if (!isStorageAvailable()) return;
  try {
    window.sessionStorage.removeItem(PREFILL_KEY);
  } catch {
    // Non-fatal.
  }
}
