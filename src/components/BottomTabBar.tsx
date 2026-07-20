import React from "react";
import { cn } from "../lib/cn";
import { Z } from "./ui/zIndex";

export interface BottomTab {
  id: string;
  /** Short visible label — one word, the bar has five slots on a small phone. */
  label: string;
  icon: React.ReactElement;
  /** Destination for `variant: "nav"` slots. Omitted for action slots. */
  to?: string;
  /** Action handler for non-nav slots (the Capture FAB, the More/Shelf slot). */
  onPress?: () => void;
  /** Same semantics as the sidebar's matchPaths — exact match or prefix + "/". */
  matchPaths?: string[];
  /** Count badge (e.g. overdue tasks). 0 hides it. */
  badge?: number;
  /** Full accessible name when the visible label is a short form (e.g. "Doctor" → "Plant Doctor"). */
  ariaLabel?: string;
  /**
   * "nav" (default) — a destination tab with active-state + matchPaths.
   * "fab" — the raised centre Capture action (green circle, no active state).
   */
  variant?: "nav" | "fab";
}

interface BottomTabBarProps {
  tabs: BottomTab[];
  currentPath: string;
  onNavigate: (to: string) => void;
}

/**
 * Mobile-only thumb-reach navigation — the phone's ONE primary nav (Phase 6a
 * removed the co-rendered sidebar rail; Phase 6b reshaped this into the Deck:
 * four destinations wrapped around a raised centre Capture FAB, with a "More"
 * slot that opens the Shelf drawer for the long tail).
 *
 * Hidden from `md:` up (the sidebar owns desktop) and suppressed in focus mode.
 *
 * This is the screen's ONE allowed backdrop-blur surface (design-system
 * budget) — a 12px static blur over a 90%-opaque token background, so contrast
 * holds outdoors even over busy content. Main content already reserves the
 * zone via `pb-28` on mobile.
 */
export default function BottomTabBar({ tabs, currentPath, onNavigate }: BottomTabBarProps) {
  return (
    <nav
      aria-label="Quick navigation"
      data-testid="bottom-tab-bar"
      className="md:hidden fixed inset-x-0 bottom-0 border-t border-rhozly-outline/15 bg-rhozly-surface-lowest/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      style={{ zIndex: Z.nav }}
    >
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const name = tab.ariaLabel ?? tab.label;
          const press = () => (tab.onPress ? tab.onPress() : tab.to && onNavigate(tab.to));

          // ── Raised Capture FAB ──────────────────────────────────────────
          if (tab.variant === "fab") {
            return (
              <div key={tab.id} className="flex-1 flex flex-col items-center justify-end pb-1">
                <button
                  type="button"
                  data-testid={`bottom-tab-${tab.id}`}
                  aria-label={name}
                  onClick={press}
                  className={cn(
                    "-mt-5 grid place-items-center w-14 h-14 rounded-full",
                    "bg-rhozly-primary text-white shadow-raised ring-4 ring-rhozly-surface-lowest",
                    "transition-transform duration-100 ease-spring active:scale-95 touch-manipulation",
                  )}
                >
                  {React.cloneElement(tab.icon as React.ReactElement<{ className?: string; strokeWidth?: number }>, {
                    className: "w-7 h-7",
                    strokeWidth: 2.2,
                  })}
                </button>
                <span className="text-3xs font-semibold text-rhozly-on-surface-variant mt-0.5">
                  {tab.label}
                </span>
              </div>
            );
          }

          // ── Standard destination / action tab ───────────────────────────
          // (variant is already narrowed to non-"fab" by the early return.)
          const active = !!tab.matchPaths?.some(
            (p) => currentPath === p || currentPath.startsWith(p + "/"),
          );
          const badge = tab.badge ?? 0;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`bottom-tab-${tab.id}`}
              aria-current={active ? "page" : undefined}
              aria-label={badge > 0 ? `${name}, ${badge} overdue` : name}
              onClick={press}
              className={cn(
                "relative flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 select-none touch-manipulation",
                "transition-[color,transform] duration-150 active:scale-95 active:duration-100",
                active ? "text-rhozly-primary" : "text-rhozly-on-surface-variant",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute top-0 h-0.5 w-8 rounded-full bg-rhozly-primary transition-opacity duration-150",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="relative">
                {React.cloneElement(tab.icon as React.ReactElement<{ className?: string; strokeWidth?: number }>, {
                  className: "w-6 h-6",
                  strokeWidth: active ? 2.2 : 1.75,
                })}
                {badge > 0 && (
                  <span
                    aria-hidden
                    className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-rhozly-error text-white text-3xs font-bold flex items-center justify-center"
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className={cn("text-3xs", active ? "font-bold" : "font-semibold")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
