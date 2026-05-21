import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  CalendarDays,
  NotebookPen,
  ArrowRight,
  Info,
  Sparkles,
  Sprout,
  BookOpen,
} from "lucide-react";

import QuickTile from "./quick/QuickTile";
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
      // green frame lives there too. Wave 11 fixes the screen to one
      // viewport — no scroll on phone. `h-full overflow-hidden` keeps
      // everything inside, the 2×2 grid below makes it fit.
      className="h-full w-full overflow-hidden"
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

      {/* Hero card — trimmed for one-screen fit (Wave 11). Brand stamp
          dropped on mobile so the greeting and sub can breathe. */}
      <header
        data-testid="quick-access-hero-card"
        className="relative mb-4 rounded-3xl border border-rhozly-primary-container/20 bg-gradient-to-br from-rhozly-primary-container/[0.08] via-white/40 to-rhozly-tertiary/25 overflow-hidden p-5 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.10),0_18px_36px_-20px_rgba(7,87,55,0.10)]"
      >
        {/* Soft radial gradients layered on top of the card gradient for depth */}
        <div
          aria-hidden
          data-testid="quick-access-hero-glow"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 18% 30%, rgba(7,87,55,0.06), transparent 55%), radial-gradient(circle at 92% 70%, rgba(255,218,216,0.35), transparent 55%)",
          }}
        />

        {/* Decorative sprout — sits behind text, faded */}
        <Sprout
          aria-hidden
          data-testid="quick-access-hero-sprout"
          size={76}
          className="absolute -top-2 -right-2 text-rhozly-primary-container/15 -rotate-12 pointer-events-none"
          strokeWidth={1.4}
        />

        {/* Eyebrow pill */}
        <div className="relative inline-flex items-center gap-1.5 bg-white/70 backdrop-blur-sm text-rhozly-primary px-2.5 py-0.5 rounded-full mb-2 border border-rhozly-primary/15">
          <Sparkles size={10} strokeWidth={2.5} />
          <span className="text-[10px] font-black uppercase tracking-widest">
            Quick Access
          </span>
        </div>

        {/* Heading — personalised + brand-coloured name accent */}
        <h1
          data-testid="quick-access-hero-greeting"
          className="relative font-display font-black text-xl sm:text-2xl text-rhozly-on-surface tracking-tight leading-tight"
        >
          {trimmedName ? (
            <>
              {greeting},{" "}
              <span className="text-rhozly-primary">{trimmedName}</span>
            </>
          ) : (
            "What can I help with?"
          )}
        </h1>

        {/* Sub */}
        <p className="relative text-[12px] sm:text-sm text-rhozly-on-surface/65 mt-1 leading-snug max-w-md">
          {trimmedName
            ? "Pick a quick action to get started."
            : "The essentials for when you're out in the garden."}
        </p>
      </header>

      {/* Tiles — 2×2 compact grid (Wave 11). Each tile uses the compact
          layout: icon on top, title + short description below. The grid
          expands to fill remaining vertical space so the four tiles
          balance the hero card. */}
      <div
        data-testid="quick-tiles-grid"
        className="grid grid-cols-2 grid-rows-2 gap-3 flex-1 min-h-0 mb-3"
      >
        <QuickTile
          testId="quick-tile-lens"
          accent="forest"
          layout="compact"
          icon={<Camera strokeWidth={2.25} />}
          title="Visual Lens"
          description="Identify, diagnose, get tasks from a photo."
          onClick={() => navigate("/quick/lens")}
        />
        <QuickTile
          testId="quick-tile-calendar"
          accent="amber"
          layout="compact"
          icon={<CalendarDays strokeWidth={2.25} />}
          title="Today"
          description="Tasks, rain forecast, planting helper."
          onClick={handleTodayTap}
        />
        <QuickTile
          testId="quick-tile-journal"
          accent="rose"
          layout="compact"
          icon={<NotebookPen strokeWidth={2.25} />}
          title="Quick Capture"
          description="Snap a photo and jot a note — file later."
          onClick={() => navigate("/quick/journal")}
        />
        <QuickTile
          testId="quick-tile-library"
          accent="indigo"
          layout="compact"
          icon={<BookOpen strokeWidth={2.25} />}
          title="The Library"
          description="Search any plant — care guide, grow guide, save."
          onClick={() => navigate("/library/search")}
        />
      </div>

      {/* Power-user escape hatch — sits at the bottom of the fixed screen */}
      <div className="flex justify-center shrink-0">
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
