import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, MapPin, Leaf, LayoutList, Rows3, ArrowRight } from "lucide-react";
import HomeStatusStrip from "./HomeStatusStrip";
import GardenOverviewGrid from "./GardenOverviewGrid";
import QuickActionsRow from "./QuickActionsRow";
import AttentionRow from "./AttentionRow";
import TheBrief from "./TheBrief";
import NextBestAction from "./NextBestAction";
import WeekAheadPreview from "../shared/WeekAheadPreview";
import FeatureGate from "../shared/FeatureGate";
import TaskList from "../TaskList";
import SeasonalPicksCard from "../seasonal/SeasonalPicksCard";
import { usePersona } from "../../hooks/usePersona";
import { useHomeOverview, type OverviewArea } from "../../hooks/useHomeOverview";
import { useHomeDashboardStats } from "../../hooks/useHomeDashboardStats";
import { buildTodaySummary } from "../../lib/todaySummary";
import {
  HOME_PRESETS,
  LEGACY_DENSITY_KEY,
  readStoredPosture,
  resolveHomePosture,
  storePosture,
  type HomePosture,
  type HomeSectionId,
} from "../../lib/personaPresets";
import { staggerStyle, STAGGER_ENTRANCE } from "../../lib/stagger";
import type { OverviewLocation } from "./LocationOverviewCard";
import type { QuickLauncherAvailabilityCtx } from "../../lib/quickLauncherCatalogue";

/**
 * THE dashboard (?view=home — the old sibling "Overview" tab was merged in
 * here, design overhaul Phase 4.2). One shared spine, TWO POSTURES (home
 * redesign Stage 4 — docs/plans/home-redesign-two-postures.md §3):
 *
 * - 🪴 "porch" (default for new/null persona — guidance-first): sentence
 *   hero, ONE Next Best Action, garden grid, gentle compact today list,
 *   quick actions, Seasonal Picks, The Brief. One centered editorial column
 *   (max-w-[1100px]) at every width. Almost no numbers.
 * - 🛠️ "workbench" (default for persona === "experienced" — the operations
 *   console): console-line hero, Attention inbox, garden grid w/ telemetry,
 *   compact tasks behind "Open board", The Brief, Week Ahead, collapsed
 *   Snapshot. Two-column studio on xl+; single stack in preset order below.
 *
 * Composition is declarative: HOME_PRESETS[posture].sectionOrder drives one
 * section loop — no forked block trees. The old Simple/Detailed density
 * toggle is now the posture override (same control, same testids, same
 * legacy localStorage key mirrored for pre-redesign users + e2e seeds).
 *
 * The single useHomeDashboardStats mount here feeds the status "X of Y done
 * today" summary and the Garden Walk gate — don't add second consumers (the
 * edge fn is uncached). It used to also feed the Garden Snapshot stat wall,
 * deleted outright in the stats+locations redesign Stage 2 (2026-07-20).
 */

/** Attention kinds the dashboard suppresses (redesign Stage 2 one-owner map):
 *  the hero + task list own overdue; the global banner owns weather alerts. */
const ATTENTION_EXCLUDE_KINDS = ["overdue_tasks", "weather_alert"];

/** Workbench xl+ studio split — which sections render in the aside rail.
 *  Order within each bucket still follows the preset's sectionOrder. */
const WORKBENCH_ASIDE_SECTIONS: ReadonlySet<HomeSectionId> = new Set([
  "brief",
  "week",
]);

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
  /** The single-slot onboarding/promo card (App owns the cascade). Rendered
   *  BELOW the hero so the greeting always leads (redesign Stage 1). */
  promoSlot?: React.ReactNode;
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
  promoSlot,
}: Props) {
  const navigate = useNavigate();
  const persona = usePersona();

  // Posture: stored override wins (explicit preset key, or the legacy density
  // key aliased — readStoredPosture handles the ladder); otherwise follow the
  // persona once it resolves. Persist ONLY on user toggle (the
  // snapshot-preference lesson — persisting a first-render default freezes it
  // before persona loads).
  const [storedPosture, setStoredPosture] = useState<HomePosture | null>(() =>
    readStoredPosture(),
  );
  const posture = resolveHomePosture(persona, storedPosture);
  const preset = HOME_PRESETS[posture];
  const setPosture = (next: HomePosture) => {
    setStoredPosture(next);
    storePosture(next);
    // Mirror the legacy density key so pre-redesign readers (and the ~8 e2e
    // specs that pre-seed/assert it) stay coherent with the posture choice.
    try {
      localStorage.setItem(LEGACY_DENSITY_KEY, next === "porch" ? "simple" : "detailed");
    } catch {
      /* private mode — ignore */
    }
  };

  // Child-prop compatibility shim: block components below still speak
  // "simple"/"detailed" — one mapping here instead of a prop rename sweep.
  const density: "simple" | "detailed" = posture === "porch" ? "simple" : "detailed";

  // One-shot entrance stagger (Stage 4): fires on mount only. Any posture
  // change remounts/moves the section wrappers (the two layouts differ), which
  // would restart the CSS animations — so the first toggle permanently retires
  // the entrance classes. Ref writes during render are idempotent here.
  const mountPostureRef = useRef(posture);
  const entranceDoneRef = useRef(false);
  if (posture !== mountPostureRef.current) entranceDoneRef.current = true;
  const entranceActive = !entranceDoneRef.current;
  useEffect(() => {
    // Belt-and-braces: after the entrance has played once, never re-apply it
    // (e.g. a toggle away and back must not replay the cascade).
    const timer = window.setTimeout(() => {
      entranceDoneRef.current = true;
    }, 800);
    return () => window.clearTimeout(timer);
  }, []);

  const todayTaskCount = Object.values(locationTaskCounts).reduce((a, b) => a + b, 0);
  const hasGarden = locations.length > 0;

  // RHO-20 — the "X of Y done today" breakdown. `todayTaskCount` (ghost-aware,
  // remaining) supplies PENDING; the server's completion-aware `tasks.doneToday`
  // supplies DONE (tasks cleared today, incl. overdue/harvest — NOT the
  // due-date day-strip bucket, which missed overdue-completed-today). The day
  // bucket is still used for the SKIPPED / POSTPONED passthrough. Mounted in
  // BOTH postures so the breakdown shows for porch (Sprout) users too.
  // Soft-fails: the hook returns null stats on error and the strip still
  // renders pending.
  // Kept for the today summary + the walk gate even though the Garden Snapshot
  // stat wall (the hook's other consumer) was deleted in Stage 2 — todaySummary
  // still needs tasks.doneToday + the day bucket, and the walk tile needs
  // garden.totalPlants.
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

  // One-owner map (Stage 2): the hero owns overdue, the global banner owns
  // weather alerts — the attention list keeps the telemetry + harvest kinds.
  // Filtered HERE (not inside AttentionRow) so Next Best Action can share the
  // exact same post-filter list for its top priority rung.
  const attentionItems = React.useMemo(
    () => (overview?.attention ?? []).filter((i) => !ATTENTION_EXCLUDE_KINDS.includes(i.kind)),
    [overview],
  );

  const totalPlants = dashStats?.garden.totalPlants ?? 0;

  const postureToggle = (
    <div
      data-testid="home-density-toggle"
      role="group"
      aria-label="Home layout"
      className="bg-rhozly-primary/5 p-0.5 rounded-xl flex shrink-0"
    >
      <button
        type="button"
        data-testid="home-density-simple"
        onClick={() => setPosture("porch")}
        aria-pressed={posture === "porch"}
        aria-label="Simple layout"
        title="Simple layout"
        className={`flex items-center justify-center min-w-9 min-h-9 pointer-coarse:min-w-11 pointer-coarse:min-h-11 rounded-lg transition-colors ${posture === "porch" ? "bg-rhozly-surface-lowest text-rhozly-primary shadow-card" : "text-rhozly-on-surface-variant can-hover:hover:text-rhozly-primary"}`}
      >
        <LayoutList size={15} />
      </button>
      <button
        type="button"
        data-testid="home-density-detailed"
        onClick={() => setPosture("workbench")}
        aria-pressed={posture === "workbench"}
        aria-label="Detailed layout"
        title="Detailed layout"
        className={`flex items-center justify-center min-w-9 min-h-9 pointer-coarse:min-w-11 pointer-coarse:min-h-11 rounded-lg transition-colors ${posture === "workbench" ? "bg-rhozly-surface-lowest text-rhozly-primary shadow-card" : "text-rhozly-on-surface-variant can-hover:hover:text-rhozly-primary"}`}
      >
        <Rows3 size={15} />
      </button>
    </div>
  );

  // Redesign Stage 2 — ONE hero for both postures (DailyBriefCard retired;
  // its facts migrated: sun line → hero micro-line, ask-AI → the console
  // hero's chip, Plan-day → hero-plan-day, zone/microclimate live at their
  // destinations). Voice comes from the preset: porch = sentence, workbench =
  // console (locked decision).
  const heroVariant: "sentence" | "console" =
    preset.variants.hero === "console" ? "console" : "sentence";
  const heroBlock = (
    <div className="flex items-start justify-between gap-3">
      <HomeStatusStrip
        firstName={firstName}
        weather={weather}
        rawWeather={rawWeather}
        todaySummary={todaySummary}
        overdueCount={overdueTaskCount}
        alerts={alerts}
        homeLat={homeLat}
        homeLng={homeLng}
        variant={heroVariant}
        aiEnabled={aiEnabled}
        hardinessZone={hardinessZone}
      />
      {postureToggle}
    </div>
  );

  const gardenSection = (
    // Stable wrapper: the dashboard_tour anchors here so the step works in
    // both the populated-grid and empty-garden states. (Preset variant
    // "photos"/"telemetry" is currently a no-op — both postures render the
    // existing grid; the density prop keeps the telemetry chips on the
    // workbench side. Photo-bento lands in a later slice.)
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
          className="bg-rhozly-surface-lowest rounded-card shadow-card border border-rhozly-outline/10 p-5"
        >
          <p className="font-black text-sm text-rhozly-on-surface mb-1">Let's set up your garden</p>
          <p className="text-xs text-rhozly-on-surface/60 mb-4">
            Add a location, then areas within it, and Rhozly will keep watch over every plant.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => navigate("/management?open=add-location")}
              className="flex items-center gap-2 bg-rhozly-primary/5 can-hover:hover:bg-rhozly-primary/10 active:scale-[0.98] rounded-2xl px-3 py-3 text-xs font-bold text-rhozly-on-surface transition"
            >
              <MapPin size={16} className="text-rhozly-primary shrink-0" /> Create a location
            </button>
            <button
              onClick={() => navigate("/shed?open=add-plant")}
              className="flex items-center gap-2 bg-rhozly-primary/5 can-hover:hover:bg-rhozly-primary/10 active:scale-[0.98] rounded-2xl px-3 py-3 text-xs font-bold text-rhozly-on-surface transition"
            >
              <Sprout size={16} className="text-rhozly-primary shrink-0" /> Add your first plant
            </button>
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 bg-rhozly-primary/5 can-hover:hover:bg-rhozly-primary/10 active:scale-[0.98] rounded-2xl px-3 py-3 text-xs font-bold text-rhozly-on-surface transition"
            >
              <Leaf size={16} className="text-rhozly-primary shrink-0" /> Take the garden quiz
            </button>
          </div>
        </section>
      )}
    </div>
  );

  // Redesign Stage 2 — the standalone Garden Walk banner folded into the
  // actions section as its featured first tile (same dash-garden-walk testid
  // + state.from contract; still gated on totalPlants >= 5).
  const quickActions = (
    <QuickActionsRow
      userId={userId}
      homeId={homeId}
      persona={persona}
      availabilityCtx={availabilityCtx}
      walkPlantCount={totalPlants}
    />
  );

  // Stage 4 (locked decision): the full embedded tabbed TaskList is gone; BOTH
  // postures render the compact list (which itself carries inline complete /
  // snooze / delete on every row, so the daily round-trip to the Calendar is
  // only needed for real management). Redesign Stage 3 (D#5): the entry point
  // is a real button in BOTH postures (was a faint 11px text link on the Porch)
  // — "See all →" on the Porch, "Open board →" on the Workbench. The compact
  // list's own duplicate calendar footer was removed at the same time.
  const taskBoardLink = (testId: string, label: string) => (
    <button
      data-testid={testId}
      onClick={() => navigate("/dashboard?view=calendar")}
      className="flex items-center gap-1 text-[11px] font-black text-rhozly-primary bg-rhozly-primary/5 px-2.5 py-1 rounded-full can-hover:hover:bg-rhozly-primary/10 active:scale-[0.97] transition"
    >
      {label} <ArrowRight size={12} />
    </button>
  );
  const tasksBlock =
    posture === "porch" ? (
      <section data-testid="home-todays-tasks">
        <div className="flex items-center justify-between px-1 mb-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Today's tasks
          </h2>
          {taskBoardLink("home-tasks-see-all", "See all")}
        </div>
        <TaskList homeId={homeId} compact hideCalendarLink targetDate={new Date()} />
      </section>
    ) : (
      <section data-testid="dashboard-task-list">
        <div className="flex items-center justify-between px-1 mb-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Today's tasks
          </h2>
          {taskBoardLink("home-tasks-open-board", "Open board")}
        </div>
        <TaskList homeId={homeId} compact hideCalendarLink targetDate={new Date()} />
      </section>
    );

  // Week Ahead — Evergreen-gated; workbench-only by sectionOrder.
  const weekAhead = (
    <FeatureGate feature="ai_insights" fallback={null}>
      <WeekAheadPreview homeId={homeId} />
    </FeatureGate>
  );

  const seasonalPicks = (
    <SeasonalPicksCard
      homeId={homeId}
      aiEnabled={aiEnabled}
      isPremium={isPremium}
      variant="dashboard"
    />
  );

  // Redesign Stage 3 — the four AI cards (daily brief, adaptive care, Head
  // Gardener headline, AI insight) merged into ONE "From Rhozly" card. Every
  // data mechanic, gate, and self-hide lives on inside TheBrief.
  const theBrief = userId ? <TheBrief homeId={homeId} userId={userId} density={density} /> : null;

  const attention =
    attentionItems.length > 0 ? <AttentionRow items={attentionItems} /> : null;

  // Porch-only by preset. `firstTaskTitle` rung intentionally unwired — task
  // titles aren't cheaply available at this level (TaskList owns that fetch);
  // the ladder falls through attention → seasonal.
  const nextBestAction = <NextBestAction attentionItems={attentionItems} />;

  // ── The section loop (Stage 4): HOME_PRESETS[posture].sectionOrder is the
  // single source of composition truth — ids map to the block elements above.
  const SECTIONS: Record<HomeSectionId, React.ReactNode | null> = {
    hero: heroBlock,
    nextBestAction,
    promo: promoSlot ?? null,
    attention,
    garden: gardenSection,
    today: tasksBlock,
    quickActions,
    learn: seasonalPicks,
    brief: theBrief,
    week: weekAhead,
  };

  // Wrapper contract: `data-section` names the slot (Next Best Action's
  // seasonal CTA scrolls to [data-section="learn"]); `order` (an inline flex
  // order) lets the workbench's phone layout flatten the two xl buckets back
  // into one stack in preset order; `empty:hidden` + the has-[hidden] variant
  // drop the wrapper from flow when its child self-hides, so flex gaps don't
  // double around invisible sections.
  const renderSection = (id: HomeSectionId) => {
    const node = SECTIONS[id];
    if (node === null || node === undefined) return null;
    const i = preset.sectionOrder.indexOf(id);
    return (
      <div
        key={id}
        data-section={id}
        className={`min-w-0 empty:hidden [&:has(>[hidden]:only-child)]:hidden ${
          entranceActive ? STAGGER_ENTRANCE : ""
        }`}
        style={{ ...(entranceActive ? staggerStyle(i) : undefined), order: i }}
      >
        {node}
      </div>
    );
  };

  // ── Porch: one centered editorial column at every width ──
  if (posture === "porch") {
    return (
      <div
        data-testid="home-main"
        className="mx-auto w-full max-w-[1100px] flex flex-col gap-5"
      >
        {preset.sectionOrder.map(renderSection)}
      </div>
    );
  }

  // ── Workbench: two-column studio on xl+ ──
  // Left = the daily-action flow; right = the glanceable insight rail
  // (brief / week / snapshot — hardcoded buckets, preset order within each).
  // Below xl the bucket wrappers become `display: contents`, so every section
  // is a direct flex item of the column and the inline `order` restores the
  // full preset sectionOrder as one stack.
  const primaryIds = preset.sectionOrder.filter((id) => !WORKBENCH_ASIDE_SECTIONS.has(id));
  const asideIds = preset.sectionOrder.filter((id) => WORKBENCH_ASIDE_SECTIONS.has(id));
  return (
    <div data-testid="home-main">
      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-12 xl:gap-6 xl:items-start">
        <div className="contents xl:flex xl:flex-col xl:gap-5 xl:col-span-8 xl:min-w-0">
          {primaryIds.map(renderSection)}
        </div>
        <aside className="contents xl:flex xl:flex-col xl:gap-5 xl:col-span-4 xl:min-w-0">
          {asideIds.map(renderSection)}
        </aside>
      </div>
    </div>
  );
}
