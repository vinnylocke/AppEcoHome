// Presence × Curation badge precedence (Garden Hub v3 Stage A, 2026-07-22 —
// docs/plans/garden-hub-v3-presence-curation.md §3).
//
// ONE presence pill max per row: Active > Inactive > Saved/Watching. "Active
// implies Saved" — never stack pills. The personal ♥/🔭 glyph is a separate,
// combinable mark handled by the caller.

export type Presence = "active" | "inactive" | null | undefined;

export type PresencePill = "active" | "inactive" | "saved" | null;

/**
 * The single pill a row shows. `curated` = the home row exists and is not
 * archived (plants: Saved; ailments: Watching — the caller labels it).
 */
export function presencePill(presence: Presence, curated: boolean): PresencePill {
  if (presence === "active") return "active";
  if (presence === "inactive") return "inactive";
  return curated ? "saved" : null;
}

/** Fold view rows into an id → presence map. */
export function toPresenceMap<Id extends string | number>(
  rows: Array<{ presence: "active" | "inactive" } & Record<string, unknown>>,
  idKey: string,
): Map<Id, "active" | "inactive"> {
  const map = new Map<Id, "active" | "inactive">();
  for (const row of rows) {
    const id = row[idKey] as Id;
    if (id !== null && id !== undefined) map.set(id, row.presence);
  }
  return map;
}
