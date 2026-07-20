import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Leaf,
  CloudRain,
  Zap,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import type { HomeDashboardStats, DayStrip } from "../../hooks/useHomeDashboardStats";
import { getLocalDateString } from "../../lib/taskEngine";

export interface GardenSnapshotProps {
  stats: HomeDashboardStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Nullable to match useHomeDashboardStats' return (null until the first
   *  fetch resolves the week bounds) — the header falls back to "Sun – Sat". */
  weekStart: string | null;
  weekEnd: string | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Design-overhaul stat rationalisation: a zero-valued tile carries no
 *  information — hide it (and its whole section, when every sibling hides)
 *  instead of rendering a wall of zeros. Only literal `0` / `"0"` count as
 *  zero: formatted strings like `"0mm"` or `"—"` are deliberately NOT
 *  hidden — "no rainfall recorded" and "no streak yet" are real data. */
function isZeroValue(value: string | number): boolean {
  return value === 0 || value === "0";
}

function StatCard({
  label,
  value,
  sub,
  onClick,
  hideWhenZero,
  "data-testid": testId,
}: {
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
  /** When set and the value is 0 (or "0"), the tile renders nothing. */
  hideWhenZero?: boolean;
  "data-testid"?: string;
}) {
  if (hideWhenZero && isZeroValue(value)) return null;
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={!onClick}
      className={`flex flex-col gap-0.5 p-3 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 text-left transition-all group ${
        onClick ? "hover:bg-rhozly-primary/5 hover:border-rhozly-primary/20 cursor-pointer" : "cursor-default"
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/40 leading-none">{label}</span>
      <span className="text-2xl font-black text-rhozly-on-surface leading-tight">{value}</span>
      {sub && <span className="text-[10px] text-rhozly-on-surface/40 leading-none">{sub}</span>}
      {onClick && (
        <ChevronRight size={12} className="text-rhozly-primary/40 group-hover:text-rhozly-primary mt-0.5 transition-colors" />
      )}
    </button>
  );
}

/** Descriptor form of a StatCard — sections build these lists so the
 *  section header can hide when every tile in it hides (the header-level
 *  counterpart of `hideWhenZero`). */
interface TileDef {
  testId: string;
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
  hideWhenZero?: boolean;
}

/** Same predicate StatCard applies internally — filtering up front lets a
 *  section know whether ANY tile survives before rendering its header. */
function visibleTiles(tiles: TileDef[]): TileDef[] {
  return tiles.filter((t) => !(t.hideWhenZero && isZeroValue(t.value)));
}

function TileGrid({ tiles }: { tiles: TileDef[] }) {
  return (
    <>
      {tiles.map((t) => (
        <StatCard
          key={t.testId}
          data-testid={t.testId}
          label={t.label}
          value={t.value}
          sub={t.sub}
          onClick={t.onClick}
          hideWhenZero={t.hideWhenZero}
        />
      ))}
    </>
  );
}

function SkeletonCard() {
  return <div className="h-20 rounded-2xl bg-rhozly-surface-low animate-pulse" />;
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="text-rhozly-primary">{icon}</div>
      <h3 className="font-black text-xs uppercase tracking-widest text-rhozly-on-surface/60">{title}</h3>
    </div>
  );
}

function DayLegend({ activeDay, dayStrip }: { activeDay: string | null; dayStrip: DayStrip[] }) {
  if (!activeDay) return null;
  const d = dayStrip.find((s) => s.date === activeDay);
  if (!d || d.total === 0) return null;
  const pills = [
    { count: d.overdue,         label: "overdue",        cls: "text-red-700 bg-red-50"                            },
    { count: d.completedLate,   label: "completed late", cls: "text-orange-700 bg-orange-50"                      },
    { count: d.completedOnTime, label: "on time",        cls: "text-emerald-700 bg-emerald-50"                    },
    { count: d.pending,         label: "pending",        cls: "text-rhozly-on-surface/70 bg-rhozly-surface-low"   },
  ].filter((p) => p.count > 0);
  if (pills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {pills.map((p, i) => (
        <span key={i} className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${p.cls}`}>
          {p.count} {p.label}
        </span>
      ))}
    </div>
  );
}

/** Max dots rendered per status bucket in a day column — mirrors
 *  WeekPulse's compressed dot language (glanceable shape, not exact
 *  counts). Exact numbers stay reachable via the hover/tap DayLegend,
 *  per-dot titles, and the "{n} tasks" sub-label. */
const DOTS_PER_BUCKET_CAP = 3;

function StatsPanel({ stats }: { stats: HomeDashboardStats }) {
  const navigate = useNavigate();
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending DayLegend close timer on unmount so a late
  // setActiveDay never fires against an unmounted panel.
  useEffect(() => {
    return () => {
      if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
    };
  }, []);

  const { tasks, garden, weather, automations, additional, dayStrip } = stats;

  const yieldSummary = Object.entries(garden.totalYieldByUnit)
    .map(([unit, val]) => `${val % 1 === 0 ? val : val.toFixed(1)}${unit}`)
    .join(" · ") || "—";

  const taskTiles = visibleTiles([
    {
      testId: "dash-stat-tasks-total",
      label: "Total Tasks",
      // RHO-13: Total Tasks opens the Calendar agenda (matching every
      // sibling tile), not the Routines page (/schedule). /schedule is
      // BlueprintManager, which doesn't show this week's task instances.
      value: tasks.total,
      onClick: () => navigate(`/dashboard?view=calendar&date=${getLocalDateString(new Date())}`),
      // Always renders — the one tasks tile that never hides at zero.
    },
    {
      testId: "dash-stat-tasks-completed",
      label: "Completed",
      value: tasks.completed,
      sub: `${tasks.completionRate}% rate`,
      onClick: () => navigate(`/dashboard?view=calendar&date=${getLocalDateString(new Date())}`),
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-tasks-overdue",
      label: "Overdue",
      value: tasks.overdue,
      // Overdue tasks live on the Calendar agenda for today — the
      // Routines page (/schedule) doesn't filter by overdue, so
      // the previous /schedule?filter=overdue route just dropped
      // the user into the routines list with no filter applied.
      onClick: tasks.overdue > 0 ? () => navigate(`/dashboard?view=calendar&date=${getLocalDateString(new Date())}`) : undefined,
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-tasks-pending",
      label: "Pending",
      value: tasks.pending,
      onClick: tasks.pending > 0 ? () => navigate(`/dashboard?view=calendar&date=${getLocalDateString(new Date())}`) : undefined,
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-tasks-auto",
      label: "Done automatically",
      value: tasks.autoCompleted,
      onClick: tasks.autoCompleted > 0 ? () => navigate(`/dashboard?view=calendar&date=${getLocalDateString(new Date())}`) : undefined,
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-tasks-streak",
      label: "Streak",
      value: tasks.streak > 0 ? `${tasks.streak}d` : "—",
      sub: tasks.streak > 0 ? "days in a row" : "no streak yet",
      // hideWhenZero never fires here: a zero streak renders "—", which is
      // formatted data, not a bare 0 (see isZeroValue).
      hideWhenZero: true,
    },
  ]);

  const gardenTiles = visibleTiles([
    {
      testId: "dash-stat-plants-total",
      label: "Active Plants",
      value: garden.totalPlants,
      sub: garden.plantsAddedThisWeek > 0 ? `+${garden.plantsAddedThisWeek} this week` : undefined,
      onClick: () => navigate("/shed"),
      // Always renders — the one garden tile that never hides at zero.
    },
    {
      testId: "dash-stat-harvest-blueprints",
      label: "Harvests Due",
      value: garden.harvestBlueprintsDue,
      sub: `${garden.harvestBlueprintsCompleted} completed`,
      onClick: () => navigate("/schedule?category=Harvesting"),
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-harvest-instances",
      label: "Plants Harvested",
      value: garden.plantInstancesHarvested,
      sub: yieldSummary !== "—" ? yieldSummary : undefined,
      onClick: garden.plantInstancesHarvested > 0 ? () => navigate("/shed") : undefined,
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-pruning-blueprints",
      label: "Pruning Due",
      value: garden.pruningBlueprintsDue,
      sub: `${garden.pruningBlueprintsCompleted} completed`,
      onClick: () => navigate("/schedule?category=Pruning"),
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-pruned-instances",
      label: "Plants Pruned",
      value: garden.plantInstancesPruned,
      onClick: garden.plantInstancesPruned > 0 ? () => navigate("/shed") : undefined,
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-general-pruning",
      label: "General Pruning",
      value: garden.generalPruningEvents,
      onClick: garden.generalPruningEvents > 0 ? () => navigate("/schedule?category=Pruning") : undefined,
      hideWhenZero: true,
    },
  ]);

  const weatherTiles = visibleTiles([
    {
      testId: "dash-stat-weather-alerts",
      label: "Alerts",
      value: weather.alertCount,
      sub: weather.activeAlertCount > 0 ? `${weather.activeAlertCount} active` : undefined,
      onClick: () => navigate("/dashboard?view=weather"),
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-rainfall",
      label: "Rainfall",
      // "0mm" / "—" never match isZeroValue, so this tile (and therefore
      // the Weather section) survives — a dry week is a real datum.
      value: weather.rainfallMm !== null ? `${weather.rainfallMm}mm` : "—",
      onClick: () => navigate("/dashboard?view=weather"),
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-skipped-rain",
      label: "Skipped (rained)",
      value: weather.tasksSkippedByRain,
      onClick: weather.tasksSkippedByRain > 0 ? () => navigate("/schedule?filter=skipped") : undefined,
      hideWhenZero: true,
    },
  ]);

  const automationTiles = visibleTiles([
    {
      testId: "dash-stat-auto-runs",
      label: "Total Runs",
      value: automations.total,
      onClick: () => navigate("/integrations"),
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-auto-success",
      label: "Successful",
      value: automations.successful,
      onClick: automations.successful > 0 ? () => navigate("/integrations") : undefined,
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-auto-failed",
      label: "Failed",
      value: automations.failed,
      onClick: automations.failed > 0 ? () => navigate("/integrations") : undefined,
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-auto-tasks",
      label: "Tasks Auto-done",
      value: automations.tasksCompleted,
      onClick: automations.tasksCompleted > 0 ? () => navigate("/schedule?filter=automated") : undefined,
      hideWhenZero: true,
    },
  ]);

  const additionalTiles = visibleTiles([
    {
      testId: "dash-stat-doctor-sessions",
      label: "Plant Doctor",
      value: additional.plantDoctorSessions,
      sub: "sessions",
      onClick: additional.plantDoctorSessions > 0 ? () => navigate("/doctor") : undefined,
      hideWhenZero: true,
    },
    {
      testId: "dash-stat-watchlist-new",
      label: "New Watchlist",
      value: additional.newWatchlistAlerts,
      sub: "alerts",
      onClick: additional.newWatchlistAlerts > 0 ? () => navigate("/shed?tab=watchlist") : undefined,
      hideWhenZero: true,
    },
  ]);

  return (
    <div className="space-y-6">
      {/* ── Tasks This Week ──────────────────────────────────────────────── */}
      {taskTiles.length > 0 && (
        <section>
          <SectionHeader icon={<CheckCircle2 size={16} />} title="Tasks This Week" />
          {/* RHO-14 "additional count" (interpretation flagged for on-device
              verification): a small carried-over/activity line above the
              headline tiles. `priorOverdue` = open overdue carried in from
              before this week; `completedThisWeek` = tasks completed this week.
              These are computed server-side over the widened task set and are
              deliberately NOT folded into the Total/Overdue/Pending tiles. */}
          {(tasks.priorOverdue > 0 || tasks.completedThisWeek > 0) && (
            <div
              data-testid="dash-tasks-carried-over"
              className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-rhozly-on-surface/55"
            >
              {tasks.priorOverdue > 0 && (
                <button
                  type="button"
                  data-testid="dash-tasks-carried-over-prior"
                  onClick={() => navigate(`/dashboard?view=calendar&date=${getLocalDateString(new Date())}`)}
                  className="inline-flex items-center gap-1 text-red-700 hover:underline"
                >
                  <AlertTriangle size={12} />
                  {tasks.priorOverdue} carried over from earlier weeks
                </button>
              )}
              {tasks.completedThisWeek > 0 && (
                <span
                  data-testid="dash-tasks-completed-this-week"
                  className="inline-flex items-center gap-1 text-emerald-700"
                >
                  <CheckCircle2 size={12} />
                  {tasks.completedThisWeek} completed this week
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <TileGrid tiles={taskTiles} />
          </div>

          {Object.keys(tasks.byCategory).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(tasks.byCategory).map(([cat, count]) => (
                <button
                  key={cat}
                  data-testid={`dash-cat-${cat.toLowerCase()}`}
                  onClick={() => navigate(`/schedule?category=${encodeURIComponent(cat)}`)}
                  className="text-[10px] font-bold bg-rhozly-primary/10 text-rhozly-primary px-2.5 py-1 rounded-full hover:bg-rhozly-primary/20 transition-colors"
                >
                  {cat}: {count}
                </button>
              ))}
            </div>
          )}

          {tasks.memberBreakdown.length > 1 && (
            <div className="mt-3">
              <button
                data-testid="dash-member-breakdown-toggle"
                onClick={() => setMembersExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface/50 hover:text-rhozly-on-surface/80 transition-colors"
              >
                {membersExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Per-member breakdown
              </button>
              {membersExpanded && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tasks.memberBreakdown.map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center gap-1.5 bg-rhozly-surface-low rounded-xl px-3 py-1.5"
                    >
                      <span className="text-xs font-bold text-rhozly-on-surface">{m.name}</span>
                      <span className="text-xs font-black text-rhozly-primary">{m.completed}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Week Overview Day Strip ───────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<Clock size={16} />} title="Week Overview" />
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {dayStrip.map((day, idx) => {
            const label = DAY_LABELS[idx] ?? day.date.slice(5, 10);
            // WeekPulse's dot-column language replaces the old
            // slash-separated numbers: one small dot per task (capped per
            // bucket), fixed bucket order, zero-count buckets omitted.
            // red = overdue · orange = completed late · emerald = on time ·
            // neutral = pending, with lighter variants on the today pill.
            const buckets = [
              { count: day.overdue,         label: "overdue",        normalCls: "bg-red-500",                  todayCls: "bg-red-200"     },
              { count: day.completedLate,   label: "completed late", normalCls: "bg-orange-400",               todayCls: "bg-orange-200"  },
              { count: day.completedOnTime, label: "on time",        normalCls: "bg-emerald-500",              todayCls: "bg-emerald-200" },
              { count: day.pending,         label: "pending",        normalCls: "bg-rhozly-on-surface/40",     todayCls: "bg-white"       },
            ].filter((b) => b.count > 0);
            return (
              <button
                key={day.date}
                data-testid={`dash-day-${day.date}`}
                onClick={() => navigate(`/dashboard?view=calendar&date=${day.date}`)}
                onMouseEnter={() => {
                  if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
                  setActiveDay(day.date);
                }}
                onMouseLeave={() => {
                  leaveTimeout.current = setTimeout(() => setActiveDay(null), 300);
                }}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl min-w-[52px] shrink-0 border transition-all ${
                  day.isToday
                    ? "bg-rhozly-primary text-white border-rhozly-primary shadow-md"
                    : day.isPast
                    ? "bg-rhozly-surface-low border-rhozly-outline/10 opacity-70"
                    : "bg-rhozly-surface-low border-rhozly-outline/10 hover:border-rhozly-primary/30"
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest ${day.isToday ? "text-white/80" : "text-rhozly-on-surface/40"}`}>
                  {label}
                </span>
                {day.total === 0 ? (
                  <span className={`text-lg font-black leading-none ${day.isToday ? "text-white/40" : "text-rhozly-on-surface/25"}`}>
                    —
                  </span>
                ) : (
                  <div
                    className="flex items-center justify-center flex-wrap gap-0.5 min-h-[18px] max-w-[40px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveDay((prev) => (prev === day.date ? null : day.date));
                    }}
                  >
                    {buckets.map((b) =>
                      Array.from({ length: Math.min(b.count, DOTS_PER_BUCKET_CAP) }).map((_, i) => (
                        <span
                          key={`${b.label}-${i}`}
                          title={`${b.count} ${b.label}`}
                          className={`w-1.5 h-1.5 rounded-full ${day.isToday ? b.todayCls : b.normalCls}`}
                        />
                      )),
                    )}
                  </div>
                )}
                <span className={`text-[9px] font-bold ${day.isToday ? "text-white/70" : "text-rhozly-on-surface/40"}`}>
                  {day.total === 1 ? "1 task" : `${day.total} tasks`}
                </span>
              </button>
            );
          })}
        </div>
        <DayLegend activeDay={activeDay} dayStrip={dayStrip} />
      </section>

      {/* ── Garden This Week ─────────────────────────────────────────────── */}
      {gardenTiles.length > 0 && (
        <section>
          <SectionHeader icon={<Leaf size={16} />} title="Garden This Week" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <TileGrid tiles={gardenTiles} />
          </div>
        </section>
      )}

      {/* ── Weather + Automations ─────────────────────────────────────────── */}
      {(weatherTiles.length > 0 || automationTiles.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {weatherTiles.length > 0 && (
            <section>
              <SectionHeader icon={<CloudRain size={16} />} title="Weather This Week" />
              <div className="grid grid-cols-2 gap-2">
                <TileGrid tiles={weatherTiles} />
              </div>
            </section>
          )}

          {automationTiles.length > 0 && (
            <section>
              <SectionHeader icon={<Zap size={16} />} title="Automations This Week" />
              <div className="grid grid-cols-2 gap-2">
                <TileGrid tiles={automationTiles} />
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Additional Stats ──────────────────────────────────────────────── */}
      {additionalTiles.length > 0 && (
        <section>
          <SectionHeader icon={<TrendingUp size={16} />} title="More Activity" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <TileGrid tiles={additionalTiles} />
          </div>
        </section>
      )}
    </div>
  );
}

function formatWeekRange(weekStart: string | null, weekEnd: string | null): string {
  if (!weekStart || !weekEnd) return "";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

/**
 * Garden Snapshot — the Overview tab's "This Week at a Glance" stat wall,
 * relocated from `HomeDashboard.tsx` to the merged home's Detailed density.
 * Pure presentation: the parent owns `useHomeDashboardStats` and threads
 * stats/loading/error/refresh down, so mounting this never double-fetches.
 * Renders nothing for an empty garden — the merged home has its own
 * empty-garden card (the old EmptyGardenPanel is deliberately not ported).
 */
export default function GardenSnapshot({ stats, loading, error, refresh, weekStart, weekEnd }: GardenSnapshotProps) {
  const weekRange = formatWeekRange(weekStart, weekEnd);

  // Garden Snapshot collapse — COLLAPSED by default for everyone (home
  // redesign Stage 2: deep stats are the snapshot's owned fact family, one
  // tap away; an open stat wall re-duplicated numbers the hero + task list
  // already carry). The user's explicit choice is persisted and always wins.
  const STORAGE_KEY = "rhozly:dashboard:snapshot-open";
  const initialSnapshotOpen = (() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") return true;
      if (stored === "false") return false;
    } catch { /* SSR / private mode */ }
    return false;
  })();
  const [snapshotOpen, setSnapshotOpenState] = useState(initialSnapshotOpen);
  // Persist only when the USER toggles — the previous persist-on-mount
  // effect froze the first-render default forever: usePersona() typically
  // resolves after first render, so an experienced user's open-by-default
  // was written as "false" on their first visit and never recovered.
  const setSnapshotOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setSnapshotOpenState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try { localStorage.setItem(STORAGE_KEY, value ? "true" : "false"); } catch { /* ignore */ }
      return value;
    });
  };
  // (Stage 2: the persona-follows-open effect was removed — collapsed is the
  // default for every posture; only the user's explicit toggle persists.)

  // Empty garden → the merged home's own empty-garden card takes over;
  // this snapshot renders nothing at all. (Must come after all hooks.)
  if (stats && stats.garden.totalPlants === 0) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="font-black text-lg text-rhozly-on-surface">This Week at a Glance</h2>
          <p className="text-xs text-rhozly-on-surface/40 font-bold uppercase tracking-widest">
            {weekRange || "Sun – Sat"}
          </p>
        </div>
        <button
          data-testid="dash-refresh"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/50 hover:text-rhozly-primary transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm">
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <span className="text-red-700 font-bold">{error}</span>
          <button
            onClick={refresh}
            className="ml-auto text-xs font-black text-red-600 hover:text-red-800 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !stats ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-rhozly-surface-low animate-pulse rounded-full" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="w-14 h-16 bg-rhozly-surface-low animate-pulse rounded-2xl shrink-0" />
            ))}
          </div>
          <div className="space-y-2">
            <div className="h-4 w-32 bg-rhozly-surface-low animate-pulse rounded-full" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          </div>
        </div>
      ) : stats ? (
        <div>
          <button
            type="button"
            data-testid="dash-snapshot-toggle"
            onClick={() => setSnapshotOpen((o) => !o)}
            aria-expanded={snapshotOpen}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-rhozly-outline/15 bg-rhozly-surface-low/40 hover:bg-rhozly-surface-low transition-colors mb-3"
          >
            <span className="flex items-center gap-2 font-black text-sm text-rhozly-on-surface">
              <TrendingUp size={16} className="text-rhozly-primary" />
              Garden Snapshot
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/45 flex items-center gap-1">
              {snapshotOpen ? "Hide" : "Show"}
              {snapshotOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {snapshotOpen && <StatsPanel stats={stats} />}
        </div>
      ) : !error ? (
        <div className="flex items-center justify-center py-20 text-rhozly-on-surface/30 text-sm font-bold">
          No data available yet.
        </div>
      ) : null}
    </div>
  );
}
