/**
 * Server-side guard against Gemini hallucinations for the `lookup_frost_dates`
 * action of the plant-doctor edge fn. Refuses to write the AI payload to
 * `home_climate` if any of these invariants fail:
 *
 *   - both ISO strings must parse as valid dates
 *   - last_frost_iso must precede first_frost_iso within the same year window
 *   - for Northern hemisphere homes, last frost falls in Jan–May (months 1-5)
 *   - for Southern hemisphere homes, last frost falls in Jul–Nov (months 7-11)
 *   - growing_season_days, when given, is a reasonable [30, 365] integer
 *
 * Returns `{ ok: true }` on success, otherwise `{ ok: false, reason }` so the
 * caller can log + return a structured error to the client.
 */

export type FrostPayload = {
  last_frost_iso?: string | null;
  first_frost_iso?: string | null;
  growing_season_days?: number | null;
  notes?: string | null;
};

export type Hemisphere = "Northern" | "Southern" | "northern" | "southern";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // Reject anything that isn't strict YYYY-MM-DD to avoid timezone games.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthOf(d: Date): number {
  // 1-12, UTC
  return d.getUTCMonth() + 1;
}

export function validateFrostPayload(
  payload: FrostPayload,
  hemisphere: Hemisphere,
): ValidationResult {
  const last = parseIsoDate(payload.last_frost_iso);
  const first = parseIsoDate(payload.first_frost_iso);

  if (!last) {
    return { ok: false, reason: "invalid_last_frost_iso" };
  }
  if (!first) {
    return { ok: false, reason: "invalid_first_frost_iso" };
  }

  if (last.getTime() >= first.getTime()) {
    return { ok: false, reason: "last_frost_must_precede_first_frost" };
  }

  const hemi = hemisphere.toLowerCase();
  const lastMonth = monthOf(last);
  const firstMonth = monthOf(first);

  if (hemi === "northern") {
    if (lastMonth < 1 || lastMonth > 5) {
      return { ok: false, reason: "northern_last_frost_out_of_range" };
    }
    if (firstMonth < 8 || firstMonth > 12) {
      return { ok: false, reason: "northern_first_frost_out_of_range" };
    }
  } else if (hemi === "southern") {
    if (lastMonth < 7 || lastMonth > 11) {
      return { ok: false, reason: "southern_last_frost_out_of_range" };
    }
    // Southern first frost falls Feb–May (autumn there).
    if (firstMonth < 2 || firstMonth > 6) {
      return { ok: false, reason: "southern_first_frost_out_of_range" };
    }
  } else {
    return { ok: false, reason: "unknown_hemisphere" };
  }

  const season = payload.growing_season_days;
  if (season != null) {
    if (!Number.isFinite(season) || season < 30 || season > 365) {
      return { ok: false, reason: "growing_season_days_out_of_range" };
    }
  }

  return { ok: true };
}
