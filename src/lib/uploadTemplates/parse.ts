// Strict CSV parser + per-field validation (RHO-4 Phase 1).
//
// parseCsv<T>(text, template) turns a CSV document into insert-ready payloads +
// a per-row / per-field issue report. Deterministic, tier-free, no network.
//
// Rules (per plan §6 + answers 2026-07-03):
//   * First row is the header row (case-insensitive match against the
//     template's canonical headers). Unknown columns → file-level warning.
//   * A data row whose first cell starts with `EXAMPLE` is silently skipped
//     (the template's example row).
//   * Hard cap of 200 data rows; extra rows → one file-level error.
//   * Required-but-empty → per-field error (row blocked).
//   * Bad enum / out-of-range / non-numeric → per-field error; the rest of the
//     row still parses so one typo doesn't kill the whole row.
//   * Leading `'` is stripped and a cell starting with `=` in a text field is
//     flagged (CSV formula-injection hardening).

import type {
  FieldSpec,
  ParsedRow,
  ParseResult,
  ParsedValue,
  RecordTemplate,
  RowIssue,
} from "./types";
import { parseCsvRows } from "./csv";

/** Max data rows accepted per import (answer 4, 2026-07-03). */
export const MAX_DATA_ROWS = 200;

const BOOL_TRUE = new Set(["true", "yes", "y", "1"]);
const BOOL_FALSE = new Set(["false", "no", "n", "0", ""]);

/** Light enum normalisation: lowercase, collapse whitespace, `_`→` `. */
function normalizeForEnum(s: string): string {
  return s.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Match a raw cell value against an enum set (case-insensitive, normalised).
 *  Returns the canonical value or null when nothing matches. */
function matchEnum(raw: string, enumValues: string[]): string | null {
  const norm = normalizeForEnum(raw);
  for (const canonical of enumValues) {
    if (normalizeForEnum(canonical) === norm) return canonical;
  }
  return null;
}

/** Split a `;`-separated multi-value cell into trimmed, non-empty parts. */
function splitList(raw: string): string[] {
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Stable-ish id for a parsed symptom/step. Uses crypto.randomUUID when
 *  available (browser + node test env), else a deterministic-ish fallback so
 *  the pure parser never throws. */
function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

const SYMPTOM_SEVERITIES = new Set(["mild", "moderate", "severe"]);

// ── Flexible date parsing (RHO-4 Phase 3) ────────────────────────────────────
// Shared, template-agnostic. Reuses parseSeedPackets' parseDatePhrase semantics:
// a partial date rounds DOWN (first of the period) for purchased/opened-style
// fields and UP (last of the period) for a "sow by" deadline. A FieldSpec opts
// into the direction via `datePartial: "up" | "down"` (default "down").

const MONTH_BY_NAME: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Parse a flexible date cell into an ISO `YYYY-MM-DD` string, or return null
 * when the shape is unrecognised. Accepts:
 *   * `YYYY-MM-DD`   — used verbatim (validated ranges),
 *   * `YYYY-MM`      — resolves via `round` (down → day 1, up → last day),
 *   * `Month YYYY` / `YYYY Month` — same period rounding,
 *   * `YYYY`         — only when `round === "up"` (a bare year is a deadline).
 * Mirrors parseSeedPackets.parseDatePhrase so the free-text + CSV paths agree.
 */
export function parseFlexibleDate(
  raw: string,
  round: "up" | "down",
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoFull = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoFull) {
    const y = Number(isoFull[1]);
    const m = Number(isoFull[2]);
    const d = Number(isoFull[3]);
    if (y >= 1980 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    return null;
  }

  const isoYm = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (isoYm) {
    const y = Number(isoYm[1]);
    const m = Number(isoYm[2]);
    if (y >= 1980 && y <= 2100 && m >= 1 && m <= 12) {
      const day = round === "up" ? daysInMonth(y, m) : 1;
      return `${y}-${pad2(m)}-${pad2(day)}`;
    }
    return null;
  }

  const named = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$|^(\d{4})\s+([A-Za-z]+)$/);
  if (named) {
    const monthWord = (named[1] ?? named[4] ?? "").toLowerCase();
    const year = Number(named[2] ?? named[3]);
    const month = MONTH_BY_NAME[monthWord];
    if (month && year >= 1980 && year <= 2100) {
      const day = round === "up" ? daysInMonth(year, month) : 1;
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
    return null;
  }

  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) {
    const y = Number(yearOnly[1]);
    if (y >= 1980 && y <= 2100 && round === "up") return `${y}-12-31`;
  }

  return null;
}

/**
 * Parse one `title [severity]` symptom cell entry into the AilmentSymptom shape
 * the StepBuilder / detail editor use. Only title + severity are populated from
 * CSV (v1 grammar); description + location default empty, filled in the editor.
 */
function parseSymptomEntry(entry: string): Record<string, unknown> {
  let title = entry.trim();
  let severity = "mild";
  const m = title.match(/^(.*?)\s*\[\s*([a-z]+)\s*\]\s*$/i);
  if (m) {
    const sev = m[2].toLowerCase();
    if (SYMPTOM_SEVERITIES.has(sev)) {
      title = m[1].trim();
      severity = sev;
    }
  }
  return { id: newId(), title: title.slice(0, 120), description: "", severity, location: "" };
}

/**
 * Parse a step-title cell entry into the full AilmentStep shape (title only from
 * CSV; task_type / frequency / product stay at their StepBuilder defaults and
 * are configured in the detail editor). `order` is 1-based by position.
 */
function parseStepEntry(entry: string, order: number): Record<string, unknown> {
  return {
    id: newId(),
    step_order: order,
    title: entry.trim().slice(0, 120),
    description: "",
    task_type: "inspect",
    frequency_type: "once",
  };
}

/**
 * Coerce + validate one cell for a field. Pushes any per-field issues onto
 * `issues` and returns the value to apply (or undefined to skip applying).
 */
function coerceField(
  field: FieldSpec,
  rawCell: string,
  rowNumber: number,
  issues: RowIssue[],
): ParsedValue | undefined {
  // Strip a leading `'` (formula-injection guard / Excel text-prefix).
  let raw = rawCell.replace(/^'/, "").trim();

  const empty = raw === "";
  if (empty) {
    if (field.required) {
      issues.push({
        rowNumber,
        field: field.header,
        severity: "error",
        message: `${field.label} is required`,
      });
      return undefined;
    }
    return undefined; // leave column unset; template defaults apply downstream
  }

  // Formula-injection: flag (warning) text cells that begin with `=`.
  if (
    (field.kind === "text" || field.kind === "list") &&
    /^[=+@]/.test(raw)
  ) {
    issues.push({
      rowNumber,
      field: field.header,
      severity: "warning",
      message: `${field.label} starts with a formula character — treated as text`,
    });
  }

  switch (field.kind) {
    case "text": {
      if (field.maxLen && raw.length > field.maxLen) {
        raw = raw.slice(0, field.maxLen);
        issues.push({
          rowNumber,
          field: field.header,
          severity: "warning",
          message: `${field.label} truncated to ${field.maxLen} characters`,
        });
      }
      return raw;
    }
    case "int": {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        issues.push({
          rowNumber,
          field: field.header,
          severity: "error",
          message: `${field.label} must be a whole number (got "${rawCell.trim()}")`,
        });
        return undefined;
      }
      if (field.min != null && n < field.min) {
        issues.push({
          rowNumber,
          field: field.header,
          severity: "error",
          message: `${field.label} must be at least ${field.min}`,
        });
        return undefined;
      }
      if (field.max != null && n > field.max) {
        issues.push({
          rowNumber,
          field: field.header,
          severity: "error",
          message: `${field.label} must be at most ${field.max}`,
        });
        return undefined;
      }
      return n;
    }
    case "bool": {
      const low = raw.toLowerCase();
      if (BOOL_TRUE.has(low)) return true;
      if (BOOL_FALSE.has(low)) return false;
      issues.push({
        rowNumber,
        field: field.header,
        severity: "error",
        message: `${field.label} must be true/false (got "${rawCell.trim()}")`,
      });
      return undefined;
    }
    case "date": {
      // Flexible dates (RHO-4 Phase 3): full ISO, plus partial `YYYY-MM` /
      // `Month YYYY` (/ year-only when rounding up) resolved to a full day per
      // the field's `datePartial` direction (default "down" = first of period).
      const round = field.datePartial ?? "down";
      const iso = parseFlexibleDate(raw, round);
      if (!iso) {
        issues.push({
          rowNumber,
          field: field.header,
          severity: "error",
          message: `${field.label} must be a date — YYYY-MM-DD, YYYY-MM, or "Month YYYY"`,
        });
        return undefined;
      }
      return iso;
    }
    case "enum": {
      const match = matchEnum(raw, field.enumValues ?? []);
      if (!match) {
        issues.push({
          rowNumber,
          field: field.header,
          severity: "error",
          message: `${field.label} "${rawCell.trim()}" is not one of: ${(field.enumValues ?? []).join(", ")}`,
        });
        return undefined;
      }
      return match;
    }
    case "enum-multi": {
      const parts = splitList(raw);
      const matched: string[] = [];
      for (const p of parts) {
        const match = matchEnum(p, field.enumValues ?? []);
        if (match) {
          if (!matched.includes(match)) matched.push(match);
        } else {
          issues.push({
            rowNumber,
            field: field.header,
            severity: "warning",
            message: `${field.label} value "${p}" ignored — not one of: ${(field.enumValues ?? []).join(", ")}`,
          });
        }
      }
      return matched;
    }
    case "list": {
      const parts = splitList(raw);
      const capped = field.maxLen
        ? parts.map((p) => p.slice(0, field.maxLen))
        : parts;
      return capped;
    }
    case "symptoms": {
      // `title [severity]` per `;`-separated entry → AilmentSymptom[].
      return splitList(raw).map(parseSymptomEntry);
    }
    case "steps": {
      // Step titles only → full AilmentStep[] with StepBuilder defaults.
      return splitList(raw).map((entry, i) => parseStepEntry(entry, i + 1));
    }
    default:
      return raw;
  }
}

/**
 * Parse a CSV document against a record template.
 *
 * @param text raw CSV text (may carry a UTF-8 BOM).
 * @param template the RecordTemplate to validate against.
 */
export function parseCsv<TRow = Record<string, unknown>>(
  text: string,
  template: RecordTemplate<TRow>,
): ParseResult<TRow> {
  const fileIssues: RowIssue[] = [];
  const matrix = parseCsvRows(text);

  if (matrix.length === 0) {
    fileIssues.push({
      rowNumber: 0,
      field: null,
      severity: "error",
      message: "The file is empty.",
    });
    return { rows: [], issues: fileIssues };
  }

  // ── Header row → column index map ──────────────────────────────────────────
  const headerCells = matrix[0].map((h) => h.replace(/^'/, "").trim());
  const knownByHeader = new Map<string, FieldSpec>();
  for (const f of template.fields) knownByHeader.set(f.header.toLowerCase(), f);

  /** field.header → column index in the data rows. */
  const fieldColumn = new Map<string, number>();
  let anyKnownHeader = false;
  headerCells.forEach((h, idx) => {
    const spec = knownByHeader.get(h.toLowerCase());
    if (spec) {
      fieldColumn.set(spec.header, idx);
      anyKnownHeader = true;
    } else if (h !== "") {
      fileIssues.push({
        rowNumber: 0,
        field: h,
        severity: "warning",
        message: `Unknown column "${h}" — ignored.`,
      });
    }
  });

  if (!anyKnownHeader) {
    fileIssues.push({
      rowNumber: 0,
      field: null,
      severity: "error",
      message:
        "First row must be the header row from the template (no recognised columns found).",
    });
    return { rows: [], issues: fileIssues };
  }

  // ── Data rows ──────────────────────────────────────────────────────────────
  const rows: ParsedRow<TRow>[] = [];
  let dataRowNumber = 0;

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];

    // Skip the template's EXAMPLE marker row.
    const firstCell = (cells[0] ?? "").replace(/^'/, "").trim();
    if (/^EXAMPLE/i.test(firstCell)) continue;

    dataRowNumber += 1;
    if (dataRowNumber > MAX_DATA_ROWS) {
      fileIssues.push({
        rowNumber: dataRowNumber,
        field: null,
        severity: "error",
        message: `Too many rows — the limit is ${MAX_DATA_ROWS} per file. Split the file and import again.`,
      });
      break;
    }

    const rowIssues: RowIssue[] = [];
    const working: Record<string, unknown> = {};

    for (const field of template.fields) {
      const colIdx = fieldColumn.get(field.header);
      const rawCell = colIdx != null ? (cells[colIdx] ?? "") : "";
      const value = coerceField(field, rawCell, dataRowNumber, rowIssues);
      if (value !== undefined) field.apply(value, working);
    }

    // Row-level cross-field checks.
    for (const field of template.fields) {
      if (field.crossValidate) {
        const msg = field.crossValidate(working);
        if (msg) {
          rowIssues.push({
            rowNumber: dataRowNumber,
            field: field.header,
            severity: "error",
            message: msg,
          });
        }
      }
    }

    const favourite = template.extractFavourite
      ? template.extractFavourite(working)
      : false;

    const payload = (template.buildPayload
      ? template.buildPayload(working)
      : working) as TRow;

    const valid = !rowIssues.some((iss) => iss.severity === "error");
    rows.push({ rowNumber: dataRowNumber, payload, favourite, valid, issues: rowIssues });
  }

  const allIssues = [...fileIssues, ...rows.flatMap((r) => r.issues)];
  return { rows, issues: allIssues };
}
