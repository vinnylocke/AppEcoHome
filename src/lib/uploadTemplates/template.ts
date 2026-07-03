// Template CSV generation + download (RHO-4 Phase 1).
//
// buildTemplateCsv is pure (unit-tested via round-trip: parseCsv(buildTemplateCsv(t), t)
// yields the example row with zero errors). downloadTemplate wraps it in a Blob
// + anchor click — browser-only, but no React.

import type { RecordTemplate } from "./types";
import { serializeCsv } from "./csv";

/**
 * Build the downloadable template CSV: a UTF-8 BOM + the canonical header row +
 * one EXAMPLE data row populated from each FieldSpec.example. The example row's
 * first cell is prefixed `EXAMPLE — ` so the parser silently skips it on
 * re-upload (see parse.ts).
 */
export function buildTemplateCsv(template: RecordTemplate): string {
  const headers = template.fields.map((f) => f.header);

  const exampleRow = template.fields.map((f, idx) => {
    if (idx === 0) return `EXAMPLE — ${f.example}`;
    return f.example;
  });

  return serializeCsv([headers, exampleRow], { withBom: true });
}

/**
 * Trigger a browser download of the template CSV. No-op outside a browser
 * (guards SSR / tests that import this module).
 */
export function downloadTemplate(template: RecordTemplate): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const csv = buildTemplateCsv(template);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = template.filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
