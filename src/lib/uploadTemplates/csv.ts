// RFC-4180 CSV tokenizer + serialiser (RHO-4 Phase 1).
//
// No dependency, no React. Handles:
//   * quoted fields with embedded commas, newlines, and doubled `""` quotes,
//   * CRLF and LF line endings,
//   * a leading UTF-8 BOM on input (stripped) and on output (prepended),
//   * delimiter sniffing on the HEADER ROW ONLY — `,` `;` or tab. Because the
//     registry uses `;` as the intra-cell multi-value separator, sniffing on
//     the header row is unambiguous (canonical headers never contain `;`).
//   * Windows-1252 smart quotes normalised to ASCII quotes so pasted-from-Word
//     content tokenises cleanly.

const BOM = "﻿";

/** Candidate field delimiters, in preference order for a tie. */
const DELIMITERS = [",", ";", "\t"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/** Strip a leading UTF-8 BOM if present. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Normalise Windows-1252 smart quotes to ASCII so tokenising is predictable. */
function normalizeQuotes(text: string): string {
  return text
    .replace(/[“”„″]/g, '"')
    .replace(/[‘’‚′]/g, "'");
}

/**
 * Sniff the field delimiter from the first physical line. The winner is the
 * delimiter that yields the most fields; ties resolve by DELIMITERS order
 * (comma first). A header row with no delimiter at all → single column (comma).
 */
export function sniffDelimiter(text: string): Delimiter {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? "";
  let best: Delimiter = ",";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    // Count fields the delimiter would produce on the header row, respecting
    // quotes so a quoted comma in a header (rare) doesn't inflate the count.
    const count = tokenizeLine(firstLine, d).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Tokenise a single already-isolated line (no embedded newlines) into fields. */
function tokenizeLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/**
 * Parse an entire CSV document into a matrix of string cells, honouring quoted
 * fields that span newlines. Blank physical lines (outside quotes) are skipped.
 * The delimiter is sniffed from the header row unless one is passed.
 */
export function parseCsvRows(text: string, delimiter?: Delimiter): string[][] {
  const src = normalizeQuotes(stripBom(text));
  const delim = delimiter ?? sniffDelimiter(text);

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let cellStarted = false;

  const pushField = () => {
    row.push(field);
    field = "";
    cellStarted = false;
  };
  const pushRow = () => {
    pushField();
    // Skip fully-empty physical lines (a single empty cell and nothing else).
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !cellStarted) {
      inQuotes = true;
      cellStarted = true;
      continue;
    }
    if (ch === delim) {
      pushField();
      continue;
    }
    if (ch === "\r") {
      // Handle CRLF: swallow the LF that follows.
      if (src[i + 1] === "\n") i++;
      pushRow();
      continue;
    }
    if (ch === "\n") {
      pushRow();
      continue;
    }
    field += ch;
    cellStarted = true;
  }
  // Flush the trailing row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0 || cellStarted) pushRow();

  return rows;
}

/** Does a value need RFC-4180 quoting? (contains delimiter, quote, or newline) */
function needsQuoting(value: string, delimiter: string): boolean {
  return (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  );
}

/** Serialise one cell — double embedded quotes and wrap when needed. */
export function serializeCell(value: string, delimiter: string = ","): string {
  if (needsQuoting(value, delimiter)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialise a matrix of rows into a CSV string. Emits CRLF line endings (Excel-
 * friendly) and, when `withBom` is set, prepends a UTF-8 BOM so Excel on
 * Windows reads accented characters correctly.
 */
export function serializeCsv(
  rows: string[][],
  opts: { delimiter?: string; withBom?: boolean } = {},
): string {
  const delimiter = opts.delimiter ?? ",";
  const body = rows
    .map((row) => row.map((c) => serializeCell(c, delimiter)).join(delimiter))
    .join("\r\n");
  return (opts.withBom ? BOM : "") + body;
}
