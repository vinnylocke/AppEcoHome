import React from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CalendarDays, NotebookPen, ArrowRight, Info } from "lucide-react";
import { toast } from "react-hot-toast";

import QuickTile from "./quick/QuickTile";
import { useIsMobile } from "../hooks/useIsMobile";

/**
 * Mobile home screen — surfaces the in-the-garden essentials in three big
 * tap targets. Mounted at `/quick`. Desktop visitors can preview it (a small
 * banner explains it's the mobile shortcut), but their `/` redirect still
 * lands them on `/dashboard`.
 */
export default function QuickAccessHome() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <main
      data-testid="quick-access-home"
      className="min-h-full w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col"
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

      {/* Hero */}
      <header className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-2">
          Quick Access
        </p>
        <h1 className="font-display font-black text-2xl sm:text-3xl text-rhozly-on-surface tracking-tight">
          What can I help with?
        </h1>
        <p className="text-sm text-rhozly-on-surface/55 mt-1.5 leading-relaxed">
          The essentials for when you're out in the garden.
        </p>
      </header>

      {/* Tiles */}
      <div className="flex flex-col gap-3 mb-6">
        <QuickTile
          testId="quick-tile-lens"
          icon={<Camera size={26} />}
          title="Visual Lens"
          description="Take a photo — get identification, health check, pruning, propagation, and ready-to-add tasks in one tap."
          onClick={() => navigate("/quick/lens")}
        />
        <QuickTile
          testId="quick-tile-calendar"
          icon={<CalendarDays size={26} />}
          title="Today"
          description="Your tasks, the rain forecast, and a frost-aware planting helper — all on one screen."
          onClick={() => navigate("/quick/calendar")}
        />
        <QuickTile
          testId="quick-tile-journal"
          icon={<NotebookPen size={26} />}
          title="Quick Capture"
          description="Snap a photo and jot a note — file it to a plant later from your desktop."
          variant="coming-soon"
          onClick={() =>
            toast("Coming soon — for now, open a plant's Journal tab.", {
              icon: "📝",
            })
          }
        />
      </div>

      {/* Power-user escape hatch */}
      <button
        type="button"
        data-testid="quick-access-open-dashboard"
        onClick={() => navigate("/dashboard")}
        className="mt-auto self-center inline-flex items-center gap-2 px-5 py-3 min-h-[44px] text-sm font-bold text-rhozly-on-surface/60 hover:text-rhozly-primary transition"
      >
        Open full dashboard
        <ArrowRight size={16} />
      </button>
    </main>
  );
}
