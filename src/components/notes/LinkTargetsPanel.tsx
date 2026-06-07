import React, { useEffect, useMemo, useState } from "react";
import { X, Search, Plus, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  NOTE_TARGET_LABELS,
  type NoteLinkRef,
  type NoteTargetType,
} from "../../lib/noteHelpers";

interface Props {
  homeId: string;
  value: NoteLinkRef[];
  onChange: (next: NoteLinkRef[]) => void;
}

interface PickerOption {
  target_type: NoteTargetType;
  target_id: string;
  label: string;
  sub?: string;
}

// ─── LinkTargetsPanel ──────────────────────────────────────────────────
//
// Multi-select picker for linking a note to anything in the home — plant
// instances, locations, areas, plans, ailments, seed packets, and the
// global plant catalogue. Loads options lazily when the user opens the
// "Add link" dropdown.

const TYPE_ORDER: NoteTargetType[] = [
  "plant_instance", "location", "area", "plan", "ailment", "seed_packet", "plant",
];

async function loadOptions(homeId: string): Promise<PickerOption[]> {
  // Fire all queries in parallel. Each is a thin SELECT scoped to the
  // home (plants is global — kept tiny by limit).
  const [
    instances,
    locations,
    areas,
    plans,
    ailments,
    seeds,
  ] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, plant_name, identifier")
      .eq("home_id", homeId)
      .neq("status", "Archived")
      .order("plant_name", { ascending: true })
      .limit(500),
    supabase
      .from("locations")
      .select("id, name")
      .eq("home_id", homeId)
      .order("name", { ascending: true })
      .limit(100),
    supabase
      .from("areas")
      .select("id, name, location_id")
      .eq("home_id", homeId)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("plans")
      .select("id, name, status")
      .eq("home_id", homeId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("ailments_watchlist")
      .select("id, common_name, scientific_name")
      .eq("home_id", homeId)
      .is("archived_at", null)
      .order("common_name", { ascending: true })
      .limit(200),
    supabase
      .from("seed_packets")
      .select("id, label, scientific_name")
      .eq("home_id", homeId)
      .order("label", { ascending: true })
      .limit(200),
  ]);

  const out: PickerOption[] = [];
  for (const r of instances.data ?? []) {
    out.push({
      target_type: "plant_instance",
      target_id: r.id as string,
      label: (r.plant_name as string) ?? "Plant",
      sub: (r.identifier as string | null) ?? undefined,
    });
  }
  for (const r of locations.data ?? []) {
    out.push({ target_type: "location", target_id: r.id as string, label: r.name as string });
  }
  for (const r of areas.data ?? []) {
    out.push({ target_type: "area", target_id: r.id as string, label: r.name as string });
  }
  for (const r of plans.data ?? []) {
    out.push({ target_type: "plan", target_id: r.id as string, label: r.name as string, sub: (r.status as string | null) ?? undefined });
  }
  for (const r of ailments.data ?? []) {
    out.push({ target_type: "ailment", target_id: r.id as string, label: (r.common_name as string) ?? (r.scientific_name as string) ?? "Ailment" });
  }
  for (const r of seeds.data ?? []) {
    out.push({ target_type: "seed_packet", target_id: r.id as string, label: (r.label as string) ?? (r.scientific_name as string) ?? "Seed packet" });
  }
  return out;
}

export default function LinkTargetsPanel({ homeId, value, onChange }: Props) {
  const [opening, setOpening] = useState(false);
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!opening || options.length > 0) return;
    setLoadingOptions(true);
    loadOptions(homeId)
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setLoadingOptions(false));
  }, [opening, homeId, options.length]);

  // Lookup a friendly label for each value (chip rendering).
  const labelLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of options) map.set(`${o.target_type}:${o.target_id}`, o.label);
    return map;
  }, [options]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set(value.map((v) => `${v.target_type}:${v.target_id}`));
    const available = options.filter((o) => !taken.has(`${o.target_type}:${o.target_id}`));
    if (!q) return available.slice(0, 50);
    return available
      .filter((o) =>
        o.label.toLowerCase().includes(q)
        || (o.sub?.toLowerCase().includes(q) ?? false)
        || NOTE_TARGET_LABELS[o.target_type].toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [options, value, query]);

  const grouped = useMemo(() => {
    const groups = new Map<NoteTargetType, PickerOption[]>();
    for (const o of filteredOptions) {
      const arr = groups.get(o.target_type) ?? [];
      arr.push(o);
      groups.set(o.target_type, arr);
    }
    return TYPE_ORDER.flatMap((t) => groups.has(t) ? [{ type: t, items: groups.get(t)! }] : []);
  }, [filteredOptions]);

  const removeChip = (ref: NoteLinkRef) => {
    onChange(value.filter((v) => !(v.target_type === ref.target_type && v.target_id === ref.target_id)));
  };

  const addChip = (opt: PickerOption) => {
    onChange([...value, { target_type: opt.target_type, target_id: opt.target_id }]);
    setQuery("");
  };

  return (
    <div className="space-y-2" data-testid="link-targets-panel">
      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 && (
          <span className="text-[11px] font-bold text-rhozly-on-surface/45">
            No links yet — add a plant, area, plan or ailment to find this note from those screens.
          </span>
        )}
        {value.map((ref) => {
          const key = `${ref.target_type}:${ref.target_id}`;
          const label = labelLookup.get(key) ?? `${NOTE_TARGET_LABELS[ref.target_type]}`;
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rhozly-primary/10 text-rhozly-primary text-[11px] font-black"
            >
              <span className="opacity-60">{NOTE_TARGET_LABELS[ref.target_type]}:</span>
              {label}
              <button
                type="button"
                onClick={() => removeChip(ref)}
                className="ml-0.5 p-0.5 rounded hover:bg-rhozly-primary/15"
                aria-label={`Remove link to ${label}`}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setOpening((p) => !p)}
        className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/65 hover:text-rhozly-primary"
        data-testid="link-targets-toggle"
      >
        <Plus size={12} />
        Link to…
        <ChevronDown size={10} className={`transition-transform ${opening ? "rotate-180" : ""}`} />
      </button>

      {opening && (
        <div className="border border-rhozly-outline/15 rounded-xl bg-rhozly-surface-low/40 p-2 space-y-1.5 max-h-72 overflow-y-auto">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plants, areas, plans, ailments…"
              className="w-full text-xs pl-7 pr-2 py-1.5 rounded-lg bg-white border border-rhozly-outline/15 outline-none focus:ring-2 focus:ring-rhozly-primary/15"
              data-testid="link-targets-search"
            />
          </div>
          {loadingOptions && (
            <p className="text-[10px] text-rhozly-on-surface/50 px-1">Loading options…</p>
          )}
          {!loadingOptions && grouped.length === 0 && (
            <p className="text-[10px] text-rhozly-on-surface/50 px-1">
              {query ? `No matches for "${query}".` : "Nothing else to link."}
            </p>
          )}
          {grouped.map((group) => (
            <div key={group.type} className="space-y-0.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1">
                {NOTE_TARGET_LABELS[group.type]}
              </p>
              {group.items.map((opt) => {
                const key = `${opt.target_type}:${opt.target_id}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => addChip(opt)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white text-xs font-semibold text-rhozly-on-surface flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.sub && (
                      <span className="shrink-0 text-[10px] font-bold text-rhozly-on-surface/45">{opt.sub}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
