import React from "react";
import { useNavigate } from "react-router-dom";
import { Footprints, ArrowRight } from "lucide-react";

interface Props {
  /**
   * When false, the tile renders disabled with an "Add plants first"
   * hint. Currently driven by whether the home has any inventory_items;
   * the parent QuickAccessHome figures that out via useCachedShed.
   */
  enabled: boolean;
}

/**
 * Wide tile that sits at the bottom of the Quick Access 2×2 grid. It's
 * deliberately a different shape from the four square tiles above —
 * frames Garden Walk as "the morning ritual" rather than one of four
 * quick utilities.
 */
export default function WalkStartTile({ enabled }: Props) {
  const navigate = useNavigate();

  if (!enabled) {
    return (
      <div
        data-testid="quick-tile-walk-disabled"
        className="w-full rounded-3xl bg-rhozly-surface-low/70 border border-rhozly-outline/15 p-4 flex items-center gap-3 opacity-70"
      >
        <div className="shrink-0 w-11 h-11 rounded-xl bg-rhozly-on-surface/5 text-rhozly-on-surface/40 flex items-center justify-center">
          <Footprints size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-black text-rhozly-on-surface/55 text-sm leading-tight">
            Garden Walk
          </p>
          <p className="text-[11px] text-rhozly-on-surface/45 leading-snug">
            Add some plants to your Shed and assign them to areas to unlock the daily walk.
          </p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="quick-tile-walk"
      // RHO-7/8: preserve the origin (Quick Access) so the walk returns
      // to /quick on exit. GardenWalk defaults to /quick when no origin
      // is present, so this keeps the current mobile behaviour explicit.
      onClick={() => navigate("/walk", { state: { from: "/quick" } })}
      className="group w-full rounded-3xl bg-gradient-to-br from-rhozly-primary via-rhozly-primary to-rhozly-primary-container text-white text-left p-4 flex items-center gap-3 shadow-[0_8px_22px_-8px_rgba(7,87,55,0.55)] hover:-translate-y-0.5 active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-rhozly-primary/40 relative overflow-hidden"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-md"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent"
      />
      <div className="relative shrink-0 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
        <Footprints size={24} strokeWidth={2.25} />
      </div>
      <div className="relative flex-1 min-w-0">
        <p className="font-display font-black text-base leading-tight">
          Start a Garden Walk
        </p>
        <p className="text-[11px] leading-snug text-white/85 line-clamp-2">
          A guided tour of your plants — about 5 minutes.
        </p>
      </div>
      <ArrowRight
        size={18}
        className="relative shrink-0 text-white/70 group-hover:text-white transition"
      />
    </button>
  );
}
