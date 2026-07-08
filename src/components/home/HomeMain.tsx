import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, MapPin, Leaf, LayoutList, Rows3 } from "lucide-react";
import HomeStatusStrip from "./HomeStatusStrip";
import GardenOverviewGrid from "./GardenOverviewGrid";
import QuickActionsRow from "./QuickActionsRow";
import AttentionRow from "./AttentionRow";
import WeekPulse from "./WeekPulse";
import TaskList from "../TaskList";
import SeasonalPicksCard from "../seasonal/SeasonalPicksCard";
import { usePersona } from "../../hooks/usePersona";
import { useHomeOverview, type OverviewArea } from "../../hooks/useHomeOverview";
import { useHomeDashboardStats } from "../../hooks/useHomeDashboardStats";
import { buildTodaySummary } from "../../lib/todaySummary";
import type { OverviewLocation } from "./LocationOverviewCard";
import type { QuickLauncherAvailabilityCtx } from "../../lib/quickLauncherCatalogue";

/**
 * The new main dashboard ("Dashboard" tab, ?view=home) — see
 * docs/plans/new-home-dashboard.md. One shared spine rendered in two
 * densities: "simple" (default for new gardeners — guidance-first) and
 * "detailed" (default for persona === "experienced" — telemetry-first).
 * The previous dashboard lives on unchanged as the sibling "Overview" tab.
 *
 * Phase 1: status strip, garden overview grid (plants + tasks), quick
 * actions, today's tasks, seasonal picks. Phase 2 adds the home-overview
 * endpoint (sensor / valve / sun chips + attention row).
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
  // Soft-fails: the hook returns null stats on error and the strip still
  // renders pending.
  const { stats: dashStats } = useHomeDashboardStats(homeId);
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

  return (
    <div data-testid="home-main" className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <HomeStatusStrip
          firstName={firstName}
          weather={weather}
          rawWeather={rawWeather}
          todaySummary={todaySummary}
          overdueCount={overdueTaskCount}
        />
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
      </div>

      <AttentionRow items={overview?.attention ?? []} />

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

      <QuickActionsRow
        userId={userId}
        homeId={homeId}
        persona={persona}
        availabilityCtx={availabilityCtx}
      />

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
            See all →
          </button>
        </div>
        <TaskList homeId={homeId} compact targetDate={new Date()} />
      </section>

      {density === "detailed" && <WeekPulse homeId={homeId} />}

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
