import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  CalendarDays,
  NotebookPen,
  ArrowRight,
  Info,
  Sparkles,
  BookOpen,
} from "lucide-react";

import QuickTile from "./quick/QuickTile";
import WalkStartTile from "./walk/WalkStartTile";
import SeasonalPicksCard from "./seasonal/SeasonalPicksCard";
import { useIsMobile } from "../hooks/useIsMobile";
import { TaskEngine, getLocalDateString } from "../lib/taskEngine";

interface Props {
  /** Optional first-name for the personalised greeting. Falls back to a
   *  generic copy when null. */
  firstName?: string | null;
  /** Optional home id — when supplied, tapping the Today tile fires a
   *  background prefetch of today's task list so the calendar screen can
   *  paint instantly on mount. */
  homeId?: string | null;
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
export default function QuickAccessHome({ firstName, homeId }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const greeting = getTimeGreeting();
  const trimmedName = firstName?.trim() || null;

  /**
   * Fire-and-forget prefetch of today's task list before navigating to
   * /quick/calendar. By the time TaskList mounts (~30-50ms later) the
   * fetch is either already in-flight (and gets de-duped) or just
   * landed in cache → instant paint.
   */
  const handleTodayTap = () => {
    if (homeId) {
      const today = new Date();
      const todayStr = getLocalDateString(today);
      TaskEngine.prefetch({
        homeId,
        startDateStr: todayStr,
        endDateStr: todayStr,
        includeOverdue: true,
        todayStr,
      });
    }
    navigate("/quick/calendar");
  };

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
      // honours the home-indicator safe area.
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
      }}
      className="h-full w-full max-w-2xl mx-auto px-4 sm:px-6 flex flex-col"
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
        className="shrink-0 relative w-full text-left mb-3 rounded-2xl border border-rhozly-primary-container/20 bg-gradient-to-br from-rhozly-primary-container/[0.08] via-white/40 to-rhozly-tertiary/25 overflow-hidden px-4 py-3 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.10)] transition-all hover:shadow-[0_4px_16px_-4px_rgba(7,87,55,0.14)] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary/30 flex items-center gap-3"
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

      {/* Tiles — 2×2 compact grid. Wave 13 shrinks tiles to content size
          (icon + title + short description) instead of stretching them
          full-screen — the visible whitespace was making them feel empty.
          The dashboard escape pill is pushed to the bottom via mt-auto on
          the wrapper below. */}
      <div
        data-testid="quick-tiles-grid"
        className="grid grid-cols-4 gap-2 mb-3 shrink-0"
      >
        <QuickTile
          testId="quick-tile-lens"
          accent="green"
          layout="compact"
          dense
          icon={<Camera strokeWidth={2.25} />}
          title="Lens"
          description="Identify, diagnose, get tasks from a photo."
          onClick={() => navigate("/quick/lens")}
        />
        <QuickTile
          testId="quick-tile-calendar"
          accent="amber"
          layout="compact"
          dense
          icon={<CalendarDays strokeWidth={2.25} />}
          title="Today"
          description="Tasks, rain forecast, planting helper."
          onClick={handleTodayTap}
        />
        <QuickTile
          testId="quick-tile-journal"
          accent="red"
          layout="compact"
          dense
          icon={<NotebookPen strokeWidth={2.25} />}
          title="Capture"
          description="Snap a photo and jot a note — file later."
          onClick={() => navigate("/quick/journal")}
        />
        <QuickTile
          testId="quick-tile-library"
          accent="blue"
          layout="compact"
          dense
          icon={<BookOpen strokeWidth={2.25} />}
          title="Library"
          description="Search any plant — care guide, grow guide, save."
          onClick={() => navigate("/library/search")}
        />
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
          the tile grid and the dashboard pill stays at the foot. */}
      <div className="flex justify-center shrink-0 mt-auto">
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
