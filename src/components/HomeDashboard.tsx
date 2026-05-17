import React, { useState } from "react";
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
} from "lucide-react";
import { useHomeDashboardStats, type HomeDashboardStats } from "../hooks/useHomeDashboardStats";
import TaskList from "./TaskList";

interface Props {
  homeId: string;
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

function StatsPanel({ stats, homeId }: { stats: HomeDashboardStats; homeId: string }) {
  const navigate = useNavigate();
  const [membersExpanded, setMembersExpanded] = useState(false);

  const { tasks, garden, weather, automations, additional, dayStrip } = stats;

  const yieldSummary = Object.entries(garden.totalYieldByUnit)
    .map(([unit, val]) => `${val % 1 === 0 ? val : val.toFixed(1)}${unit}`)
    .join(" · ") || "—";

  return (
    <div className="space-y-6">
      {/* ── Tasks This Week ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<CheckCircle2 size={16} />} title="Tasks This Week" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatCard
            data-testid="dash-stat-tasks-total"
            label="Total Tasks"
            value={tasks.total}
            onClick={() => navigate("/schedule")}
          />
          <StatCard
            data-testid="dash-stat-tasks-completed"
            label="Completed"
            value={tasks.completed}
            sub={`${tasks.completionRate}% rate`}
            onClick={() => navigate("/schedule?filter=completed")}
          />
          <StatCard
            data-testid="dash-stat-tasks-overdue"
            label="Overdue"
            value={tasks.overdue}
            onClick={tasks.overdue > 0 ? () => navigate("/schedule?filter=overdue") : undefined}
          />
          <StatCard
            data-testid="dash-stat-tasks-pending"
            label="Pending"
            value={tasks.pending}
            onClick={tasks.pending > 0 ? () => navigate("/schedule?filter=pending") : undefined}
          />
          <StatCard
            data-testid="dash-stat-tasks-auto"
            label="Done automatically"
            value={tasks.autoCompleted}
            onClick={tasks.autoCompleted > 0 ? () => navigate("/schedule?filter=automated") : undefined}
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
            const pending = day.total - day.completed;
            return (
              <button
                key={day.date}
                data-testid={`dash-day-${day.date}`}
                onClick={() => navigate(`/dashboard?view=calendar&date=${day.date}`)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl min-w-[52px] shrink-0 border transition-all ${
                  day.isToday
                    ? "bg-rhozly-primary text-white border-rhozly-primary shadow-md"
                    : day.isPast
                    ? "bg-rhozly-surface-low border-rhozly-outline/10 opacity-60"
                    : "bg-rhozly-surface-low border-rhozly-outline/10 hover:border-rhozly-primary/30"
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest ${day.isToday ? "text-white/80" : "text-rhozly-on-surface/40"}`}>
                  {label}
                </span>
                <span className={`text-lg font-black leading-none ${day.isToday ? "text-white" : "text-rhozly-on-surface"}`}>
                  {day.isPast ? day.completed : pending || day.total}
                </span>
                <span className={`text-[9px] font-bold ${day.isToday ? "text-white/70" : "text-rhozly-on-surface/40"}`}>
                  {day.isPast ? `of ${day.total}` : "tasks"}
                </span>
              </button>
            );
          })}
        </div>
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
            label="Plant Doctor"
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

export default function HomeDashboard({ homeId }: Props) {
  const { stats, loading, error, refresh, weekStart, weekEnd } = useHomeDashboardStats(homeId);
  const weekRange = formatWeekRange(weekStart, weekEnd);

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
              <StatsPanel stats={stats} homeId={homeId} />
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
