import { useNavigate } from "react-router-dom";
import { Footprints, ChevronRight } from "lucide-react";

/**
 * Garden Walk launcher tile on the Home dashboard.
 *
 * The customisable quick-actions launcher grid was removed from the home
 * (dashboard-nav-tasks-tray redesign Stage 1, 2026-07-21): every tile but one
 * duplicated a nav-bar destination, and the grid sat near the bottom of the
 * page. The pin catalogue + the /gardener?section=quick-launcher picker stay
 * in the codebase but no longer render here. What remains is the single
 * genuinely non-nav destination — the guided Garden Walk (keeps the
 * dash-garden-walk testid + the state.from contract so it returns to
 * /dashboard on finish). Renders only once the garden has >= 5 plants.
 */

interface Props {
  /** Garden Walk shows once the home has >= 5 plants. */
  walkPlantCount?: number;
}

export default function QuickActionsRow({ walkPlantCount = 0 }: Props) {
  const navigate = useNavigate();
  if (walkPlantCount < 5) return null;

  return (
    <button
      data-testid="dash-garden-walk"
      onClick={() => navigate("/walk", { state: { from: "/dashboard" } })}
      className="w-full bg-brand-gradient-soft text-white rounded-card p-4 flex items-center gap-4 shadow-raised transition-transform duration-200 ease-spring active:scale-[0.98] active:duration-100 touch-manipulation text-left"
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
  );
}
