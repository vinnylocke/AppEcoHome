// Recursive editor for a unified-automation condition tree. Each node is a
// controlled component: it renders itself and calls `onChange` with its updated
// subtree, or `onDelete` to remove itself from its parent.

import { Plus, Trash2, FolderPlus } from "lucide-react";
import {
  newLeaf, newGroup, WEEKDAYS, WEEKDAY_LABELS,
  type ConditionNode, type LeafKind, type Weekday, type SensorMetric, type Comparator, type AggMode,
} from "../../lib/conditionTree";
import { splitMmDd, makeMmDd, daysInMonth, MONTH_LABELS, seasonPreset, type SeasonPreset } from "../../lib/dateRangeLeaf";
import type { Hemisphere } from "../../lib/seasonal";

export interface BuilderCtx {
  sensors: Array<{ id: string; name: string }>;
  blueprints: Array<{ id: string; title: string }>;
  hemisphere: Hemisphere;
}

const LEAF_KINDS: Array<{ id: LeafKind; label: string }> = [
  { id: "sensor", label: "Sensor reading" },
  { id: "time", label: "Time / day" },
  { id: "date_range", label: "Date range" },
  { id: "task_due", label: "Task due" },
  { id: "weather", label: "Weather" },
];

const SEASONS: SeasonPreset[] = ["spring", "summer", "autumn", "winter"];

function MonthDayPicker({ value, onChange, testId }: { value: string; onChange: (mmdd: string) => void; testId: string }) {
  const { month, day } = splitMmDd(value);
  return (
    <span className="inline-flex items-center gap-1">
      <select data-testid={`${testId}-month`} value={month} onChange={(e) => onChange(makeMmDd(Number(e.target.value), day))} className={inputCls}>
        {MONTH_LABELS.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}
      </select>
      <select data-testid={`${testId}-day`} value={day} onChange={(e) => onChange(makeMmDd(month, Number(e.target.value)))} className={inputCls}>
        {Array.from({ length: daysInMonth(month) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </span>
  );
}

function DateRangeFields({ node, onChange, ctx }: { node: Extract<ConditionNode, { kind: "date_range" }>; onChange: (n: ConditionNode) => void; ctx: BuilderCtx }) {
  const set = (p: Partial<typeof node>) => onChange({ ...node, ...p });
  const wraps = node.to < node.from; // e.g. 1 Dec → 28 Feb
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">from</span>
        <MonthDayPicker value={node.from} onChange={(v) => set({ from: v })} testId="date-range-from" />
        <span className="text-gray-500">to</span>
        <MonthDayPicker value={node.to} onChange={(v) => set({ to: v })} testId="date-range-to" />
        {wraps && <span className="text-[11px] text-amber-600 font-semibold">(into next year)</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SEASONS.map((s) => (
          <button key={s} type="button" data-testid={`season-${s}`}
            onClick={() => { const r = seasonPreset(s, ctx.hemisphere); set({ from: r.from, to: r.to }); }}
            className="px-2 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-700 capitalize">
            {s}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">Repeats every year. Season presets use your hemisphere. An end month/day before the start wraps over New Year.</p>
    </div>
  );
}

function NegateToggle({ negate, onChange }: { negate: boolean; onChange: (n: boolean) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-bold">
      <button type="button" data-testid="cond-is" onClick={() => onChange(false)}
        className={`px-2 py-0.5 rounded-md ${!negate ? "bg-white shadow text-emerald-700" : "text-gray-500"}`}>is</button>
      <button type="button" data-testid="cond-isnt" onClick={() => onChange(true)}
        className={`px-2 py-0.5 rounded-md ${negate ? "bg-white shadow text-rose-700" : "text-gray-500"}`}>isn't</button>
    </div>
  );
}

const inputCls = "rounded-lg border border-gray-200 p-1.5 text-sm";

function SensorFields({ node, onChange, ctx }: { node: Extract<ConditionNode, { kind: "sensor" }>; onChange: (n: ConditionNode) => void; ctx: BuilderCtx }) {
  const set = (p: Partial<typeof node>) => onChange({ ...node, ...p });
  const toggleSensor = (id: string) => {
    const cur = node.sensorIds ?? [];
    set({ sensorIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select data-testid="sensor-metric" value={node.metric} onChange={(e) => set({ metric: e.target.value as SensorMetric })} className={inputCls}>
          <option value="soil_moisture">Moisture</option>
          <option value="soil_temp_c">Soil temp</option>
          <option value="soil_ec">EC</option>
        </select>
        <select data-testid="sensor-cmp" value={node.comparator} onChange={(e) => set({ comparator: e.target.value as Comparator })} className={inputCls}>
          <option value="<">&lt;</option><option value="<=">≤</option><option value=">">&gt;</option><option value=">=">≥</option>
        </select>
        <input data-testid="sensor-value" type="number" value={node.value} onChange={(e) => set({ value: Number(e.target.value) })} className={`${inputCls} w-20`} />
        <select data-testid="sensor-agg" value={node.agg} onChange={(e) => set({ agg: e.target.value as AggMode })} className={inputCls}>
          <option value="any">any sensor</option><option value="all">all sensors</option><option value="average">average</option>
        </select>
      </div>
      {ctx.sensors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ctx.sensors.map((s) => {
            const on = (node.sensorIds ?? []).includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggleSensor(s.id)}
                className={`px-2 py-1 rounded-lg text-xs font-medium border ${on ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600"}`}>
                {s.name}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-400">Pick sensors, or leave blank to use the area's soil sensors.</p>
    </div>
  );
}

function TimeFields({ node, onChange }: { node: Extract<ConditionNode, { kind: "time" }>; onChange: (n: ConditionNode) => void }) {
  const setDay = (d: Weekday, slots: { start: string; end: string }[]) =>
    onChange({ ...node, schedule: { ...node.schedule, [d]: slots } });
  return (
    <div className="space-y-1.5">
      {WEEKDAYS.map((d) => {
        const slots = node.schedule[d] ?? [];
        return (
          <div key={d} className="flex items-start gap-2">
            <span className="w-9 pt-1.5 text-xs font-bold text-gray-500">{WEEKDAY_LABELS[d]}</span>
            <div className="flex-1 space-y-1">
              {slots.length === 0 && <span className="text-xs text-gray-300">off</span>}
              {slots.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1">
                  <input type="time" value={s.start} onChange={(e) => setDay(d, slots.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} className={`${inputCls} flex-1 min-w-0`} />
                  <span className="text-gray-400 text-xs shrink-0">–</span>
                  <input type="time" value={s.end === "24:00" ? "00:00" : s.end} onChange={(e) => setDay(d, slots.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} className={`${inputCls} flex-1 min-w-0`} />
                  <button type="button" onClick={() => setDay(d, slots.filter((_, j) => j !== i))} className="text-gray-300 hover:text-rose-500 shrink-0"><Trash2 size={13} /></button>
                </div>
              ))}
              <button type="button" data-testid={`time-add-${d}`} onClick={() => setDay(d, [...slots, { start: "08:00", end: "20:00" }])}
                className="text-[11px] font-bold text-emerald-600 hover:underline">+ slot</button>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-gray-400">Times are in your local timezone. An end before the start runs overnight.</p>
    </div>
  );
}

function TaskFields({ node, onChange, ctx }: { node: Extract<ConditionNode, { kind: "task_due" }>; onChange: (n: ConditionNode) => void; ctx: BuilderCtx }) {
  const toggle = (id: string) => {
    const cur = node.blueprintIds;
    onChange({ ...node, blueprintIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  if (ctx.blueprints.length === 0) return <p className="text-xs text-gray-400">No recurring tasks to link.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ctx.blueprints.map((b) => {
        const on = node.blueprintIds.includes(b.id);
        return (
          <button key={b.id} type="button" onClick={() => toggle(b.id)}
            className={`px-2 py-1 rounded-lg text-xs font-medium border ${on ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600"}`}>
            {b.title}
          </button>
        );
      })}
    </div>
  );
}

function WeatherFields({ node, onChange }: { node: Extract<ConditionNode, { kind: "weather" }>; onChange: (n: ConditionNode) => void }) {
  const set = (p: Partial<typeof node>) => onChange({ ...node, ...p });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select data-testid="weather-type" value={node.type} onChange={(e) => set({ type: e.target.value as "rain_forecast" | "heatwave" })} className={inputCls}>
        <option value="rain_forecast">Rain forecast</option>
        <option value="heatwave">Heatwave</option>
      </select>
      {node.type === "rain_forecast" ? (
        <>
          <label className="text-xs text-gray-500">≥<input type="number" value={node.thresholdMm ?? 5} onChange={(e) => set({ thresholdMm: Number(e.target.value) })} className={`${inputCls} w-16 ml-1`} />mm</label>
          <label className="text-xs text-gray-500">conf ≥<input type="number" value={node.minProbability ?? 60} onChange={(e) => set({ minProbability: Number(e.target.value) })} className={`${inputCls} w-16 ml-1`} />%</label>
        </>
      ) : (
        <label className="text-xs text-gray-500">≥<input type="number" value={node.thresholdC ?? 28} onChange={(e) => set({ thresholdC: Number(e.target.value) })} className={`${inputCls} w-16 ml-1`} />°C</label>
      )}
    </div>
  );
}

export default function ConditionNodeEditor({ node, onChange, onDelete, ctx, depth = 0 }: {
  node: ConditionNode; onChange: (n: ConditionNode) => void; onDelete?: () => void; ctx: BuilderCtx; depth?: number;
}) {
  if (node.kind === "group") {
    const setChild = (i: number, child: ConditionNode) => onChange({ ...node, children: node.children.map((c, j) => j === i ? child : c) });
    const delChild = (i: number) => onChange({ ...node, children: node.children.filter((_, j) => j !== i) });
    return (
      <div className={`rounded-xl border ${depth === 0 ? "border-gray-200" : "border-gray-200 bg-gray-50/50"} p-3 space-y-2`} data-testid="cond-group">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-black">
            <button type="button" data-testid="group-and" onClick={() => onChange({ ...node, op: "and" })} className={`px-2.5 py-0.5 rounded-md ${node.op === "and" ? "bg-white shadow text-emerald-700" : "text-gray-500"}`}>ALL</button>
            <button type="button" data-testid="group-or" onClick={() => onChange({ ...node, op: "or" })} className={`px-2.5 py-0.5 rounded-md ${node.op === "or" ? "bg-white shadow text-emerald-700" : "text-gray-500"}`}>ANY</button>
          </div>
          <span className="text-xs text-gray-400">{node.op === "and" ? "of these must be true" : "of these can be true"}</span>
          <div className="ml-auto flex items-center gap-2">
            <NegateToggle negate={!!node.negate} onChange={(n) => onChange({ ...node, negate: n })} />
            {onDelete && <button type="button" onClick={onDelete} className="text-gray-300 hover:text-rose-500"><Trash2 size={15} /></button>}
          </div>
        </div>
        <div className="space-y-2 pl-2 border-l-2 border-gray-100">
          {node.children.map((c, i) => (
            <ConditionNodeEditor key={i} node={c} ctx={ctx} depth={depth + 1} onChange={(n) => setChild(i, n)} onDelete={() => delChild(i)} />
          ))}
          {node.children.length === 0 && <p className="text-xs text-gray-300 py-1">No conditions yet.</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" data-testid="add-condition" onClick={() => onChange({ ...node, children: [...node.children, newLeaf("sensor")] })}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"><Plus size={13} /> Condition</button>
          {depth < 2 && (
            <button type="button" data-testid="add-group" onClick={() => onChange({ ...node, children: [...node.children, newGroup("and")] })}
              className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:underline"><FolderPlus size={13} /> Group</button>
          )}
        </div>
      </div>
    );
  }

  // Leaf
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2 bg-white" data-testid={`cond-leaf-${node.kind}`}>
      <div className="flex items-center gap-2">
        <select data-testid="leaf-kind" value={node.kind} onChange={(e) => onChange(newLeaf(e.target.value as LeafKind))} className={`${inputCls} font-semibold min-w-0`}>
          {LEAF_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <NegateToggle negate={!!node.negate} onChange={(n) => onChange({ ...node, negate: n })} />
          {onDelete && <button type="button" onClick={onDelete} className="text-gray-300 hover:text-rose-500"><Trash2 size={15} /></button>}
        </div>
      </div>
      {node.kind === "sensor" && <SensorFields node={node} onChange={onChange} ctx={ctx} />}
      {node.kind === "time" && <TimeFields node={node} onChange={onChange} />}
      {node.kind === "date_range" && <DateRangeFields node={node} onChange={onChange} ctx={ctx} />}
      {node.kind === "task_due" && <TaskFields node={node} onChange={onChange} ctx={ctx} />}
      {node.kind === "weather" && <WeatherFields node={node} onChange={onChange} />}
    </div>
  );
}
