import React from "react";
import { useNavigate } from "react-router-dom";
import { Settings2, Footprints, ChevronRight } from "lucide-react";
import QuickTile from "../quick/QuickTile";
import {
  resolvePins,
  defaultQuickLauncherPins,
  type QuickLauncherAvailabilityCtx,
} from "../../lib/quickLauncherCatalogue";
import { hasStoredPins } from "../../lib/quickLauncherPrefs";
import { useQuickLauncherPins } from "../../hooks/useQuickLauncherPins";

/**
 * Quick-actions row on the Home dashboard (new-home-dashboard plan §3.4).
 * Reuses the /quick launcher catalogue + saved pins so customisation
 * carries across surfaces; when the user has never customised, the
 * defaults are persona-aware (learning set for new gardeners, operating
 * set for experienced). "Customise" goes to the existing picker in
 * Gardener Profile.
 */

interface Props {
  userId: string | null;
  homeId: string | null;
  persona: "new" | "experienced" | null;
  availabilityCtx: QuickLauncherAvailabilityCtx;
  /** When >= 5, the Garden Walk renders as the featured full-width first
   *  tile (redesign Stage 2 — the standalone walk banner folded in here;
   *  keeps testid dash-garden-walk + the state.from contract). */
  walkPlantCount?: number;
}

export default function QuickActionsRow({ userId, homeId, persona, availabilityCtx, walkPlantCount = 0 }: Props) {
  const navigate = useNavigate();
  const { pins } = useQuickLauncherPins(userId);

  // A saved preference always wins; persona defaults only apply to users
  // who never customised (the prefs layer returns the classic defaults for
  // both cases, so "customised" is detected via the raw storage key).
  const effectivePins = hasStoredPins() ? pins : defaultQuickLauncherPins(persona);
  const tiles = resolvePins(effectivePins, availabilityCtx).slice(0, 6);

  const showWalk = walkPlantCount >= 5;
  if (tiles.length === 0 && !showWalk) return null;

  return (
    <section data-testid="home-quick-actions">
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
          Quick actions
        </h2>
        <button
          data-testid="home-quick-actions-customise"
          onClick={() => navigate("/gardener?section=quick-launcher")}
          className="flex items-center gap-1 text-[11px] font-bold text-rhozly-on-surface/45 can-hover:hover:text-rhozly-primary transition"
        >
          <Settings2 size={12} />
          Customise
        </button>
      </div>
      {showWalk && (
        <button
          data-testid="dash-garden-walk"
          onClick={() => navigate("/walk", { state: { from: "/dashboard" } })}
          className="w-full mb-2 bg-brand-gradient-soft text-white rounded-card p-4 flex items-center gap-4 shadow-raised transition-transform duration-200 ease-spring active:scale-[0.98] active:duration-100 touch-manipulation text-left"
        >
          <span className="bg-white/15 p-3 rounded-2xl shrink-0">
            <Footprints size={22} aria-hidden />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-black text-sm font-display">Start a Garden Walk</span>
            <span className="block text-xs text-white/80 mt-0.5">
              A guided check-in on your {walkPlantCount} plants — snap, note, or tick as you go.
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-white/70" aria-hidden />
        </button>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {tiles.map((dest) => {
          const Icon = dest.icon;
          return (
            <QuickTile
              key={dest.id}
              testId={`home-quick-tile-${dest.id}`}
              accent={dest.accent}
              layout="compact"
              icon={<Icon strokeWidth={2.25} />}
              title={dest.label}
              description={dest.description}
              onClick={() => {
                dest.onTap?.({ homeId });
                // RHO-20: launching the Garden Walk from Home must return to
                // /dashboard on finish (not the /quick fallback) so the status
                // strip re-fetches and the "done today" count reflects the
                // tasks just completed in the walk.
                navigate(
                  dest.route,
                  dest.route.startsWith("/walk") ? { state: { from: "/dashboard" } } : undefined,
                );
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
