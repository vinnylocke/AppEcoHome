import {
  Camera,
  CalendarDays,
  CalendarRange,
  NotebookPen,
  StickyNote,
  Sprout,
  ClipboardList,
  Footprints,
  ShoppingCart,
  LayoutGrid,
  ScanLine,
  SunMedium,
  Compass,
  GraduationCap,
  NotebookText,
  Bug,
  BarChart3,
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
    description: "Snap a photo and jot a note — files into your journal.",
    icon: NotebookPen,
    accent: "red",
    route: "/journal?open=add-entry",
  },
  {
    id: "shed",
    label: "Plants",
    description: "Jump straight to your plants in The Shed.",
    icon: Sprout,
    // Takes over the slot the retired "library" tile freed up so the four
    // default pins (doctor / today / capture / shed) each have a distinct
    // accent — Plant Doctor is already green.
    accent: "blue",
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
    // The id stays "doctor" for backward-compatibility with persisted user
    // pins — the user-visible label/icon is what's been refreshed.
    id: "doctor",
    label: "Plant Doctor",
    description: "Snap a plant to identify it, diagnose problems and get care tasks.",
    icon: Camera,
    accent: "green",
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
    // B5 — the Ailment Library page died (Hub v3 Stage F): the Ailments tab's
    // search IS the field guide now.
    id: "ailment-library",
    label: "Ailments",
    description: "Search pests, diseases and invasives — and your watchlist.",
    icon: Bug,
    accent: "amber",
    route: "/shed?tab=watchlist",
  },
  {
    // B16 — pin Garden Reports (surfaced in Stage 5).
    id: "garden-reports",
    label: "Reports",
    description: "Your month and year in review.",
    icon: BarChart3,
    accent: "purple",
    route: "/reports",
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
  {
    id: "weekly",
    label: "Week Ahead",
    description: "Sunday-morning summary of tasks, weather, sow / harvest / prune windows and tips.",
    icon: CalendarRange,
    accent: "amber",
    route: "/weekly",
  },
  {
    id: "notes",
    label: "Notes",
    description: "Free-form notes — rich text, images, tables, links to plants / areas / plans / ailments.",
    icon: StickyNote,
    accent: "purple",
    route: "/journal?tab=notes",
  },
];

export const QUICK_LAUNCHER_BY_ID: Record<string, QuickLauncherDestination> =
  Object.fromEntries(QUICK_LAUNCHER_CATALOGUE.map((d) => [d.id, d]));

/** The default pin set when the user has no preference saved. */
export const DEFAULT_QUICK_LAUNCHER_PINS: readonly string[] = [
  "doctor",
  "today",
  "capture",
  "shed",
];

/**
 * Persona-aware default pins for the Home dashboard's quick-actions row
 * (docs/plans/new-home-dashboard.md §3.4). Only consulted when the user has
 * never customised their pins; a saved preference always wins. New/unknown
 * gardeners get the learning-and-capturing set (the classic defaults);
 * experienced gardeners get the operating set.
 */
export function defaultQuickLauncherPins(
  persona: "new" | "experienced" | null | undefined,
): readonly string[] {
  if (persona === "experienced") {
    return ["walk", "today", "journal", "light-sensor"];
  }
  return DEFAULT_QUICK_LAUNCHER_PINS;
}

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
