import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, RefreshCw, AlertCircle, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import {
  fetchSeasonalPicks,
  type SeasonalPicksResponse,
} from "../../services/seasonalPicksService";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import SeasonalPickTile from "./SeasonalPickTile";
import PlantDetailModal from "../PlantDetailModal";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";

interface Props {
  homeId: string;
  /** Threaded through to the in-card `PlantDetailModal` so the Grow Guide /
   *  Companions / Light tabs gate correctly when a pick is opened. */
  aiEnabled: boolean;
  isPremium: boolean;
  /**
   * `today`     — Today screen. Horizontal scroll showing 1.x tiles at a time.
   * `dashboard` — Full-width desktop card. Responsive grid.
   * `carousel`  — One-tile-at-a-time pager with prev/next chevrons + dots.
   *               Used on `/quick` where vertical space is tight.
   */
  variant?: "today" | "dashboard" | "carousel";
  /** Optional: hide the manual refresh control (useful in read-only embeds). */
  hideRefresh?: boolean;
}

/**
 * "What can I grow right now?" — a personalised, hemisphere-aware,
 * frost-calibrated list of 4-6 picks the user can sow, plant, or
 * propagate this week. Backed by the `seasonal_picks` action on the
 * plant-doctor edge fn; gracefully degrades to a deterministic
 * fallback for non-AI tiers and AI failures.
 */
export default function SeasonalPicksCard({
  homeId,
  aiEnabled,
  isPremium,
  variant = "dashboard",
  hideRefresh = false,
}: Props) {
  const [payload, setPayload] = useState<SeasonalPicksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Detail overlay for a tapped pick — same Care/Grow Guide/Companions/Light
  // modal we use from plant search results everywhere else.
  const [detailResult, setDetailResult] = useState<ProviderSearchResult | null>(null);
  // Collapse state — persisted per variant so the user's preference on the
  // dashboard doesn't override their preference on Today / the carousel.
  // Read lazily in an effect to keep the render path SSR-safe + robust against
  // test environments that swap out window.localStorage.
  const collapseKey = `rhozly_seasonal_picks_collapsed:${variant}`;
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem(collapseKey) === "1") {
        setCollapsed(true);
      }
    } catch { /* test env / private mode — fall back to expanded */ }
  }, [collapseKey]);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(collapseKey, next ? "1" : "0"); } catch { /* private mode */ }
      return next;
    });
  }, [collapseKey]);
  // One-shot logEvent guard so two mounts of the card (Today + Dashboard
  // visible together on a tablet) don't double-fire the analytics event.
  const loggedRef = useRef(false);
  // Carousel state — only used when variant === "carousel". The scroll
  // container drives the active index via a scroll listener so that
  // arrows AND native swipe both move the dot indicator in sync.
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const load = useCallback(
    async (opts: { forceRegen?: boolean } = {}) => {
      const wantsRefresh = !!opts.forceRegen;
      if (wantsRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      try {
        const res = await fetchSeasonalPicks(homeId, { forceRegen: opts.forceRegen });
        setPayload(res);
        if (!loggedRef.current) {
          loggedRef.current = true;
          logEvent(EVENT.SEASONAL_PICKS_LOADED, {
            source: res.source,
            count: res.picks.length,
            week_iso: res.week_iso,
            from_cache: res.from_cache,
          });
        }
        if (wantsRefresh) {
          logEvent(EVENT.SEASONAL_PICKS_REFRESHED, {
            source: res.source,
            count: res.picks.length,
          });
        }
      } catch (err: any) {
        Logger.error("SeasonalPicksCard load failed", err, { homeId });
        setError("Couldn't load this week's picks. Tap retry to try again.");
      } finally {
        if (wantsRefresh) setRefreshing(false); else setLoading(false);
      }
    },
    [homeId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading && !payload) {
    return (
      <section
        data-testid="seasonal-picks-loading"
        className="rounded-3xl bg-white border border-rhozly-outline/15 shadow-sm p-4 sm:p-5"
      >
        <Header variant={variant} />
        <div className="flex items-center gap-2 text-xs text-rhozly-on-surface/55 mt-3">
          <Loader2 size={14} className="animate-spin" />
          Finding picks for this week…
        </div>
      </section>
    );
  }

  if (error && !payload) {
    return (
      <section
        data-testid="seasonal-picks-error"
        className="rounded-3xl bg-white border border-rhozly-outline/15 shadow-sm p-4 sm:p-5"
      >
        <Header variant={variant} />
        <div className="flex items-start gap-2 mt-3 text-xs">
          <AlertCircle size={14} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-rhozly-on-surface/80 leading-snug">{error}</p>
            <button
              type="button"
              data-testid="seasonal-picks-retry"
              onClick={() => load()}
              className="mt-2 inline-flex items-center gap-1 text-rhozly-primary text-[10px] font-black uppercase tracking-widest hover:opacity-80"
            >
              <RefreshCw size={11} />
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!payload || payload.picks.length === 0) return null;

  const sourceLabel =
    payload.source === "ai"
      ? "Personalised for your garden"
      : "A few ideas for this week";

  const isCarousel = variant === "carousel";
  const total = payload.picks.length;

  const goToIndex = (next: number) => {
    if (!carouselRef.current) return;
    const clamped = Math.max(0, Math.min(total - 1, next));
    const width = carouselRef.current.clientWidth;
    carouselRef.current.scrollTo({ left: clamped * width, behavior: "smooth" });
  };

  return (
    <section
      data-testid="seasonal-picks-card"
      className={`rounded-3xl bg-white border border-rhozly-outline/15 shadow-sm ${
        isCarousel ? "p-3" : "p-4 sm:p-5"
      }`}
    >
      <div className={`flex items-start justify-between gap-2 ${isCarousel ? "mb-2" : "mb-3"}`}>
        <div className="flex-1 min-w-0">
          <Header variant={variant} />
          {!isCarousel && (
            <p className="text-[11px] text-rhozly-on-surface/55 mt-0.5 leading-snug">
              {sourceLabel} · {total} picks
            </p>
          )}
        </div>
        {isCarousel && total > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              data-testid="seasonal-picks-prev"
              onClick={() => goToIndex(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="Previous pick"
              className="w-8 h-8 rounded-xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/60 hover:text-rhozly-primary hover:border-rhozly-primary/30 transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              data-testid="seasonal-picks-next"
              onClick={() => goToIndex(activeIndex + 1)}
              disabled={activeIndex >= total - 1}
              aria-label="Next pick"
              className="w-8 h-8 rounded-xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/60 hover:text-rhozly-primary hover:border-rhozly-primary/30 transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        {!hideRefresh && !isCarousel && (
          <button
            type="button"
            data-testid="seasonal-picks-refresh"
            onClick={() => load({ forceRegen: true })}
            disabled={refreshing}
            title="Refresh picks for this week"
            className="shrink-0 w-9 h-9 rounded-xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/60 hover:text-rhozly-primary hover:border-rhozly-primary/30 transition flex items-center justify-center disabled:opacity-40"
          >
            {refreshing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </button>
        )}
        <button
          type="button"
          data-testid="seasonal-picks-collapse"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand seasonal picks" : "Collapse seasonal picks"}
          className={`shrink-0 ${isCarousel ? "w-8 h-8" : "w-9 h-9"} rounded-xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/60 hover:text-rhozly-primary hover:border-rhozly-primary/30 transition flex items-center justify-center`}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Tiles — three layouts: today (horizontal scroll, 1.x visible),
          dashboard (responsive grid), carousel (one-at-a-time pager). */}
      {!collapsed && variant === "today" && (
        <div
          data-testid="seasonal-picks-list"
          className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory"
        >
          {payload.picks.map((pick, i) => (
            <div key={`${pick.scientific_name}-${i}`} className="snap-start">
              <SeasonalPickTile pick={pick} index={i} onOpen={setDetailResult} />
            </div>
          ))}
        </div>
      )}
      {!collapsed && variant === "dashboard" && (
        <div
          data-testid="seasonal-picks-list"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {payload.picks.map((pick, i) => (
            <SeasonalPickTile key={`${pick.scientific_name}-${i}`} pick={pick} index={i} onOpen={setDetailResult} />
          ))}
        </div>
      )}
      {!collapsed && isCarousel && (
        <>
          <div
            ref={carouselRef}
            data-testid="seasonal-picks-list"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.clientWidth === 0) return;
              const idx = Math.round(el.scrollLeft / el.clientWidth);
              if (idx !== activeIndex) setActiveIndex(idx);
            }}
            className="flex overflow-x-auto snap-x snap-mandatory -mx-3 px-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {payload.picks.map((pick, i) => (
              <div
                key={`${pick.scientific_name}-${i}`}
                className="snap-start shrink-0 w-full pr-2 last:pr-0 [&>button]:!w-full"
              >
                <SeasonalPickTile pick={pick} index={i} onOpen={setDetailResult} />
              </div>
            ))}
          </div>
          {total > 1 && (
            <div
              data-testid="seasonal-picks-dots"
              className="flex items-center justify-center gap-1.5 mt-2"
            >
              {payload.picks.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goToIndex(i)}
                  aria-label={`Go to pick ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeIndex
                      ? "w-4 bg-rhozly-primary"
                      : "w-1.5 bg-rhozly-on-surface/20 hover:bg-rhozly-on-surface/35"
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}
      {detailResult && (
        <PlantDetailModal
          result={detailResult}
          homeId={homeId}
          aiEnabled={aiEnabled}
          isPremium={isPremium}
          onClose={() => setDetailResult(null)}
        />
      )}
    </section>
  );
}

function Header({ variant }: { variant: "today" | "dashboard" | "carousel" }) {
  const isCarousel = variant === "carousel";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`inline-flex items-center justify-center rounded-lg bg-rhozly-primary/10 text-rhozly-primary ${
          isCarousel ? "w-6 h-6" : "w-7 h-7"
        }`}
      >
        <Sparkles size={isCarousel ? 12 : 14} />
      </span>
      <h2
        className={`font-display font-black text-rhozly-on-surface leading-tight flex-1 min-w-0 ${
          isCarousel ? "text-xs truncate" : "text-sm sm:text-base"
        }`}
      >
        {isCarousel
          ? "Grow this week"
          : variant === "today"
            ? "This week's sowing picks"
            : "Sow & grow this week"}
      </h2>
      {!isCarousel && (
        <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rhozly-surface-low text-rhozly-on-surface/55 text-[9px] font-black uppercase tracking-widest shrink-0">
          <Calendar size={10} />
          This week
        </span>
      )}
    </div>
  );
}
