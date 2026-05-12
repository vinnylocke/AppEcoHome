import React, { useState } from "react";
import {
  CheckCircle2,
  ShoppingBasket,
  Cloud,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { IconPlant, IconPrune, IconAI } from "../constants/icons";
import { useGardenReport } from "../hooks/useGardenReport";
import type { MonthStats, MonthlyReport, YearlyReport } from "../hooks/useGardenReport";
import type { TaskCategory } from "../constants/taskCategories";

interface Props {
  homeId: string;
}

// ─── Colour palette per task type ────────────────────────────────────────────

const TYPE_COLOR: Record<TaskCategory, string> = {
  Watering: "#60a5fa",
  Pruning: "#a78bfa",
  Planting: "#4ade80",
  Harvesting: "#fb923c",
  Maintenance: "#94a3b8",
};

const TYPE_BG: Record<TaskCategory, string> = {
  Watering: "bg-blue-100 text-blue-700",
  Pruning: "bg-violet-100 text-violet-700",
  Planting: "bg-green-100 text-green-700",
  Harvesting: "bg-orange-100 text-orange-700",
  Maintenance: "bg-slate-100 text-slate-600",
};

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Delta badge ─────────────────────────────────────────────────────────────

function DeltaBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-rhozly-on-surface/30">
        <Minus size={9} /> same
      </span>
    );
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-black ${
        value > 0 ? "text-green-600" : "text-red-500"
      }`}
    >
      {value > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  delta,
  accent,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta?: number | null;
  accent: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm p-4 flex flex-col gap-1.5"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent}`}>
        {icon}
      </div>
      <p className="text-2xl font-black text-rhozly-on-surface leading-none mt-1">
        {value}
      </p>
      <p className="text-[11px] font-bold text-rhozly-on-surface/50">{label}</p>
      {delta !== undefined && (
        <div className="mt-0.5">
          <DeltaBadge value={delta} />
        </div>
      )}
    </div>
  );
}

// ─── Horizontal bar chart for task type split ─────────────────────────────────

function TaskTypeBars({ tasksByType, total }: { tasksByType: Record<TaskCategory, number>; total: number }) {
  if (total === 0) return null;
  const types: TaskCategory[] = ["Watering", "Planting", "Harvesting", "Pruning", "Maintenance"];
  return (
    <div className="space-y-2">
      {types.map((type) => {
        const count = tasksByType[type] ?? 0;
        if (count === 0) return null;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={type} className="flex items-center gap-2">
            <span className="text-[10px] font-black text-rhozly-on-surface/50 w-20 shrink-0">
              {type}
            </span>
            <div className="flex-1 h-2 bg-rhozly-surface-low rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: TYPE_COLOR[type] }}
              />
            </div>
            <span className="text-[10px] font-black text-rhozly-on-surface/60 w-8 text-right shrink-0">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month navigator ──────────────────────────────────────────────────────────

function MonthNavigator({
  date,
  onChange,
}: {
  date: Date;
  onChange: (d: Date) => void;
}) {
  const label = date.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const prev = () => onChange(new Date(date.getFullYear(), date.getMonth() - 1, 1));
  const next = () => onChange(new Date(date.getFullYear(), date.getMonth() + 1, 1));
  const isCurrentMonth =
    date.getMonth() === new Date().getMonth() &&
    date.getFullYear() === new Date().getFullYear();

  return (
    <div className="flex items-center justify-between" data-testid="reports-month-navigator">
      <button
        data-testid="reports-month-prev"
        onClick={prev}
        className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-rhozly-surface-low transition-colors"
      >
        <ChevronLeft size={18} className="text-rhozly-on-surface/60" />
      </button>
      <span className="text-base font-black text-rhozly-on-surface">{label}</span>
      <button
        data-testid="reports-month-next"
        onClick={next}
        disabled={isCurrentMonth}
        className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-rhozly-surface-low transition-colors disabled:opacity-30"
      >
        <ChevronRight size={18} className="text-rhozly-on-surface/60" />
      </button>
    </div>
  );
}

// ─── Year navigator ───────────────────────────────────────────────────────────

function YearNavigator({
  year,
  onChange,
}: {
  year: number;
  onChange: (y: number) => void;
}) {
  const currentYear = new Date().getFullYear();
  return (
    <div className="flex items-center justify-between" data-testid="reports-year-navigator">
      <button
        data-testid="reports-year-prev"
        onClick={() => onChange(year - 1)}
        className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-rhozly-surface-low transition-colors"
      >
        <ChevronLeft size={18} className="text-rhozly-on-surface/60" />
      </button>
      <span className="text-base font-black text-rhozly-on-surface">{year} Year in Review</span>
      <button
        data-testid="reports-year-next"
        onClick={() => onChange(year + 1)}
        disabled={year >= currentYear}
        className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-rhozly-surface-low transition-colors disabled:opacity-30"
      >
        <ChevronRight size={18} className="text-rhozly-on-surface/60" />
      </button>
    </div>
  );
}

// ─── Monthly bar chart (SVG) ──────────────────────────────────────────────────

function MonthBarChart({
  byMonth,
}: {
  byMonth: Array<{ month: Date; tasksCompleted: number }>;
}) {
  const max = Math.max(...byMonth.map((m) => m.tasksCompleted), 1);
  const W = 320;
  const H = 80;
  const barW = Math.floor((W - 24) / 12);
  const gap = 2;
  const now = new Date();

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
        Tasks Completed per Month
      </p>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="w-full"
        aria-label="Tasks completed per month bar chart"
      >
        {byMonth.map((m, i) => {
          const h = Math.max(2, Math.round((m.tasksCompleted / max) * H));
          const x = 12 + i * (barW + gap);
          const y = H - h;
          const isCurrent =
            m.month.getMonth() === now.getMonth() &&
            m.month.getFullYear() === now.getFullYear();
          const isFuture = m.month > now;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={2}
                fill={
                  isFuture
                    ? "#e2e8f0"
                    : isCurrent
                    ? "#4ade80"
                    : "#86efac"
                }
              />
              {m.tasksCompleted > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 3}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#64748b"
                  fontWeight="bold"
                >
                  {m.tasksCompleted}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={H + 14}
                textAnchor="middle"
                fontSize={8}
                fill={isCurrent ? "#16a34a" : "#94a3b8"}
                fontWeight={isCurrent ? "900" : "600"}
              >
                {MONTH_ABBR[m.month.getMonth()]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Category totals bar (for yearly) ─────────────────────────────────────────

function CategoryTotals({ tasksByType, total }: { tasksByType: Record<TaskCategory, number>; total: number }) {
  if (total === 0) return null;
  const types: TaskCategory[] = ["Watering", "Planting", "Harvesting", "Pruning", "Maintenance"];
  const maxVal = Math.max(...types.map((t) => tasksByType[t] ?? 0), 1);

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-3">
        By Category
      </p>
      <div className="space-y-2.5">
        {types.map((type) => {
          const count = tasksByType[type] ?? 0;
          if (count === 0) return null;
          const pct = Math.round((count / maxVal) * 100);
          return (
            <div key={type} className="flex items-center gap-2">
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${TYPE_BG[type]} w-24 text-center shrink-0`}
              >
                {type}
              </span>
              <div className="flex-1 h-2.5 bg-rhozly-surface-low rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: TYPE_COLOR[type] }}
                />
              </div>
              <span className="text-xs font-black text-rhozly-on-surface/70 w-8 text-right shrink-0">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 size={28} className="animate-spin text-rhozly-primary" />
      <p className="text-sm font-bold text-rhozly-on-surface/40">Loading report…</p>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-rhozly-on-surface/40">
      <div className="w-14 h-14 rounded-full bg-rhozly-surface-low flex items-center justify-center">
        <BarChart3 size={24} className="text-rhozly-on-surface/20" />
      </div>
      <p className="text-sm font-black text-rhozly-on-surface/50">No data yet</p>
      <p className="text-xs font-bold text-center max-w-xs">
        {label}
      </p>
    </div>
  );
}

// ─── Monthly review ───────────────────────────────────────────────────────────

function MonthlyReview({
  report,
  selectedMonth,
  onMonthChange,
}: {
  report: MonthlyReport | null;
  selectedMonth: Date;
  onMonthChange: (d: Date) => void;
}) {
  const isEmpty = report && report.tasksCompleted === 0 && report.newPlants === 0 && report.harvested === 0;

  return (
    <div data-testid="reports-monthly-view" className="space-y-5">
      <MonthNavigator date={selectedMonth} onChange={onMonthChange} />

      {!report ? (
        <LoadingState />
      ) : isEmpty ? (
        <EmptyState label="Complete tasks and add plants to see your monthly activity here." />
      ) : (
        <>
          {/* Tasks card */}
          <div className="bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-green-100 text-green-700 flex items-center justify-center">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
                    Tasks Completed
                  </p>
                  <p className="text-2xl font-black text-rhozly-on-surface leading-tight">
                    {report.tasksCompleted}
                  </p>
                </div>
              </div>
              <DeltaBadge value={report.delta?.tasksCompleted} />
            </div>
            {report.tasksCompleted > 0 && (
              <TaskTypeBars
                tasksByType={report.tasksByType}
                total={report.tasksCompleted}
              />
            )}
          </div>

          {/* 3-col stat grid */}
          <div className="grid grid-cols-3 gap-3" data-testid="reports-stat-grid">
            <StatCard
              testId="reports-stat-plants"
              icon={<IconPlant size={18} />}
              label="New Plants"
              value={report.newPlants}
              delta={report.delta?.newPlants}
              accent="bg-emerald-100 text-emerald-700"
            />
            <StatCard
              testId="reports-stat-pruned"
              icon={<IconPrune size={18} />}
              label="Pruned"
              value={report.pruned}
              delta={report.delta?.pruned}
              accent="bg-violet-100 text-violet-700"
            />
            <StatCard
              testId="reports-stat-harvested"
              icon={<ShoppingBasket size={18} />}
              label="Harvested"
              value={report.harvested}
              delta={report.delta?.harvested}
              accent="bg-orange-100 text-orange-700"
            />
          </div>

          {/* Weather events */}
          <div className="bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm p-4 flex items-center justify-between"
            data-testid="reports-stat-weather">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                <Cloud size={18} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  Weather Events
                </p>
                <p className="text-2xl font-black text-rhozly-on-surface leading-tight">
                  {report.weatherEvents}
                </p>
              </div>
            </div>
            <DeltaBadge value={report.delta?.weatherEvents} />
          </div>

          <p className="text-[10px] font-semibold text-rhozly-on-surface/30 text-center pb-2">
            Deltas compare to the previous month
          </p>
        </>
      )}
    </div>
  );
}

// ─── Yearly review ────────────────────────────────────────────────────────────

function YearlyReview({
  report,
  selectedYear,
  onYearChange,
}: {
  report: YearlyReport | null;
  selectedYear: number;
  onYearChange: (y: number) => void;
}) {
  const isEmpty = report && report.totals.tasksCompleted === 0 && report.totals.newPlants === 0;

  return (
    <div data-testid="reports-yearly-view" className="space-y-6">
      <YearNavigator year={selectedYear} onChange={onYearChange} />

      {!report ? (
        <LoadingState />
      ) : isEmpty ? (
        <EmptyState label="No activity recorded for this year yet. Start completing tasks to see your yearly review." />
      ) : (
        <>
          {/* Headline numbers */}
          <div className="bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm p-5"
            data-testid="reports-yearly-headlines">
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: report.totals.tasksCompleted, label: "Tasks Done", color: "text-green-600" },
                { value: report.totals.newPlants, label: "New Plants", color: "text-emerald-600" },
                { value: report.totals.harvested, label: "Harvests", color: "text-orange-500" },
              ].map(({ value, label, color }) => (
                <div key={label} className="text-center">
                  <p className={`text-3xl font-black ${color}`}>{value}</p>
                  <p className="text-[10px] font-bold text-rhozly-on-surface/50 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Secondary row */}
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-rhozly-outline/10">
              <div className="text-center">
                <p className="text-xl font-black text-violet-600">{report.totals.pruned}</p>
                <p className="text-[10px] font-bold text-rhozly-on-surface/50">Prunings</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-sky-600">{report.totals.weatherEvents}</p>
                <p className="text-[10px] font-bold text-rhozly-on-surface/50">Weather Events</p>
              </div>
            </div>
          </div>

          {/* Month bar chart */}
          <div className="bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm p-4">
            <MonthBarChart byMonth={report.byMonth} />
          </div>

          {/* Category totals */}
          {report.totals.tasksCompleted > 0 && (
            <div className="bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm p-4">
              <CategoryTotals
                tasksByType={report.totals.tasksByType}
                total={report.totals.tasksCompleted}
              />
            </div>
          )}

          {/* Highlights */}
          {report.highlights.length > 0 && (
            <div className="space-y-2" data-testid="reports-yearly-highlights">
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-1.5">
                <IconAI size={11} />
                Highlights
              </p>
              {report.highlights.map((h, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm px-4 py-3 text-sm font-bold text-rhozly-on-surface/80"
                >
                  {h}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type View = "monthly" | "yearly";

export default function GardenReports({ homeId }: Props) {
  const [view, setView] = useState<View>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  const { monthly, yearly, isLoadingMonthly, isLoadingYearly } = useGardenReport(
    homeId,
    selectedMonth,
    selectedYear,
  );

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-5">
      {/* View toggle */}
      <div
        className="flex gap-1 bg-rhozly-surface-low rounded-2xl p-1"
        data-testid="reports-view-toggle"
      >
        {(["monthly", "yearly"] as View[]).map((v) => (
          <button
            key={v}
            data-testid={`reports-toggle-${v}`}
            onClick={() => setView(v)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              view === v
                ? "bg-white shadow-sm text-rhozly-primary"
                : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70"
            }`}
          >
            <BarChart3 size={13} />
            {v === "monthly" ? "Monthly" : "Year in Review"}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === "monthly" ? (
        isLoadingMonthly && !monthly ? (
          <LoadingState />
        ) : (
          <MonthlyReview
            report={monthly}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />
        )
      ) : isLoadingYearly && !yearly ? (
        <LoadingState />
      ) : (
        <YearlyReview
          report={yearly}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
        />
      )}
    </div>
  );
}
