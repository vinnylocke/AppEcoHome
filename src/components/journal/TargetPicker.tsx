import React, { useEffect, useState } from "react";
import { Sprout, MapPin, Square, FileText, Globe } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import type { JournalTargetType } from "../../types";

/**
 * Polymorphic target picker for journal entries.
 *
 * Renders five mutually-exclusive options — Plant, Location, Area, Plan,
 * Unassigned — each with a follow-up dropdown that lists the available
 * candidates from the user's home. The parent owns the resulting state
 * and writes the appropriate `*_id` field on the journal row.
 *
 * The CHECK constraint on `plant_journals` guarantees at most one target
 * is set, so the picker enforces single-select by design (radio + one
 * sub-dropdown visible at a time).
 */

export interface TargetSelection {
  type: JournalTargetType;
  id: string | null;
  label: string | null;
}

interface CandidateOption {
  id: string;
  label: string;
}

interface Props {
  homeId: string;
  value: TargetSelection;
  onChange: (next: TargetSelection) => void;
  /**
   * Restrict the picker to a fixed type — used when the composer is
   * embedded in a context where the target is already implied (e.g. on
   * an instance edit page). Hides the type radio when set.
   */
  fixedType?: JournalTargetType;
  /**
   * Pre-resolved single candidate label, useful when `fixedType` is set
   * and we already know the target's display name.
   */
  fixedLabel?: string;
  /** Pre-resolved single candidate id, paired with fixedLabel. */
  fixedId?: string;
}

const TYPE_OPTIONS: Array<{
  type: JournalTargetType;
  label: string;
  icon: React.ReactNode;
}> = [
  { type: "plant", label: "Plant", icon: <Sprout size={14} /> },
  { type: "location", label: "Location", icon: <MapPin size={14} /> },
  { type: "area", label: "Area", icon: <Square size={14} /> },
  { type: "plan", label: "Plan", icon: <FileText size={14} /> },
  { type: "none", label: "Unassigned", icon: <Globe size={14} /> },
];

export default function TargetPicker({
  homeId,
  value,
  onChange,
  fixedType,
  fixedLabel,
  fixedId,
}: Props) {
  const activeType: JournalTargetType = fixedType ?? value.type;
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [loading, setLoading] = useState(false);

  // If a fixedType + fixedId are provided, seed the value on mount.
  useEffect(() => {
    if (fixedType && fixedId && value.id !== fixedId) {
      onChange({ type: fixedType, id: fixedId, label: fixedLabel ?? null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedType, fixedId]);

  // Load candidates for the active target type from the relevant table.
  useEffect(() => {
    if (activeType === "none") {
      setCandidates([]);
      return;
    }
    if (fixedType) {
      // Fixed mode — no sub-dropdown.
      setCandidates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let rows: CandidateOption[] = [];
        if (activeType === "plant") {
          const { data, error } = await supabase
            .from("inventory_items")
            .select("id, plant_name, nickname")
            .eq("home_id", homeId)
            .is("ended_at", null)
            .order("created_at", { ascending: false })
            .limit(500);
          if (error) throw error;
          rows = (data ?? []).map((r: any) => ({
            id: r.id,
            label: r.nickname || r.plant_name || "Unnamed plant",
          }));
        } else if (activeType === "location") {
          const { data, error } = await supabase
            .from("locations")
            .select("id, name")
            .eq("home_id", homeId)
            .order("name");
          if (error) throw error;
          rows = (data ?? []).map((r: any) => ({ id: r.id, label: r.name }));
        } else if (activeType === "area") {
          const { data, error } = await supabase
            .from("areas")
            .select("id, name, location_id, locations(name)")
            .eq("locations.home_id", homeId)
            .order("name");
          if (error) throw error;
          rows = (data ?? []).map((r: any) => ({
            id: r.id,
            label: r.locations?.name ? `${r.name} (${r.locations.name})` : r.name,
          }));
        } else if (activeType === "plan") {
          const { data, error } = await supabase
            .from("plans")
            .select("id, name")
            .eq("home_id", homeId)
            .order("created_at", { ascending: false });
          if (error) throw error;
          rows = (data ?? []).map((r: any) => ({ id: r.id, label: r.name }));
        }
        if (!cancelled) setCandidates(rows);
      } catch (err) {
        Logger.error("TargetPicker: load candidates failed", err, {
          activeType,
          homeId,
        });
        if (!cancelled) setCandidates([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeType, homeId, fixedType]);

  const handleTypeChange = (next: JournalTargetType) => {
    onChange({ type: next, id: null, label: null });
  };

  const handleIdChange = (nextId: string) => {
    const candidate = candidates.find((c) => c.id === nextId) ?? null;
    onChange({
      type: activeType,
      id: nextId || null,
      label: candidate?.label ?? null,
    });
  };

  return (
    <div className="space-y-3" data-testid="journal-target-picker">
      {!fixedType && (
        <div role="radiogroup" aria-label="Where to attach this entry">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
            Attach to
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map((opt) => {
              const isActive = activeType === opt.type;
              return (
                <button
                  key={opt.type}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => handleTypeChange(opt.type)}
                  data-testid={`journal-target-type-${opt.type}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    isActive
                      ? "bg-rhozly-primary text-white border-rhozly-primary"
                      : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 hover:border-rhozly-primary/40"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {activeType !== "none" && !fixedType && (
        <div>
          <label
            htmlFor="journal-target-select"
            className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block"
          >
            {TYPE_OPTIONS.find((o) => o.type === activeType)?.label}
          </label>
          <select
            id="journal-target-select"
            data-testid="journal-target-select"
            value={value.id ?? ""}
            onChange={(e) => handleIdChange(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2.5 bg-white border border-rhozly-outline/20 rounded-xl text-sm font-bold text-rhozly-on-surface focus:border-rhozly-primary outline-none disabled:opacity-50"
          >
            <option value="">
              {loading ? "Loading…" : `Pick a ${activeType}…`}
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {!loading && candidates.length === 0 && (
            <p className="text-xs font-bold text-rhozly-on-surface/40 mt-1.5">
              No {activeType}s yet — add one first or pick a different target.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function applyTargetToPayload<T extends Record<string, unknown>>(
  target: TargetSelection,
  payload: T,
): T & {
  inventory_item_id?: string | null;
  location_id?: string | null;
  area_id?: string | null;
  plan_id?: string | null;
} {
  return {
    ...payload,
    inventory_item_id: target.type === "plant" ? target.id : null,
    location_id: target.type === "location" ? target.id : null,
    area_id: target.type === "area" ? target.id : null,
    plan_id: target.type === "plan" ? target.id : null,
  };
}
