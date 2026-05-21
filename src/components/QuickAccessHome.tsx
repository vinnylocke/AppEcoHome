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
} from "lucide-react";

import QuickTile from "./quick/QuickTile";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  /** Optional first-name for the personalised greeting. Falls back to a
   *  generic copy when null. */
  firstName?: string | null;
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
 * Wave 7 redesign: vertically-centred layout, personalised time-aware
 * greeting, decorative leaf motif, per-tile colour accents drawing on the
 * full Rhozly palette (primary green / tertiary peach / container green).
 */
export default function QuickAccessHome({ firstName }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const greeting = getTimeGreeting();
  const trimmedName = firstName?.trim() || null;

  return (
    <main
      data-testid="quick-access-home"
      className="min-h-full w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col justify-center"
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

      {/* Hero — personalised greeting + decorative motif */}
      <header className="relative mb-7 mt-2">
        {/* Soft radial gradients — peach + green theme tokens */}
        <div
          aria-hidden
          data-testid="quick-access-hero-glow"
          className="absolute -inset-x-6 -top-8 h-44 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 22% 35%, rgba(7,87,55,0.08), transparent 55%), radial-gradient(circle at 88% 60%, rgba(255,218,216,0.55), transparent 55%)",
          }}
        />

        {/* Decorative sprout — sits behind text, faded */}
        <Sprout
          aria-hidden
          data-testid="quick-access-hero-sprout"
          size={88}
          className="absolute -top-2 right-0 text-rhozly-primary-container/15 -rotate-12 pointer-events-none"
          strokeWidth={1.4}
        />

        {/* Eyebrow pill */}
        <div className="relative inline-flex items-center gap-1.5 bg-rhozly-primary/10 text-rhozly-primary px-3 py-1 rounded-full mb-3">
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
        <p className="relative text-sm text-rhozly-on-surface/55 mt-2 leading-relaxed max-w-md">
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
          onClick={() => navigate("/quick/calendar")}
        />
        <QuickTile
          testId="quick-tile-journal"
          accent="container"
          icon={<NotebookPen size={26} strokeWidth={2} />}
          title="Quick Capture"
          description="Snap a photo and jot a note — file it to a plant later, from either device."
          onClick={() => navigate("/quick/journal")}
        />
      </div>

      {/* Power-user escape hatch — now a deliberate pill, not a hidden link */}
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
  );
}
