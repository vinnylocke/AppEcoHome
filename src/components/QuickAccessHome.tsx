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
      // green frame lives there too (added in this wave). This wrapper
      // stays as a transparent layout container.
      className="min-h-full w-full"
    >
    <main
      data-testid="quick-access-home"
      // Top padding clears the Wave 6 floating menu button (top-right) +
      // device safe-area (notches / dynamic islands).
      style={{ paddingTop: "calc(5rem + env(safe-area-inset-top, 0px))" }}
      className="min-h-full w-full max-w-2xl mx-auto px-4 sm:px-6 pb-8 flex flex-col justify-center"
    >
      {/* Desktop preview banner */}
      {!isMobile && (
        <div
          data-testid="quick-access-desktop-banner"
          className="flex items-start gap-3 mb-5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900"
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

      {/* Hero card — green-tinted, brand-stamped, decorated */}
      <header
        data-testid="quick-access-hero-card"
        className="relative mb-6 rounded-3xl border border-rhozly-primary-container/20 bg-gradient-to-br from-rhozly-primary-container/[0.08] via-white/40 to-rhozly-tertiary/25 overflow-hidden p-6 sm:p-7 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.10),0_18px_36px_-20px_rgba(7,87,55,0.10)]"
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
          size={92}
          className="absolute -top-3 -right-3 text-rhozly-primary-container/15 -rotate-12 pointer-events-none"
          strokeWidth={1.4}
        />

        {/* Brand stamp — logo + wordmark */}
        <div
          data-testid="quick-access-hero-brand"
          className="relative flex items-center gap-2.5 mb-4"
        >
          <div className="bg-white rounded-xl p-1.5 shadow-sm border border-rhozly-outline/10">
            <img
              src="/images/logo_small_rhozly.png"
              alt="Rhozly"
              data-testid="quick-access-hero-logo"
              className="h-7 w-auto block"
            />
          </div>
          <span className="font-display font-black text-rhozly-primary text-lg tracking-tight">
            Rhozly
          </span>
        </div>

        {/* Eyebrow pill */}
        <div className="relative inline-flex items-center gap-1.5 bg-white/70 backdrop-blur-sm text-rhozly-primary px-3 py-1 rounded-full mb-3 border border-rhozly-primary/15">
          <Sparkles size={11} strokeWidth={2.5} />
          <span className="text-[11px] font-black uppercase tracking-widest">
            Quick Access
          </span>
        </div>

        {/* Heading — personalised + brand-coloured name accent */}
        <h1
          data-testid="quick-access-hero-greeting"
          className="relative font-display font-black text-2xl sm:text-3xl text-rhozly-on-surface tracking-tight leading-tight"
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
        <p className="relative text-sm text-rhozly-on-surface/65 mt-2 leading-relaxed max-w-md">
          {trimmedName
            ? "Pick a quick action to get started — the essentials for when you're out in the garden."
            : "The essentials for when you're out in the garden."}
        </p>
      </header>

      {/* Tiles — each gets its own colour accent */}
      <div className="flex flex-col gap-3 mb-7">
        <QuickTile
          testId="quick-tile-lens"
          accent="primary"
          icon={<Camera size={26} strokeWidth={2} />}
          title="Visual Lens"
          description="Take a photo — get identification, health check, pruning, propagation, and ready-to-add tasks in one tap."
          onClick={() => navigate("/quick/lens")}
        />
        <QuickTile
          testId="quick-tile-calendar"
          accent="tertiary"
          icon={<CalendarDays size={26} strokeWidth={2} />}
          title="Today"
          description="Your tasks, the rain forecast, and a frost-aware planting helper — all on one screen."
          onClick={handleTodayTap}
        />
        <QuickTile
          testId="quick-tile-journal"
          accent="container"
          icon={<NotebookPen size={26} strokeWidth={2} />}
          title="Quick Capture"
          description="Snap a photo and jot a note — file it to a plant later, from either device."
          onClick={() => navigate("/quick/journal")}
        />
        <QuickTile
          testId="quick-tile-library"
          accent="primary"
          icon={<BookOpen size={26} strokeWidth={2} />}
          title="The Library"
          description="Look up any plant by name — see its care guide, grow guide, companions, and light, then save the ones you want."
          onClick={() => navigate("/library/search")}
        />
      </div>

      {/* Power-user escape hatch — deliberate pill, not a hidden link */}
      <div className="flex justify-center">
        <button
          type="button"
          data-testid="quick-access-open-dashboard"
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full bg-white border border-rhozly-outline/15 text-sm font-bold text-rhozly-on-surface/65 hover:text-rhozly-primary hover:border-rhozly-primary/30 hover:shadow-sm transition-all"
        >
          Open full dashboard
          <ArrowRight size={14} />
        </button>
      </div>
    </main>
    </div>
  );
}
