import React, { Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";

// Lazy-load PlantDoctor to keep the Quick Access bundle small — same import
// strategy App.tsx uses for /doctor so we share the chunk.
const PlantDoctor = lazy(() => import("./PlantDoctor"));

interface Props {
  homeId: string;
  userId?: string;
  aiEnabled: boolean;
  isPremium: boolean;
  perenualEnabled: boolean;
  onTasksAdded?: () => void;
}

/**
 * Mobile-only route for the Visual Lens (Mobile Quick Access Wave 2).
 * Mounts the existing PlantDoctor with `compact` so the user sees only
 * the photo capture + Analyse + result flow. Identify / Diagnose / Pest
 * remain available from `/doctor` for power-users.
 */
export default function QuickAccessLens({
  homeId,
  userId,
  aiEnabled,
  isPremium,
  perenualEnabled,
  onTasksAdded,
}: Props) {
  const navigate = useNavigate();

  return (
    <div
      data-testid="quick-access-lens"
      // Wave 10 — push content down so the back chrome doesn't sit under the
      // floating Wave 6 menu button. Same safe-area treatment the landing
      // page got in Wave 8.
      style={{ paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))" }}
      className="h-full w-full max-w-2xl mx-auto px-4 sm:px-6 pb-4 flex flex-col"
    >
      {/* Back-to-quick chrome */}
      <header className="flex items-center justify-between mb-3">
        <button
          type="button"
          data-testid="quick-lens-back"
          onClick={() => navigate("/quick")}
          className="inline-flex items-center gap-1 min-h-[44px] px-2 -ml-2 text-sm font-bold text-rhozly-on-surface/60 hover:text-rhozly-primary transition"
          aria-label="Back to Quick Access"
        >
          <ChevronLeft size={18} />
          Quick
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary/70">
          Visual Lens
        </span>
      </header>

      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-rhozly-on-surface/40">
              <Loader2 className="animate-spin" size={24} />
            </div>
          }
        >
          <PlantDoctor
            compact
            homeId={homeId}
            userId={userId}
            aiEnabled={aiEnabled}
            isPremium={isPremium}
            perenualEnabled={perenualEnabled}
            onTasksAdded={onTasksAdded}
          />
        </Suspense>
      </div>
    </div>
  );
}
