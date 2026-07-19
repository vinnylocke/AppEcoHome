import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, MapPin, Leaf, LayoutList, Rows3, Footprints, ChevronRight } from "lucide-react";
import HomeStatusStrip from "./HomeStatusStrip";
import GardenOverviewGrid from "./GardenOverviewGrid";
import QuickActionsRow from "./QuickActionsRow";
import AttentionRow from "./AttentionRow";
import AdaptiveCareCard from "./AdaptiveCareCard";
import GardenBrainBriefCard from "./GardenBrainBriefCard";
import GardenSnapshot from "./GardenSnapshot";
import DailyBriefCard from "../DailyBriefCard";
import HeadGardenerCard from "../manager/HeadGardenerCard";
import AssistantCard from "../AssistantCard";
import WeekAheadPreview from "../shared/WeekAheadPreview";
import FeatureGate from "../shared/FeatureGate";
import TaskList from "../TaskList";
import SeasonalPicksCard from "../seasonal/SeasonalPicksCard";
import { usePersona } from "../../hooks/usePersona";
import { useHomeOverview, type OverviewArea } from "../../hooks/useHomeOverview";
import { useHomeDashboardStats } from "../../hooks/useHomeDashboardStats";
import { buildTodaySummary } from "../../lib/todaySummary";
import type { OverviewLocation } from "./LocationOverviewCard";
import type { QuickLauncherAvailabilityCtx } from "../../lib/quickLauncherCatalogue";

/**
 * THE dashboard (?view=home — the old sibling "Overview" tab was merged in
 * here, design overhaul Phase 4.2). One shared spine rendered in two
 * densities:
 *
 * - "simple" (default for new gardeners — guidance-first): compact status
 *   strip hero, garden grid, quick actions, compact today's tasks, seasonal
 *   picks.
 * - "detailed" (default for persona === "experienced" — the old Overview
 *   audience): Daily Brief hero, Head Gardener + AI Insights cards, the full
 *   task list, Week Ahead, and the collapsible Garden Snapshot stat wall.
 *
 * The single useHomeDashboardStats mount here feeds BOTH the status summary
 * and GardenSnapshot — don't add second consumers (the edge fn is uncached).
 */

const DENSITY_KEY = "rhozly:home:density";

interface Props {
  homeId: string;
  userId: string | null;
  firstName: string | null;
  weather: any;
  rawWeather: any;
  locations: OverviewLocation[];
  locationTaskCounts: Record<string, number>;
  overdueTaskCount: number;
  alerts: any[];
  homeLat: number | null;
  homeLng: number | null;
  hardinessZone: number | null;
  aiEnabled: boolean;
  isPremium: boolean;
  availabilityCtx: QuickLauncherAvailabilityCtx;
}

export default function HomeMain({
  homeId,
  userId,
  firstName,
  weather,
  rawWeather,
  locations,
  locationTaskCounts,
  overdueTaskCount,
  alerts,
  homeLat,
  homeLng,
  hardinessZone,
  aiEnabled,
  isPremium,
  availabilityCtx,
}: Props) {
  const navigate = useNavigate();
  const persona = usePersona();

  // Density: stored preference wins; otherwise follow the persona once it
  // resolves. Persist ONLY on user toggle (the snapshot-preference lesson —
  // persisting a first-render default freezes it before persona loads).
  const [storedDensity] = useState<string | null>(() => {
    try { return localStorage.getItem(DENSITY_KEY); } catch { return null; }
  });
  const [densityOverride, setDensityOverride] = useState<"simple" | "detailed" | null>(
    storedDensity === "simple" || storedDensity === "detailed" ? storedDensity : null,
  );
  const density: "simple" | "detailed" =
    densityOverride ?? (persona === "experienced" ? "detailed" : "simple");
  const setDensity = (next: "simple" | "detailed") => {
    setDensityOverride(next);
    try { localStorage.setItem(DENSITY_KEY, next); } catch { /* ignore */ }
  };

  const todayTaskCount = Object.values(locationTaskCounts).reduce((a, b) => a + b, 0);
  const hasGarden = locations.length > 0;

  // RHO-20 — the "X of Y done today" breakdown. `todayTaskCount` (ghost-aware,
  // remaining) supplies PENDING; the server's completion-aware `tasks.doneToday`
  // supplies DONE (tasks cleared today, incl. overdue/harvest — NOT the
  // due-date day-strip bucket, which missed overdue-completed-today). The day
  // bucket is still used for the SKIPPED / POSTPONED passthrough. Mounted in
  // BOTH densities so the breakdown shows for simple-mode (Sprout) users too.
  // This single hook instance also feeds GardenSnapshot in detailed density.
  // Soft-fails: the hook returns null stats on error and the strip still
  // renders pending.
  const {
    stats: dashStats,
    loading: dashLoading,
    error: dashError,
    refresh: dashRefresh,
    weekStart,
    weekEnd,
  } = useHomeDashboardStats(homeId);
  const todayBucket = dashStats?.dayStrip?.find((d) => d.isToday) ?? null;
  const todaySummary = buildTodaySummary(todayTaskCount, dashStats?.tasks.doneToday, todayBucket);

  // Phase 2 telemetry: sensor / valve / per-area task chips + attention
  // row. Soft-fails to the client-side grid when the endpoint is
  // unavailable — the page never blocks on it.
  const { overview } = useHomeOverview(homeId);
  const telemetryByArea = React.useMemo(() => {
    const map = new Map<string, OverviewArea>();
    for (const loc of overview?.locations ?? []) {
      for (const area of loc.areas) map.set(area.id, area);
    }
    return map;
  }, [overview]);

  const totalPlants = dashStats?.garden.totalPlants ?? 0;

  const densityToggle = (
    <div
      data-testid="home-density-toggle"
      className="bg-rhozly-primary/5 p-0.5 rounded-xl flex shrink-0"
    >
      <button
        data-testid="home-density-simple"
        onClick={() => setDensity("simple")}
        title="Simple view"
        className={`p-1.5 rounded-lg transition ${density === "simple" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-primary"}`}
      >
        <LayoutList size={14} />
      </button>
      <button
        data-testid="home-density-detailed"
        onClick={() => setDensity("detailed")}
        title="Detailed view"
        className={`p-1.5 rounded-lg transition ${density === "detailed" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-primary"}`}
      >
        <Rows3 size={14} />
      </button>
    </div>
  );

  return (
    <div data-testid="home-main" className="space-y-5">
      {/* Hero: one greeting, density-matched — the compact status strip for
          simple, the full Daily Brief card (the old Overview hero) for
          detailed. Never both: they are the same job at two depths. */}
      {density === "simple" ? (
        <div className="flex items-start justify-between gap-3">
          <HomeStatusStrip
            firstName={firstName}
            weather={weather}
            rawWeather={rawWeather}
            todaySummary={todaySummary}
            overdueCount={overdueTaskCount}
          />
          {densityToggle}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">{densityToggle}</div>
          <DailyBriefCard
            firstName={firstName}
            weather={weather}
            rawWeather={rawWeather}
            // Same array App used to pass the card directly pre-merge: the
            // rows carry lat/lng at runtime; OverviewLocation just doesn't
            // declare them.
            locations={locations as unknown as Array<{ lat?: number; lng?: number }>}
            alerts={alerts}
            todayTaskCount={todayTaskCount}
            overdueCount={overdueTaskCount}
            homeLat={homeLat}
            homeLng={homeLng}
            hardinessZone={hardinessZone}
            aiEnabled={aiEnabled}
          />
        </div>
      )}

      <AttentionRow items={overview?.attention ?? []} />

      {/* Garden Brain Phase 2 — "Your daily brief": the ranked morning voice.
          Self-hides when today's brief hasn't generated (pre-cron new homes). */}
      <GardenBrainBriefCard homeId={homeId} userId={userId} density={density} />

      {/* Garden Brain — adaptive-care proposals (Phase 1). Self-hides when the
          home has no open/verified adjustments (server writes them only for
          sensor-equipped Sage/Evergreen homes), so no client tier plumbing. */}
      <AdaptiveCareCard homeId={homeId} currentUserId={userId} />

      {/* The old Overview's AI cards — BOTH densities (product call
          2026-07-19): they self-gate (Evergreen / ai_insights), self-hide
          when empty, and show compact upsells when locked. */}
      {userId && (
        <>
          <div data-testid="dashboard-head-gardener-card">
            <HeadGardenerCard />
          </div>
          <div data-testid="dashboard-assistant-card">
            <AssistantCard userId={userId} showUpgradeWhenLocked />
          </div>
        </>
      )}

      {/* Stable wrapper: the dashboard_tour anchors here so the step works in
          both the populated-grid and empty-garden states. */}
      <div data-testid="home-garden-section">
      {hasGarden ? (
        <GardenOverviewGrid
          locations={locations}
          locationTaskCounts={locationTaskCounts}
          density={density}
          telemetryByArea={telemetryByArea}
        />
      ) : (
        <section
          data-testid="home-empty-garden"
          className="bg-white rounded-3xl shadow-sm border border-rhozly-primary/5 p-5"
        >
          <p className="font-black text-sm text-rhozly-on-surface mb-1">Let's set up your garden</p>
          <p className="text-xs text-rhozly-on-surface/60 mb-4">
            Add a location, then areas within it, and Rhozly will keep watch over every plant.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => navigate("/management?open=add-location")}
              className="flex items-center gap-2 bg-rhozly-primary/5 hover:bg-rhozly-primary/10 rounded-2xl px-3 py-3 text-xs font-bold text-rhozly-on-surface transition"
            >
              <MapPin size={16} className="text-rhozly-primary shrink-0" /> Create a location
            </button>
            <button
              onClick={() => navigate("/shed?open=add-plant")}
              className="flex items-center gap-2 bg-rhozly-primary/5 hover:bg-rhozly-primary/10 rounded-2xl px-3 py-3 text-xs font-bold text-rhozly-on-surface transition"
            >
              <Sprout size={16} className="text-rhozly-primary shrink-0" /> Add your first plant
            </button>
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 bg-rhozly-primary/5 hover:bg-rhozly-primary/10 rounded-2xl px-3 py-3 text-xs font-bold text-rhozly-on-surface transition"
            >
              <Leaf size={16} className="text-rhozly-primary shrink-0" /> Take the garden quiz
            </button>
          </div>
        </section>
      )}
      </div>

      <QuickActionsRow
        userId={userId}
        homeId={homeId}
        persona={persona}
        availabilityCtx={availabilityCtx}
      />

      {/* Garden Walk launcher (both densities — flagship flow; e2e drives it
          via dash-garden-walk from a plain /dashboard visit). */}
      {totalPlants >= 5 && (
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
              A guided check-in on your {totalPlants} plants — snap, note, or tick as you go.
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-white/70" aria-hidden />
        </button>
      )}

      {density === "simple" ? (
        <section data-testid="home-todays-tasks">
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
              Today's tasks
            </h2>
            <button
              data-testid="home-tasks-see-all"
              onClick={() => navigate("/dashboard?view=calendar")}
              className="text-[11px] font-bold text-rhozly-on-surface/45 hover:text-rhozly-primary transition"
            >
              See all
            </button>
          </div>
          <TaskList homeId={homeId} compact targetDate={new Date()} />
        </section>
      ) : (
        /* Detailed: the full task list (the old Overview TasksPanel) — the
           whole task-management surface, tabs and all. */
        <div data-testid="dashboard-task-list">
          <TaskList homeId={homeId} />
        </div>
      )}

      {/* Week Ahead — both densities (product call 2026-07-19); Evergreen-gated. */}
      <FeatureGate feature="ai_insights" fallback={null}>
        <WeekAheadPreview homeId={homeId} />
      </FeatureGate>

      {density === "detailed" && (
        <GardenSnapshot
          stats={dashStats}
          loading={dashLoading}
          error={dashError}
          refresh={dashRefresh}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
      )}

      {density === "simple" && (
        <SeasonalPicksCard
          homeId={homeId}
          aiEnabled={aiEnabled}
          isPremium={isPremium}
          variant="dashboard"
        />
      )}
    </div>
  );
}
