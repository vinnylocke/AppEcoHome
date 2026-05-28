import {
  Camera,
  CalendarDays,
  NotebookPen,
  BookOpen,
  Sprout,
  ClipboardList,
  Footprints,
  Stethoscope,
  ShoppingCart,
  LayoutGrid,
  ScanLine,
  SunMedium,
  Compass,
  GraduationCap,
  NotebookText,
  type LucideIcon,
} from "lucide-react";

import { TaskEngine, getLocalDateString } from "./taskEngine";

export type SubscriptionTier = "sprout" | "botanist" | "sage" | "evergreen";

/**
 * Quick Launcher catalogue — every destination that can be pinned to
 * the 2×2 (or 2×3) grid on `/quick`. Keep ids stable; they're
 * persisted in user prefs (localStorage + `user_profiles.quick_launcher_pins`).
 *
 * Removing an id from the catalogue is non-destructive: the render
 * filter drops unknown ids silently. Renaming an id, by contrast, would
 * orphan every existing pin — don't do it.
 */

export type QuickLauncherAccent =
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "purple"
  | "teal"
  | "slate";

export interface QuickLauncherAvailabilityCtx {
  subscriptionTier: SubscriptionTier | null;
  aiEnabled: boolean;
  isBeta: boolean;
  homeId: string | null;
}

export interface QuickLauncherDestination {
  /** Stable key persisted in prefs. */
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: QuickLauncherAccent;
  /** Path passed to react-router's navigate(). */
  route: string;
  /**
   * Optional gating predicate. When omitted the destination is
   * universally available. When present, the picker filters this entry
   * out for users who fail the check, AND the render layer hides any
   * tile whose destination is no longer available (e.g. tier downgrade).
   */
  isAvailable?: (ctx: QuickLauncherAvailabilityCtx) => boolean;
  /**
   * Optional side-effect fired BEFORE navigation. Used by the Today
   * tile today to pre-warm the calendar's task list so the next screen
   * paints instantly.
   */
  onTap?: (ctx: { homeId: string | null }) => void;
}

const todayPrefetch = ({ homeId }: { homeId: string | null }) => {
  if (!homeId) return;
  const todayStr = getLocalDateString(new Date());
  TaskEngine.prefetch({
    homeId,
    startDateStr: todayStr,
    endDateStr: todayStr,
    includeOverdue: true,
    todayStr,
  });
};

export const QUICK_LAUNCHER_CATALOGUE: readonly QuickLauncherDestination[] = [
  {
    id: "lens",
    label: "Lens",
    description: "Identify, diagnose, get tasks from a photo.",
    icon: Camera,
    accent: "green",
    route: "/quick/lens",
  },
  {
    id: "today",
    label: "Today",
    description: "Tasks, rain forecast, planting helper.",
    icon: CalendarDays,
    accent: "amber",
    route: "/quick/calendar",
    onTap: todayPrefetch,
  },
  {
    id: "capture",
    label: "Capture",
    description: "Snap a photo and jot a note — file later.",
    icon: NotebookPen,
    accent: "red",
    route: "/quick/journal",
  },
  {
    id: "library",
    label: "Library",
    description: "Search any plant — care guide, grow guide, save.",
    icon: BookOpen,
    accent: "blue",
    route: "/library/search",
  },
  {
    id: "shed",
    label: "Plants",
    description: "Jump straight to The Shed.",
    icon: Sprout,
    accent: "green",
    route: "/shed",
  },
  {
    id: "planner",
    label: "Planner",
    description: "Open your plans and projects.",
    icon: ClipboardList,
    accent: "purple",
    route: "/planner",
  },
  {
    id: "walk",
    label: "Walk",
    description: "Guided card-by-card plant tour.",
    icon: Footprints,
    accent: "teal",
    route: "/walk",
  },
  {
    id: "doctor",
    label: "Doctor",
    description: "Full Plant Doctor — history, chat, deeper analysis.",
    icon: Stethoscope,
    accent: "red",
    route: "/doctor",
  },
  {
    id: "shopping",
    label: "Shopping",
    description: "Lists for seeds, tools and supplies.",
    icon: ShoppingCart,
    accent: "slate",
    route: "/shopping",
  },
  // ── Tools (from the Tools Hub) ────────────────────────────────────
  {
    id: "journal",
    label: "Journal",
    description: "Your full garden journal — every entry in one feed.",
    icon: NotebookText,
    accent: "red",
    route: "/journal",
  },
  {
    id: "guides",
    label: "Guides",
    description: "Step-by-step care guides for every level.",
    icon: GraduationCap,
    accent: "slate",
    route: "/guides",
  },
  {
    id: "garden-layout",
    label: "Layout",
    description: "Design and visualise your garden in 2D / 3D.",
    icon: LayoutGrid,
    accent: "purple",
    route: "/garden-layout",
  },
  {
    id: "visualiser",
    label: "Visualiser",
    description: "Preview how plants look in your space via camera.",
    icon: ScanLine,
    accent: "blue",
    route: "/visualiser",
  },
  {
    id: "light-sensor",
    label: "Light Sensor",
    description: "Measure light levels to find the perfect spot.",
    icon: SunMedium,
    accent: "amber",
    route: "/lightsensor",
  },
  {
    id: "sun-tracker",
    label: "Sun Tracker",
    description: "Live sun overlay, day length, per-bed sun hours.",
    icon: Compass,
    accent: "teal",
    route: "/sun-trajectory",
  },
];

export const QUICK_LAUNCHER_BY_ID: Record<string, QuickLauncherDestination> =
  Object.fromEntries(QUICK_LAUNCHER_CATALOGUE.map((d) => [d.id, d]));

/** The default pin set when the user has no preference saved. */
export const DEFAULT_QUICK_LAUNCHER_PINS: readonly string[] = [
  "lens",
  "today",
  "capture",
  "library",
];

export const QUICK_LAUNCHER_MIN = 1;
export const QUICK_LAUNCHER_MAX = 10;

/**
 * Filters a list of pin ids down to those that (a) still exist in the
 * catalogue and (b) are available to the current user. Order is
 * preserved.
 */
export function resolvePins(
  pinIds: readonly string[],
  ctx: QuickLauncherAvailabilityCtx,
): QuickLauncherDestination[] {
  const seen = new Set<string>();
  const out: QuickLauncherDestination[] = [];
  for (const id of pinIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const dest = QUICK_LAUNCHER_BY_ID[id];
    if (!dest) continue;
    if (dest.isAvailable && !dest.isAvailable(ctx)) continue;
    out.push(dest);
  }
  return out;
}

/**
 * Catalogue entries available to the user, partitioned into
 * `{ pinned, available }` for the picker UI. `pinned` follows the
 * user's order. `available` (unpinned + still allowed) is in catalogue
 * order.
 */
export function partitionForPicker(
  pinIds: readonly string[],
  ctx: QuickLauncherAvailabilityCtx,
): {
  pinned: QuickLauncherDestination[];
  available: QuickLauncherDestination[];
} {
  const pinned = resolvePins(pinIds, ctx);
  const pinnedSet = new Set(pinned.map((d) => d.id));
  const available = QUICK_LAUNCHER_CATALOGUE.filter(
    (d) =>
      !pinnedSet.has(d.id) && (!d.isAvailable || d.isAvailable(ctx)),
  );
  return { pinned, available };
}
