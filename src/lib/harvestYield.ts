import { splitYieldEvenly } from "./yieldSplit";

// Build the per-instance yield rows to insert when a harvest is logged.
//
// Two modes match the UI toggle:
//  - "total"   — one figure for the whole task, split EVENLY across the linked
//                instances (parts sum to the total; remainder on the last row),
//                the RHO-21 behaviour.
//  - "perPlant"— the user enters an amount per plant; each becomes its own row.
//
// Non-positive amounts are dropped (yield_records.value has a `> 0` CHECK).
// `home_id` is added by the caller (it isn't a per-mode concern).

export type YieldEntryMode = "total" | "perPlant";

export interface HarvestYieldInput {
  mode: YieldEntryMode;
  instanceIds: string[];
  unit: string;
  notes?: string | null;
  /** mode "total": the single figure to split evenly. */
  total?: number;
  /** mode "perPlant": instanceId → amount. Missing / non-positive entries are skipped. */
  perPlant?: Record<string, number>;
}

export interface HarvestYieldRow {
  instance_id: string;
  value: number;
  unit: string;
  notes: string | null;
}

export function buildHarvestYieldRows(input: HarvestYieldInput): HarvestYieldRow[] {
  const notes = input.notes && input.notes.trim() ? input.notes.trim() : null;
  const rows: HarvestYieldRow[] = [];

  if (input.mode === "total") {
    const total = input.total ?? 0;
    if (!(total > 0) || input.instanceIds.length === 0) return [];
    const parts = splitYieldEvenly(total, input.instanceIds.length);
    input.instanceIds.forEach((id, i) => {
      const value = parts[i] ?? 0;
      if (value > 0) rows.push({ instance_id: id, value, unit: input.unit, notes });
    });
  } else {
    for (const id of input.instanceIds) {
      const value = input.perPlant?.[id] ?? 0;
      if (value > 0) rows.push({ instance_id: id, value, unit: input.unit, notes });
    }
  }

  return rows;
}
