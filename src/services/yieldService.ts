import { supabase } from "../lib/supabase";
import type { YieldRecord, NewYieldRecord } from "../types";

export function validateYieldValue(value: number | string): string | null {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n) || n <= 0) return "Value must be greater than 0";
  return null;
}

export async function fetchYieldRecords(instanceId: string): Promise<YieldRecord[]> {
  const { data, error } = await supabase
    .from("yield_records")
    .select("*")
    .eq("instance_id", instanceId)
    .order("harvested_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as YieldRecord[];
}

export async function insertYieldRecord(record: NewYieldRecord): Promise<YieldRecord> {
  const { data, error } = await supabase
    .from("yield_records")
    .insert(record)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Best-effort journal entry
  await supabase.from("plant_journals").insert({
    home_id: record.home_id,
    instance_id: record.instance_id,
    entry_type: "yield_logged",
    content: {
      value: record.value,
      unit: record.unit,
      notes: record.notes ?? null,
    },
  });

  return data as YieldRecord;
}

export async function deleteYieldRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from("yield_records")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function updateExpectedHarvestDate(
  instanceId: string,
  date: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("inventory_items")
    .update({ expected_harvest_date: date })
    .eq("id", instanceId);

  if (error) throw new Error(error.message);
}
