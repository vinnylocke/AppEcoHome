import React from "react";
import { Sprout, ListChecks, MapPin, Flower2, AlertCircle, ShoppingCart, Sprout as SeedIcon, FolderKanban, Search, CloudSun, BellRing } from "lucide-react";

/**
 * Renders an inline card inside the chat for the result of an
 * agent tool call. Phase 1 covers the 13 read tools — each picks
 * its own iconography + summary format. Falls back to a debug
 * dump for unknown tools so we never silently swallow data.
 */

interface Props {
  tool: string;
  summary: string;
  payload: any;
}

export default function ToolResultCard({ tool, summary, payload }: Props) {
  const renderer = RENDERERS[tool];
  return (
    <div
      data-testid={`tool-result-${tool}`}
      className="mt-2 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/15 px-3 py-2.5 text-xs space-y-2"
    >
      <div className="flex items-center gap-2 text-rhozly-on-surface/60 font-bold uppercase tracking-widest text-[10px]">
        <IconFor tool={tool} />
        {summary}
      </div>
      {renderer ? renderer(payload) : <Fallback payload={payload} />}
    </div>
  );
}

function IconFor({ tool }: { tool: string }) {
  const cls = "text-rhozly-primary";
  switch (tool) {
    case "list_plants": return <Sprout size={12} className={cls} />;
    case "list_tasks": return <ListChecks size={12} className={cls} />;
    case "list_blueprints": return <ListChecks size={12} className={cls} />;
    case "list_locations":
    case "list_areas": return <MapPin size={12} className={cls} />;
    case "list_ailments": return <AlertCircle size={12} className={cls} />;
    case "list_shopping_lists": return <ShoppingCart size={12} className={cls} />;
    case "list_seed_packets": return <SeedIcon size={12} className={cls} />;
    case "list_plans": return <FolderKanban size={12} className={cls} />;
    case "search_plant_database":
    case "get_plant_details": return <Search size={12} className={cls} />;
    case "get_weather_now": return <CloudSun size={12} className={cls} />;
    case "get_overdue_summary": return <BellRing size={12} className={cls} />;
    default: return <Flower2 size={12} className={cls} />;
  }
}

type Renderer = (payload: any) => React.ReactNode;

const RENDERERS: Record<string, Renderer> = {
  list_plants: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).slice(0, 12).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.identifier || r.plant_name || "Unnamed"}</span>
          <span className="text-[10px] font-bold text-rhozly-on-surface/45 truncate">
            {r.area_name ?? "unassigned"} · {r.status}
          </span>
        </li>
      ))}
      {rows && rows.length > 12 && (
        <li className="text-[10px] text-rhozly-on-surface/40">+ {rows.length - 12} more</li>
      )}
    </ul>
  ),

  list_tasks: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).slice(0, 10).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.title}</span>
          <span className="text-[10px] font-bold text-rhozly-on-surface/45 truncate">
            {r.type} · {r.due_date}
          </span>
        </li>
      ))}
      {rows && rows.length > 10 && (
        <li className="text-[10px] text-rhozly-on-surface/40">+ {rows.length - 10} more</li>
      )}
    </ul>
  ),

  list_blueprints: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).slice(0, 10).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.title}</span>
          <span className="text-[10px] font-bold text-rhozly-on-surface/45">
            {r.task_type} · every {r.frequency_days}d
          </span>
        </li>
      ))}
    </ul>
  ),

  list_locations: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.name}</span>
          <span className="text-[10px] font-bold text-rhozly-on-surface/45">
            {r.is_outside ? "outdoor" : "indoor"}
          </span>
        </li>
      ))}
    </ul>
  ),

  list_areas: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).slice(0, 12).map((r) => (
        <li key={r.id} className="font-bold text-rhozly-on-surface truncate">{r.name}</li>
      ))}
    </ul>
  ),

  list_ailments: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.name}</span>
          <span className="text-[10px] font-bold text-rhozly-on-surface/45">{r.type}</span>
        </li>
      ))}
    </ul>
  ),

  list_shopping_lists: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.name}</span>
          <span className="text-[10px] font-bold text-rhozly-on-surface/45">{r.items?.length ?? 0} items</span>
        </li>
      ))}
    </ul>
  ),

  list_seed_packets: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.plant_name}{r.variety ? ` — ${r.variety}` : ""}</span>
          {r.sow_by_date && (
            <span className="text-[10px] font-bold text-rhozly-on-surface/45">sow by {r.sow_by_date}</span>
          )}
        </li>
      ))}
    </ul>
  ),

  list_plans: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.name}</span>
          <span className="text-[10px] font-bold text-rhozly-on-surface/45">{r.status}</span>
        </li>
      ))}
    </ul>
  ),

  search_plant_database: (rows: any[]) => (
    <ul className="space-y-1">
      {(rows ?? []).slice(0, 8).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-rhozly-on-surface">
          <span className="font-bold truncate">{r.common_name}</span>
          <span className="text-[10px] italic font-bold text-rhozly-on-surface/45 truncate">
            {Array.isArray(r.scientific_name) ? r.scientific_name[0] : r.scientific_name}
          </span>
        </li>
      ))}
    </ul>
  ),

  get_plant_details: (row: any) => {
    if (!row) return <span className="text-rhozly-on-surface/45">No details available.</span>;
    return (
      <div className="space-y-1">
        <p className="font-bold text-rhozly-on-surface">{row.common_name}</p>
        <p className="text-[10px] italic text-rhozly-on-surface/50">
          {Array.isArray(row.scientific_name) ? row.scientific_name[0] : row.scientific_name}
        </p>
        {row.cycle && <p className="text-rhozly-on-surface/70">Cycle: {row.cycle}</p>}
        {row.watering && <p className="text-rhozly-on-surface/70">Watering: {row.watering}</p>}
      </div>
    );
  },

  get_weather_now: (data: { snapshot: any; alerts: any[] }) => {
    if (!data?.snapshot) {
      return <span className="text-rhozly-on-surface/45">No weather data for this home.</span>;
    }
    const daily = data.snapshot?.daily;
    const today = daily?.temperature_2m_max?.[0];
    return (
      <div className="space-y-1">
        {today != null && (
          <p className="font-bold text-rhozly-on-surface">Today: max {today}°C</p>
        )}
        {data.alerts.length > 0 && (
          <p className="text-rhozly-on-surface/70">
            {data.alerts.length} active alert{data.alerts.length === 1 ? "" : "s"}.
          </p>
        )}
      </div>
    );
  },

  get_overdue_summary: (data: any) => {
    const overdue = data?.overdue_tasks ?? [];
    const ailments = data?.active_ailments ?? [];
    const alerts = data?.weather_alerts ?? [];
    if (overdue.length === 0 && ailments.length === 0 && alerts.length === 0) {
      return <span className="text-rhozly-on-surface/45">All caught up — nothing overdue.</span>;
    }
    return (
      <ul className="space-y-1 text-rhozly-on-surface">
        {overdue.length > 0 && <li>• {overdue.length} overdue task{overdue.length === 1 ? "" : "s"}</li>}
        {ailments.length > 0 && <li>• {ailments.length} active ailment{ailments.length === 1 ? "" : "s"}</li>}
        {alerts.length > 0 && <li>• {alerts.length} weather alert{alerts.length === 1 ? "" : "s"}</li>}
      </ul>
    );
  },
};

function Fallback({ payload }: { payload: any }) {
  return (
    <pre className="text-[10px] text-rhozly-on-surface/45 overflow-x-auto">
      {JSON.stringify(payload, null, 2).slice(0, 600)}
    </pre>
  );
}
