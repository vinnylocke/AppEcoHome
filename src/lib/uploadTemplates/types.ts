// Upload-template registry — shared types (RHO-4 Phase 1).
//
// A single field-registry drives four things that must never drift:
//   * the downloadable CSV template (headers + example row),
//   * the strict CSV parser + per-field validation,
//   * the insert-payload shape the review step saves, and
//   * (via unit parity tests) the manual-create form's payload keys.
//
// Pure module — NO React, NO supabase imports (per src/lib/ convention).
// Phase 1 ships PLANT_TEMPLATE only; the shapes here are deliberately
// record-type-agnostic so AILMENT_TEMPLATE (Phase 2) and SEED_PACKET_TEMPLATE
// (Phase 3) slot in by adding a new RecordTemplate to the registry — no
// changes to csv.ts / parse.ts / template.ts.

/** The kind of a single CSV column — drives parsing + validation + the
 *  template's example rendering. */
export type FieldKind =
  | "text"
  | "int"
  | "bool"
  | "date"
  | "enum"
  | "enum-multi" // `;`-separated multi-value against an enum set
  | "list" // `;`-separated free-text list
  | "symptoms" // `;`-separated `title [severity]` entries → AilmentSymptom[] (RHO-4 Phase 2)
  | "steps"; // `;`-separated step titles → AilmentStep[] (RHO-4 Phase 2)

/**
 * One CSV column's contract. `apply` is the ONLY place a parsed value becomes
 * part of the insert payload — so the payload shape lives with the column
 * definition, not scattered across the modal.
 */
export interface FieldSpec {
  /** Canonical CSV header, e.g. `watering_min_days`. Case-insensitive on parse. */
  header: string;
  /** Human label for the in-product field-reference table. */
  label: string;
  /** Whether an empty cell is a per-row error. */
  required: boolean;
  kind: FieldKind;
  /** Allowed values for enum / enum-multi kinds (canonical forms). */
  enumValues?: string[];
  /** Length / numeric limits. */
  maxLen?: number;
  min?: number;
  max?: number;
  /**
   * For `date` kind only — how a PARTIAL date (`YYYY-MM` / `Month YYYY` /
   * year-only) resolves to a full ISO day:
   *   * `"down"` (default) → first day of the period (purchased/opened dates),
   *   * `"up"`             → last day of the period (a "sow by" deadline).
   * Mirrors parseSeedPackets' parseDatePhrase semantics. A full `YYYY-MM-DD`
   * is used verbatim regardless. Year-only is only accepted when `"up"`.
   */
  datePartial?: "up" | "down";
  /** Value used in the template's EXAMPLE row. */
  example: string;
  /**
   * Writes the parsed, validated value into the accumulating insert payload.
   * Called only when the cell parsed without a blocking error. `raw` is the
   * already-kind-coerced value (string | number | boolean | string[] | null).
   */
  apply: (value: ParsedValue, payload: Record<string, unknown>) => void;
  /**
   * Optional row-level check run after every field has applied — e.g. watering
   * min ≤ max. Return an error message to attach a row issue, or null when ok.
   */
  crossValidate?: (payload: Record<string, unknown>) => string | null;
}

/** The coerced value a FieldSpec.apply receives. `steps`/`symptoms` kinds
 *  produce arrays of plain objects (AilmentSymptom / AilmentStep shapes). */
export type ParsedValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>[]
  | null;

/**
 * A record type's full column contract + how a validated row becomes the thing
 * we insert. `buildPayload` receives the applied payload and returns the final
 * insert-ready object (lets a template add derived fields, e.g. plant metadata).
 */
export interface RecordTemplate<TRow = Record<string, unknown>> {
  /** Stable id — `plant` | `ailment` | `seed_packet`. */
  id: string;
  /** Download filename, e.g. `rhozly-plants-template.csv`. */
  filename: string;
  /** Ordered column set — also the template header order. */
  fields: FieldSpec[];
  /**
   * Turn a validated, field-applied payload into the final insert row. Default
   * is identity; PLANT_TEMPLATE uses it to fold quantity/notes into
   * plant_metadata and derive labels.
   */
  buildPayload?: (payload: Record<string, unknown>) => TRow;
  /**
   * Read the per-row `favourite` flag from the pre-buildPayload working payload
   * (cross-home favourites, 2026-07-03). Kept off the insert payload — the
   * review step reads this to call the favourite service after insert. When
   * omitted, rows default to not-favourited.
   */
  extractFavourite?: (payload: Record<string, unknown>) => boolean;
}

/** A single per-row / per-field problem surfaced in the review step. */
export interface RowIssue {
  /** 1-based data-row number (the header row is row 0, not counted). */
  rowNumber: number;
  /** Column header the issue relates to, or null for row-level issues. */
  field: string | null;
  severity: "error" | "warning";
  message: string;
}

/** One parsed CSV data row + the issues found while parsing it. */
export interface ParsedRow<TRow = Record<string, unknown>> {
  /** 1-based data-row number. */
  rowNumber: number;
  /** The insert-ready payload (present even when the row has warnings). */
  payload: TRow;
  /** Whether this row's `favourite` flag was set (post-insert favourite call). */
  favourite: boolean;
  /** Whether the row is safe to insert (no blocking `error` issues). */
  valid: boolean;
  /** Per-row + per-field issues (errors block; warnings inform). */
  issues: RowIssue[];
}

/** The whole parse result. */
export interface ParseResult<TRow = Record<string, unknown>> {
  rows: ParsedRow<TRow>[];
  /** Aggregate of every row's issues plus file-level issues (unknown columns). */
  issues: RowIssue[];
}
