import React, { useState, useRef, useEffect } from "react";
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
  MapPin,
  Calendar,
  Footprints,
  ArrowRight,
} from "lucide-react";
import { useHomeDashboardStats, type HomeDashboardStats } from "../hooks/useHomeDashboardStats";
import TaskList from "./TaskList";
import SeasonalPicksCard from "./seasonal/SeasonalPicksCard";
import TodayFocusCard from "./shared/TodayFocusCard";
import WeekAheadPreview from "./shared/WeekAheadPreview";
import FeatureGate from "./shared/FeatureGate";
import { usePersona } from "../hooks/usePersona";

interface Props {
  homeId: string;
  /** Threaded through to the in-dashboard `<SeasonalPicksCard>` so its
   *  `PlantDetailModal` overlay gates Grow Guide / Companions correctly. */
  aiEnabled: boolean;
  isPremium: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatCard({
  label,
  value,
  sub,
  onClick,
  "data-testid": testId,
}: {
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
  "data-testid"?: string;
}) {
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

function SkeletonCard() {
  return <div className="h-20 rounded-2xl bg-rhozly-surface-low animate-pulse" />;
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="text-rhozly-primary">{icon}</div>
      <h3 className="font-black text-xs uppercase tracking-widest text-rhozly-on-surface/60">{title}</h3>
    </div>
  );
}

function DayLegend({ activeDay, dayStrip }: { activeDay: string | null; dayStrip: HomeDashboardStats["dayStrip"] }) {
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

function StatsPanel({ stats, homeId }: { stats: HomeDashboardStats; homeId: string }) {
  const navigate = useNavigate();
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { tasks, garden, weather, automations, additional, dayStrip } = stats;

  const yieldSummary = Object.entries(garden.totalYieldByUnit)
    .map(([unit, val]) => `${val % 1 === 0 ? val : val.toFixed(1)}${unit}`)
    .join(" · ") || "—";

  return (
    <div className="space-y-6">
      {/* ── Tasks This Week ──────────────────────────────────────────────── */}
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
                onClick={() => navigate(`/dashboard?view=calendar&date=${new Date().toISOString().split("T")[0]}`)}
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
          <StatCard
            data-testid="dash-stat-tasks-total"
            label="Total Tasks"
            // RHO-13: Total Tasks opens the Calendar agenda (matching every
            // sibling tile), not the Routines page (/schedule). /schedule is
            // BlueprintManager, which doesn't show this week's task instances.
            value={tasks.total}
            onClick={() => navigate(`/dashboard?view=calendar&date=${new Date().toISOString().split("T")[0]}`)}
          />
          <StatCard
            data-testid="dash-stat-tasks-completed"
            label="Completed"
            value={tasks.completed}
            sub={`${tasks.completionRate}% rate`}
            onClick={() => navigate(`/dashboard?view=calendar&date=${new Date().toISOString().split("T")[0]}`)}
          />
          <StatCard
            data-testid="dash-stat-tasks-overdue"
            label="Overdue"
            value={tasks.overdue}
            // Overdue tasks live on the Calendar agenda for today — the
            // Routines page (/schedule) doesn't filter by overdue, so
            // the previous /schedule?filter=overdue route just dropped
            // the user into the routines list with no filter applied.
            onClick={tasks.overdue > 0 ? () => navigate(`/dashboard?view=calendar&date=${new Date().toISOString().split("T")[0]}`) : undefined}
          />
          <StatCard
            data-testid="dash-stat-tasks-pending"
            label="Pending"
            value={tasks.pending}
            onClick={tasks.pending > 0 ? () => navigate(`/dashboard?view=calendar&date=${new Date().toISOString().split("T")[0]}`) : undefined}
          />
          <StatCard
            data-testid="dash-stat-tasks-auto"
            label="Done automatically"
            value={tasks.autoCompleted}
            onClick={tasks.autoCompleted > 0 ? () => navigate(`/dashboard?view=calendar&date=${new Date().toISOString().split("T")[0]}`) : undefined}
          />
          <StatCard
            data-testid="dash-stat-tasks-streak"
            label="Streak"
            value={tasks.streak > 0 ? `${tasks.streak}d` : "—"}
            sub={tasks.streak > 0 ? "days in a row" : "no streak yet"}
          />
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

      {/* ── Week Overview Day Strip ───────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<Clock size={16} />} title="Week Overview" />
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {dayStrip.map((day, idx) => {
            const label = DAY_LABELS[idx] ?? day.date.slice(5, 10);
            const buckets = [
              { count: day.overdue,         normalCls: "text-red-600",           todayCls: "text-red-200"    },
              { count: day.completedLate,   normalCls: "text-orange-500",         todayCls: "text-orange-200" },
              { count: day.completedOnTime, normalCls: "text-emerald-600",        todayCls: "text-emerald-200"},
              { count: day.pending,         normalCls: "text-rhozly-on-surface",  todayCls: "text-white"      },
            ].filter((b) => b.count > 0);
            const slashCls = day.isToday ? "text-white/30" : "text-rhozly-on-surface/20";
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
                    className="flex items-baseline leading-none flex-wrap justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveDay((prev) => (prev === day.date ? null : day.date));
                    }}
                  >
                    {buckets.map((b, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && (
                          <span className={`text-sm font-bold leading-none mx-0.5 ${slashCls}`}>/</span>
                        )}
                        <span className={`text-lg font-black leading-none ${day.isToday ? b.todayCls : b.normalCls}`}>
                          {b.count}
                        </span>
                      </React.Fragment>
                    ))}
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
      <section>
        <SectionHeader icon={<Leaf size={16} />} title="Garden This Week" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatCard
            data-testid="dash-stat-plants-total"
            label="Active Plants"
            value={garden.totalPlants}
            sub={garden.plantsAddedThisWeek > 0 ? `+${garden.plantsAddedThisWeek} this week` : undefined}
            onClick={() => navigate("/shed")}
          />
          <StatCard
            data-testid="dash-stat-harvest-blueprints"
            label="Harvests Due"
            value={garden.harvestBlueprintsDue}
            sub={`${garden.harvestBlueprintsCompleted} completed`}
            onClick={() => navigate("/schedule?category=Harvesting")}
          />
          <StatCard
            data-testid="dash-stat-harvest-instances"
            label="Plants Harvested"
            value={garden.plantInstancesHarvested}
            sub={yieldSummary !== "—" ? yieldSummary : undefined}
            onClick={garden.plantInstancesHarvested > 0 ? () => navigate("/shed") : undefined}
          />
          <StatCard
            data-testid="dash-stat-pruning-blueprints"
            label="Pruning Due"
            value={garden.pruningBlueprintsDue}
            sub={`${garden.pruningBlueprintsCompleted} completed`}
            onClick={() => navigate("/schedule?category=Pruning")}
          />
          <StatCard
            data-testid="dash-stat-pruned-instances"
            label="Plants Pruned"
            value={garden.plantInstancesPruned}
            onClick={garden.plantInstancesPruned > 0 ? () => navigate("/shed") : undefined}
          />
          <StatCard
            data-testid="dash-stat-general-pruning"
            label="General Pruning"
            value={garden.generalPruningEvents}
            onClick={garden.generalPruningEvents > 0 ? () => navigate("/schedule?category=Pruning") : undefined}
          />
        </div>
      </section>

      {/* ── Weather + Automations ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <section>
          <SectionHeader icon={<CloudRain size={16} />} title="Weather This Week" />
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              data-testid="dash-stat-weather-alerts"
              label="Alerts"
              value={weather.alertCount}
              sub={weather.activeAlertCount > 0 ? `${weather.activeAlertCount} active` : undefined}
              onClick={() => navigate("/dashboard?view=weather")}
            />
            <StatCard
              data-testid="dash-stat-rainfall"
              label="Rainfall"
              value={weather.rainfallMm !== null ? `${weather.rainfallMm}mm` : "—"}
              onClick={() => navigate("/dashboard?view=weather")}
            />
            <StatCard
              data-testid="dash-stat-skipped-rain"
              label="Skipped (rained)"
              value={weather.tasksSkippedByRain}
              onClick={weather.tasksSkippedByRain > 0 ? () => navigate("/schedule?filter=skipped") : undefined}
            />
          </div>
        </section>

        <section>
          <SectionHeader icon={<Zap size={16} />} title="Automations This Week" />
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              data-testid="dash-stat-auto-runs"
              label="Total Runs"
              value={automations.total}
              onClick={() => navigate("/integrations")}
            />
            <StatCard
              data-testid="dash-stat-auto-success"
              label="Successful"
              value={automations.successful}
              onClick={automations.successful > 0 ? () => navigate("/integrations") : undefined}
            />
            <StatCard
              data-testid="dash-stat-auto-failed"
              label="Failed"
              value={automations.failed}
              onClick={automations.failed > 0 ? () => navigate("/integrations") : undefined}
            />
            <StatCard
              data-testid="dash-stat-auto-tasks"
              label="Tasks Auto-done"
              value={automations.tasksCompleted}
              onClick={automations.tasksCompleted > 0 ? () => navigate("/schedule?filter=automated") : undefined}
            />
          </div>
        </section>
      </div>

      {/* ── Additional Stats ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<TrendingUp size={16} />} title="More Activity" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatCard
            data-testid="dash-stat-doctor-sessions"
            label="Plant Lens"
            value={additional.plantDoctorSessions}
            sub="sessions"
            onClick={additional.plantDoctorSessions > 0 ? () => navigate("/doctor") : undefined}
          />
          <StatCard
            data-testid="dash-stat-watchlist-new"
            label="New Watchlist"
            value={additional.newWatchlistAlerts}
            sub="alerts"
            onClick={additional.newWatchlistAlerts > 0 ? () => navigate("/shed?tab=watchlist") : undefined}
          />
        </div>
      </section>
    </div>
  );
}

function TasksPanel({ homeId }: { homeId: string }) {
  const navigate = useNavigate();
  return (
    <div className="lg:sticky lg:top-4 space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="font-black text-xs uppercase tracking-widest text-rhozly-on-surface/60">
          Today's Tasks
        </h3>
        <button
          onClick={() => navigate("/dashboard?view=calendar", { replace: true })}
          className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest hover:underline transition-all"
        >
          View Calendar
        </button>
      </div>
      <div
        data-testid="dashboard-task-list"
        className="bg-rhozly-surface-lowest/80 rounded-3xl p-4 sm:p-6 border border-rhozly-outline/10 shadow-sm min-h-[400px]"
      >
        <TaskList homeId={homeId} />
      </div>
    </div>
  );
}

function EmptyGardenPanel() {
  const navigate = useNavigate();
  const tiles = [
    {
      icon: <MapPin size={24} className="text-emerald-600" />,
      bg: "bg-emerald-50 border-emerald-100",
      iconBg: "bg-emerald-100",
      title: "Add a Location",
      description: "Set up your first garden area — Back Garden, Greenhouse, Balcony, or anywhere you grow.",
      cta: "Add Location",
      path: "/management",
      testId: "empty-home-add-location",
    },
    {
      icon: <Leaf size={24} className="text-teal-600" />,
      bg: "bg-teal-50 border-teal-100",
      iconBg: "bg-teal-100",
      title: "Add Plants to the Shed",
      description: "Search millions of plants or add your own. Your Shed is where all your plants live.",
      cta: "Go to Shed",
      path: "/shed",
      testId: "empty-home-add-plants",
    },
    {
      icon: <Calendar size={24} className="text-indigo-600" />,
      bg: "bg-indigo-50 border-indigo-100",
      iconBg: "bg-indigo-100",
      title: "Set a Task Schedule",
      description: "Create recurring reminders for watering, pruning, and harvesting — set once, runs forever.",
      cta: "Create Schedule",
      path: "/schedule",
      testId: "empty-home-add-schedule",
    },
  ];

  return (
    <div className="space-y-4" data-testid="empty-garden-panel">
      <div className="px-1">
        <h3 className="font-black text-base text-rhozly-on-surface">Welcome to your garden dashboard</h3>
        <p className="text-sm text-rhozly-on-surface/50 mt-0.5">Follow these three steps to get your garden set up.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <button
            key={t.path}
            data-testid={t.testId}
            onClick={() => navigate(t.path)}
            className={`flex flex-col gap-3 p-4 rounded-2xl border text-left transition-all hover:shadow-md active:scale-[0.98] ${t.bg}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.iconBg}`}>
              {t.icon}
            </div>
            <div>
              <p className="font-black text-sm text-rhozly-on-surface leading-tight">{t.title}</p>
              <p className="text-[11px] text-rhozly-on-surface/55 mt-1 leading-snug">{t.description}</p>
            </div>
            <span className="text-xs font-black text-rhozly-primary mt-auto">{t.cta} →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatWeekRange(weekStart: string | null, weekEnd: string | null): string {
  if (!weekStart || !weekEnd) return "";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

export default function HomeDashboard({ homeId, aiEnabled, isPremium }: Props) {
  const navigate = useNavigate();
  const { stats, loading, error, refresh, weekStart, weekEnd } = useHomeDashboardStats(homeId);
  const weekRange = formatWeekRange(weekStart, weekEnd);
  const persona = usePersona();

  // Garden Snapshot collapse — open by default for experienced users
  // who want to see the numbers, collapsed for newcomers (or null
  // persona) so the dashboard doesn't lead with 20 zero-tiles. The
  // user's preference is persisted to localStorage so subsequent
  // visits remember.
  const STORAGE_KEY = "rhozly:dashboard:snapshot-open";
  const initialSnapshotOpen = (() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") return true;
      if (stored === "false") return false;
    } catch { /* SSR / private mode */ }
    return persona === "experienced";
  })();
  const [snapshotOpen, setSnapshotOpen] = useState(initialSnapshotOpen);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, snapshotOpen ? "true" : "false"); } catch { /* ignore */ }
  }, [snapshotOpen]);

  return (
    <div className="space-y-5">
      {/* Today's focus — surfaces ONE actionable thing (overdue task,
          weather alert, streak) at the top so the dashboard answers
          "what should I do today?" before anything else. */}
      <TodayFocusCard homeId={homeId} variant="dashboard" />

      {/* Sneak-peek of the Sunday-morning Weekly Overview — previews
          task / weather / sow counts and deep-links to /weekly.
          RHO-9: /weekly is the AI-insights Weekly Overview, gated
          Evergreen-only. Gate the entry card on the same `ai_insights`
          feature so Sprout/Botanist/Sage don't tap an available-looking
          card and land on a full-size upsell. FeatureGate resolves the
          tier itself via useEntitlements; `fallback={null}` renders
          nothing when locked (a brief flash before the tier resolves is
          acceptable — App.tsx doesn't plumb a tier prop here). */}
      <FeatureGate feature="ai_insights" fallback={null}>
        <WeekAheadPreview homeId={homeId} />
      </FeatureGate>

      {/* Garden Walk launcher — only surfaces once the user has enough
          plants to make a guided walk feel worthwhile (UX review
          2026-06-15, item 2.1). Mirrors the mobile QuickAccessHome tile. */}
      {stats && stats.garden.totalPlants >= 5 && (
        <button
          type="button"
          data-testid="dash-garden-walk"
          // RHO-7/8: preserve the origin so the walk returns here on
          // Done/Stop/empty/error instead of the mobile /quick shortcut.
          onClick={() => navigate("/walk", { state: { from: "/dashboard" } })}
          className="group w-full rounded-3xl bg-gradient-to-br from-rhozly-primary via-rhozly-primary to-rhozly-primary-container text-white text-left p-4 flex items-center gap-3 shadow-[0_8px_22px_-8px_rgba(7,87,55,0.55)] hover:-translate-y-0.5 active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-rhozly-primary/40 relative overflow-hidden"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-md"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent"
          />
          <div className="relative shrink-0 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <Footprints size={24} strokeWidth={2.25} />
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="font-display font-black text-base leading-tight">
              Start a Garden Walk
            </p>
            <p className="text-[11px] leading-snug text-white/85 line-clamp-2">
              A guided five-minute tour of your {stats.garden.totalPlants} plants — log issues, harvests, and journal notes as you go.
            </p>
          </div>
          <ArrowRight
            size={18}
            className="relative shrink-0 text-white/70 group-hover:text-white transition"
          />
        </button>
      )}

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

      {/* "What can I grow right now?" — personalised, hemisphere-aware
          picks for this ISO week. Especially valuable for new gardeners
          with an empty Shed — it's their "where do I start" answer. */}
      <SeasonalPicksCard homeId={homeId} aiEnabled={aiEnabled} isPremium={isPremium} variant="dashboard" />

      {/* Two-column layout: stats left, tasks right — stacks on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left column — weekly stats */}
        <div className="lg:col-span-7">
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
            stats.garden.totalPlants === 0 ? (
              <EmptyGardenPanel />
            ) : (
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
                {snapshotOpen && <StatsPanel stats={stats} homeId={homeId} />}
              </div>
            )
          ) : !error ? (
            <div className="flex items-center justify-center py-20 text-rhozly-on-surface/30 text-sm font-bold">
              No data available yet.
            </div>
          ) : null}
        </div>

        {/* Right column — today's tasks */}
        <div className="lg:col-span-5">
          <TasksPanel homeId={homeId} />
        </div>
      </div>
    </div>
  );
}
