import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Info, Sparkles, Settings2 } from "lucide-react";

import QuickTile from "./quick/QuickTile";
import WalkStartTile from "./walk/WalkStartTile";
import SeasonalPicksCard from "./seasonal/SeasonalPicksCard";
import { useIsMobile } from "../hooks/useIsMobile";
import { useQuickLauncherPins } from "../hooks/useQuickLauncherPins";
import {
  resolvePins,
  type QuickLauncherAvailabilityCtx,
  type SubscriptionTier,
} from "../lib/quickLauncherCatalogue";

interface Props {
  /** Optional first-name for the personalised greeting. Falls back to a
   *  generic copy when null. */
  firstName?: string | null;
  /** Optional home id — when supplied, tapping the Today tile fires a
   *  background prefetch of today's task list so the calendar screen can
   *  paint instantly on mount. */
  homeId?: string | null;
  /** Active user id — drives the cross-device sync of pinned launcher tiles. */
  userId?: string | null;
  /** Subscription tier — drives availability gating in the launcher. */
  subscriptionTier?: SubscriptionTier | null;
  /** Whether the user has an AI-enabled tier. */
  aiEnabled?: boolean;
  /** Whether the user is a beta participant — gates beta-only destinations. */
  isBeta?: boolean;
}

function getTimeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Mobile home screen — surfaces the in-the-garden essentials in three big
 * tap targets. Mounted at `/quick`. Desktop visitors can preview it (a small
 * banner explains it's the mobile shortcut), but their `/` redirect still
 * lands them on `/dashboard`.
 *
 * Wave 7 added the personalised greeting + per-tile colour accents.
 * Wave 8 adds: top safe-area padding so the menu button stops crowding the
 * hero, a green-tinted hero card with a border to break up the white, and
 * the Rhozly logo + wordmark inside the hero as a restrained brand stamp.
 */
export default function QuickAccessHome({
  firstName,
  homeId,
  userId,
  subscriptionTier,
  aiEnabled = false,
  isBeta = false,
}: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { pins } = useQuickLauncherPins(userId ?? null);

  const greeting = getTimeGreeting();
  const trimmedName = firstName?.trim() || null;

  const availabilityCtx: QuickLauncherAvailabilityCtx = {
    subscriptionTier: subscriptionTier ?? null,
    aiEnabled,
    isBeta,
    homeId: homeId ?? null,
  };
  const tiles = resolvePins(pins, availabilityCtx);
  // 1-4 pinned → 2 cols (1 or 2 rows). 5-6 pinned → 2 cols 3 rows. Dense
  // styling stays on for the 4-tile case where each cell is small; relax
  // to non-dense for ≥5 since the screen is now showing one extra row.
  const useDenseTiles = tiles.length <= 4;
  const gridRowsClass = tiles.length <= 2 ? "grid-rows-1" : tiles.length <= 4 ? "grid-rows-2" : "grid-rows-3";

  return (
    <div
      data-testid="quick-access-page"
      // Wave 9 moved the green wash to the App.tsx shell. The screen-edge
      // green frame lives there too. Wave 11 fixed the screen to one
      // viewport on tall devices; post-Nursery we added the Seasonal
      // Picks strip which can push the footer off-screen on shorter
      // phones — `overflow-y-auto` keeps the picks reachable there.
      className="h-full w-full overflow-y-auto"
    >
    <main
      data-testid="quick-access-home"
      // Top padding clears the Wave 6 floating menu button (top-right) +
      // device safe-area (notches / dynamic islands). Bottom padding
      // honours the home-indicator safe area, with extra breathing room
      // so the "Open full dashboard" pill is never clipped on shorter
      // phones. `min-h-0` lets the flex column shrink correctly inside
      // the scroll wrapper.
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
      }}
      className="min-h-0 w-full max-w-2xl mx-auto px-4 sm:px-6 flex flex-col"
    >
      {/* Desktop preview banner */}
      {!isMobile && (
        <div
          data-testid="quick-access-desktop-banner"
          className="flex items-start gap-3 mb-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900"
        >
          <Info size={16} className="shrink-0 mt-0.5" />
          <p className="text-xs font-bold leading-snug">
            This is the mobile shortcut screen. Your full dashboard is at{" "}
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="underline font-black hover:text-amber-700"
            >
              /dashboard
            </button>
            .
          </p>
        </div>
      )}

      {/* Hero card — compact pill (Wave 15). Earlier waves stacked a
          decorative sprout + eyebrow pill + greeting + sub-line; with
          the Seasonal Picks strip below the walk tile the hero was
          being squeezed on shorter phones. This version is single-row
          with the greeting + a small chevron and `shrink-0` so it never
          loses its height to flex pressure. */}
      <button
        type="button"
        data-testid="quick-access-hero-card"
        onClick={() => navigate("/gardener")}
        aria-label="Open Account Settings"
        // `pr-16` on mobile reserves space for the floating menu button
        // (top-right, `z-[105]`) so the ArrowRight + helper line never
        // get covered when the page scrolls beneath the button.
        className="shrink-0 relative z-0 w-full text-left mb-3 rounded-2xl border border-rhozly-primary-container/20 bg-gradient-to-br from-rhozly-primary-container/[0.08] via-white/40 to-rhozly-tertiary/25 overflow-hidden px-4 py-3 pr-16 sm:pr-4 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.10)] transition-all hover:shadow-[0_4px_16px_-4px_rgba(7,87,55,0.14)] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary/30 flex items-center gap-3"
      >
        <div className="shrink-0 w-9 h-9 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
          <Sparkles size={15} strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <h1
            data-testid="quick-access-hero-greeting"
            className="font-display font-black text-base sm:text-lg text-rhozly-on-surface tracking-tight leading-tight truncate"
          >
            {trimmedName ? (
              <>
                {greeting},{" "}
                <span className="text-rhozly-primary">{trimmedName}</span>
              </>
            ) : (
              greeting
            )}
          </h1>
          <p className="text-[11px] text-rhozly-on-surface/55 leading-snug truncate">
            Tap to manage your account
          </p>
        </div>
        <ArrowRight size={14} className="shrink-0 text-rhozly-on-surface/40" />
      </button>

      {/* Tiles — customisable launcher (Wave 16). Renders the user's
          pinned destinations from the catalogue. 1-4 pins → 2 cols,
          1-2 rows. 5-6 pins → 2 cols, 3 rows. Each tile uses the
          accent + icon defined in `quickLauncherCatalogue.ts`. */}
      <div
        data-testid="quick-tiles-grid"
        data-pinned-count={tiles.length}
        className={`grid grid-cols-2 ${gridRowsClass} gap-2 mb-2 shrink-0`}
      >
        {tiles.map((dest) => {
          const Icon = dest.icon;
          return (
            <QuickTile
              key={dest.id}
              testId={`quick-tile-${dest.id}`}
              accent={dest.accent}
              layout="compact"
              dense={useDenseTiles}
              icon={<Icon strokeWidth={2.25} />}
              title={dest.label}
              description={dest.description}
              onClick={() => {
                dest.onTap?.({ homeId: homeId ?? null });
                navigate(dest.route);
              }}
            />
          );
        })}
      </div>

      {/* Customise link — small button below the launcher that deep-links
          to the picker section of Account Settings. Keeps the feature
          discoverable for users who never open Settings on their own. */}
      <div className="flex justify-end shrink-0 mb-3">
        <button
          type="button"
          data-testid="quick-access-customise-launcher"
          onClick={() => navigate("/gardener?section=quick-launcher")}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rhozly-on-surface/55 hover:text-rhozly-primary transition-colors px-2 py-1 rounded-full"
          aria-label="Customise the Quick Launcher"
        >
          <Settings2 size={12} />
          Customise
        </button>
      </div>

      {/* Wide tile — the "morning ritual" CTA, deliberately a different
          shape from the four utility tiles above. The walk's own empty
          state handles the no-plants case gracefully. */}
      <div className="shrink-0 mb-3">
        <WalkStartTile enabled={true} />
      </div>

      {/* Seasonal picks — carousel pager. One pick visible at a time;
          prev / next chevrons + dot indicator + native swipe. Compact
          enough that the hero + tile row + walk tile + carousel + footer
          all fit on a typical phone viewport. */}
      {homeId && (
        <div className="shrink-0 mb-3">
          <SeasonalPicksCard homeId={homeId} variant="carousel" />
        </div>
      )}

      {/* Power-user escape hatch — pinned to the bottom via mt-auto so
          when there's vertical space the picks/walk strip sits up near
          the tile grid and the dashboard pill stays at the foot. The
          `pb-2` adds extra breathing room above the home-indicator on
          shorter phones, so the pill is never clipped. */}
      <div className="flex justify-center shrink-0 mt-auto pb-2">
        <button
          type="button"
          data-testid="quick-access-open-dashboard"
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-full bg-white border border-rhozly-outline/15 text-xs font-bold text-rhozly-on-surface/65 hover:text-rhozly-primary hover:border-rhozly-primary/30 hover:shadow-sm transition-all"
        >
          Open full dashboard
          <ArrowRight size={12} />
        </button>
      </div>
    </main>
    </div>
  );
}
