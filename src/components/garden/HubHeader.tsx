// HubHeader — the shared per-tab header for the /shed hub (garden-hub
// search-first overhaul Stage 3, 2026-07-21). One primitive replaces every
// tab's hand-rolled title/subtitle/CTA/toggle stack (the Plants tab carried
// 26 interactive controls above its search bar; Watchlist 8 chrome blocks):
//
//   ┌ Title row (scrolls away) ──────────────────────────────┐
//   │ Title · muted count                              [⋯]   │
//   │ (new/null persona only: one muted guidance line)       │
//   ├ Search row (sticky, opaque — NO blur; the hub tab      │
//   │ strip owns the screen's single blur) ──────────────────┤
//   │ [🔍 launcher — a BUTTON styled as a field]  [filters]  │
//   └────────────────────────────────────────────────────────┘
//
// The launcher is a button, not an input (M3: on compact windows search
// always opens a full-screen search view — our z-[60] takeovers). It carries
// the tab's load-bearing testid + Shepherd anchor (shed-add-plant-btn /
// watchlist-add-btn). The chip row is the tab's own markup, rendered below.

import React, { useEffect, useRef, useState } from "react";
import { Search, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { usePersona } from "../../hooks/usePersona";

export interface HubHeaderMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  testId?: string;
  onSelect: () => void;
}

interface Props {
  title: string;
  count?: number;
  /** One warm guidance line — shown only to new/null personas. */
  guidance?: string;
  /** ⋯ overflow items (the old secondary buttons live here). */
  menuItems?: HubHeaderMenuItem[];
  menuTestId?: string;
  /** The search launcher. */
  searchPlaceholder: string;
  searchTestId: string;
  searchAriaLabel: string;
  onSearchTap: () => void;
  /** Filters affordance beside the launcher (omit to hide). */
  filterCount?: number;
  filtersTestId?: string;
  onFiltersTap?: () => void;
  /** Extra element pinned INSIDE the sticky row, after the filters button. */
  stickyTrailing?: React.ReactNode;
  /** Full-bleed sticky row: ONLY when the host wraps this header in matching
   *  `p-4 md:p-8` (the negative margin must cancel real padding — on an
   *  unpadded host it would overflow the scroller; review catch). */
  bleed?: boolean;
}

export default function HubHeader({
  title,
  count,
  guidance,
  menuItems,
  menuTestId,
  searchPlaceholder,
  searchTestId,
  searchAriaLabel,
  onSearchTap,
  filterCount,
  filtersTestId,
  onFiltersTap,
  stickyTrailing,
  bleed = false,
}: Props) {
  const persona = usePersona();
  const isNewGardener = persona !== "experienced";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div>
      {/* Title row — scrolls away with the page. */}
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <div className="min-w-0">
          <h1 className="text-xl font-black font-display tracking-tight text-rhozly-on-surface truncate">
            {title}
            {typeof count === "number" && count > 0 && (
              <span className="ml-2 text-sm font-bold text-rhozly-on-surface/40">{count}</span>
            )}
          </h1>
          {guidance && isNewGardener && (
            <p className="text-sm text-rhozly-on-surface/50 leading-snug mt-0.5">{guidance}</p>
          )}
        </div>
        {menuItems && menuItems.length > 0 && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              data-testid={menuTestId}
              aria-label={`More ${title.toLowerCase()} actions`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="w-11 h-11 flex items-center justify-center rounded-control text-rhozly-on-surface/60 can-hover:hover:bg-rhozly-surface-low can-hover:hover:text-rhozly-on-surface active:scale-[0.94] transition"
            >
              <MoreHorizontal size={20} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 z-30 min-w-[220px] bg-rhozly-surface-lowest border border-rhozly-outline/15 rounded-card shadow-overlay py-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
              >
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    role="menuitem"
                    data-testid={item.testId}
                    onClick={() => {
                      setMenuOpen(false);
                      item.onSelect();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 min-h-[44px] text-left text-sm font-bold text-rhozly-on-surface/80 can-hover:hover:bg-rhozly-surface-low can-hover:hover:text-rhozly-on-surface transition-colors"
                  >
                    {item.icon && <span className="text-rhozly-on-surface/50">{item.icon}</span>}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search row — sticky under the hub tab strip, opaque (no blur). With
          `bleed`, the negative margin + matching padding makes the background
          span edge-to-edge so cards scroll cleanly behind it. */}
      <div className={`sticky top-0 z-10 bg-rhozly-bg py-2 mt-1 ${bleed ? "-mx-4 px-4 md:-mx-8 md:px-8" : ""}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid={searchTestId}
            aria-label={searchAriaLabel}
            onClick={onSearchTap}
            className="flex-1 min-w-0 flex items-center gap-3 h-[52px] px-4 rounded-control bg-white border border-rhozly-outline/20 shadow-card text-left can-hover:hover:border-rhozly-primary/40 active:scale-[0.995] transition"
          >
            <Search size={17} className="shrink-0 text-rhozly-on-surface/40" />
            <span className="text-base font-bold text-rhozly-on-surface/40 truncate">{searchPlaceholder}</span>
          </button>
          {onFiltersTap && (
            <button
              type="button"
              data-testid={filtersTestId}
              aria-label="Filters"
              onClick={onFiltersTap}
              className={`relative shrink-0 w-11 h-11 flex items-center justify-center rounded-control border transition-colors ${(filterCount ?? 0) > 0 ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 can-hover:hover:border-rhozly-primary/40 can-hover:hover:text-rhozly-primary"}`}
            >
              <SlidersHorizontal size={18} />
              {(filterCount ?? 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-status-danger-ink text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-rhozly-bg">
                  {filterCount}
                </span>
              )}
            </button>
          )}
          {stickyTrailing}
        </div>
      </div>
    </div>
  );
}
