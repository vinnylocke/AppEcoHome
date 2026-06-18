// When an automation is bound to an area, the builder narrows the sensor / valve
// pickers to devices in that area. But a device already chosen on an existing
// automation must never silently disappear if it sits outside the area (e.g. the
// area was changed later) — so we always keep any `selectedIds` even when they
// fall outside the filter. Pure + tested.

export interface ScopedDevice {
  id: string;
  name: string;
  area_id?: string | null;
}

/**
 * @param devices     all candidate devices of a type (sensors or valves).
 * @param areaId      the automation's area binding; null = no filter (all).
 * @param selectedIds device ids already chosen — always retained.
 */
export function scopeDevicesToArea<T extends ScopedDevice>(
  devices: T[],
  areaId: string | null | undefined,
  selectedIds: string[] = [],
): T[] {
  if (!areaId) return devices;
  const selected = new Set(selectedIds);
  return devices.filter((d) => d.area_id === areaId || selected.has(d.id));
}
