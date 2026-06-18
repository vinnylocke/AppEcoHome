// Collect the unique automation ids that link to an area's devices.
//
// An automation can reference a device two ways: the legacy `automation_devices`
// join (time-scheduled automations) OR `automation_actions.target_device_id`
// (the unified condition builder's valve actions). The AI Area Coach must
// consider BOTH or it misses condition automations whose valve lives in the area
// but which have no explicit `area_id` set. Pure + tested.

export function uniqueAutomationIds(
  ...lists: Array<Array<{ automation_id: string }> | null | undefined>
): string[] {
  const set = new Set<string>();
  for (const list of lists) {
    for (const row of list ?? []) {
      if (row?.automation_id) set.add(row.automation_id);
    }
  }
  return [...set];
}
