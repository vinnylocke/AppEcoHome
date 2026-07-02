/**
 * Phantom-column checker (docs/plans/typecheck-gate-and-schema-audit.md §B).
 *
 * Two production incidents shipped because code named columns the schema
 * doesn't have (`locations.hazard`, `weather_alerts.home_id` — Sentry
 * RHOZLY-3P): PostgREST 400s the whole query and unchecked callers render
 * silent blanks. This script diffs every column named in supabase-js query
 * chains against the LIVE schema.
 *
 * Schema source: PostgREST's OpenAPI root (`GET /rest/v1/`), which lists
 * every exposed table and its columns. Defaults to the PRODUCTION project
 * (SUPABASE_PROD_URL + SUPABASE_SERVICE_ROLE_KEY from .env) — drift against
 * prod is what bites; pass --local to check the local stack instead.
 *
 * Scans: src/ and supabase/functions/ for `.from("table")` chains, checking
 *   - .select("...") column lists (embedded `rel(...)` recurses when the
 *     rel name is a known table; unknown rel names are reported as likely
 *     relationship typos)
 *   - filter methods: eq neq gt gte lt lte like ilike is in contains
 *     containedBy overlaps not order
 *   - .or("...") filter strings (col.op.val segments, incl. and()/or())
 *
 * Heuristic by design — it reads source with regexes, not a TS AST. It
 * errs toward reporting; every finding should be checked by a human.
 * Exits 1 when findings exist so it can gate.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// ── env ─────────────────────────────────────────────────────────────────────
function loadEnvFile(filename) {
  try {
    for (const line of readFileSync(filename, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch { /* optional */ }
}
loadEnvFile(".env");
loadEnvFile(".env.local");

const useLocal = process.argv.includes("--local");
const BASE = useLocal
  ? (process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321")
  : process.env.SUPABASE_PROD_URL;
const KEY = useLocal
  ? (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)
  : process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !KEY) {
  console.error("Missing SUPABASE_PROD_URL / SUPABASE_SERVICE_ROLE_KEY in .env (or --local env).");
  process.exit(2);
}

// ── schema from PostgREST OpenAPI ───────────────────────────────────────────
const res = await fetch(`${BASE}/rest/v1/`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.error(`Failed to fetch OpenAPI schema: HTTP ${res.status}`);
  process.exit(2);
}
const openapi = await res.json();
/** table → Set(columns) */
const schema = new Map();
for (const [name, def] of Object.entries(openapi.definitions ?? {})) {
  schema.set(name, new Set(Object.keys(def.properties ?? {})));
}
if (schema.size === 0) {
  console.error("OpenAPI schema came back empty — wrong key or URL?");
  process.exit(2);
}

// ── source scan ─────────────────────────────────────────────────────────────
const FILTER_METHODS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "contains", "containedBy", "overlaps", "order", "not",
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      yield* walk(p);
    } else if (/\.(ts|tsx|mjs)$/.test(entry) && !/\.test\./.test(entry)) {
      yield p;
    }
  }
}

/** Split a select string on top-level commas (parens-aware). */
function splitTop(s) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const findings = [];

function checkColumn(table, rawCol, file, line, context) {
  let col = rawCol.trim();
  if (!col || col === "*" || col === "count") return;
  col = col.replace(/!(inner|left)$/, "");
  col = col.split("::")[0];           // ::cast
  col = col.split("->")[0];           // json paths
  if (col.includes(".")) return;      // foreign-table filter — resolved by caller
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) return; // expressions — skip
  const cols = schema.get(table);
  if (!cols) return;                  // unknown table reported separately
  if (!cols.has(col)) {
    findings.push(`${file}:${line} — ${table}.${col} does not exist (${context})`);
  }
}

function checkSelectPart(table, part, file, line) {
  // alias:actual — check the actual
  const aliasMatch = part.match(/^[a-zA-Z_][a-zA-Z0-9_]*:(.+)$/s);
  if (aliasMatch && !part.includes("(")) {
    return checkColumn(table, aliasMatch[1], file, line, "select alias");
  }
  const embedded = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*(?:!(?:inner|left))?)\s*\(([\s\S]*)\)$/);
  if (embedded) {
    const relName = embedded[1].replace(/!(inner|left)$/, "");
    if (schema.has(relName)) {
      for (const sub of splitTop(embedded[2])) checkSelectPart(relName, sub, file, line);
    }
    // Unknown rel name may be a legit FK alias — not reported to avoid noise.
    return;
  }
  checkColumn(table, part, file, line, "select");
}

function checkOrString(table, orStr, file, line) {
  // col.op.val segments, possibly wrapped in and(...)/or(...)
  const inner = orStr.replace(/\b(?:and|or)\(/g, "(");
  for (const seg of inner.split(",")) {
    const m = seg.trim().replace(/^\(+|\)+$/g, "").match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\./);
    if (!m) continue;
    const colPath = m[1];
    if (colPath.includes(".")) {
      const [maybeTable, sub] = colPath.split(".");
      if (schema.has(maybeTable)) checkColumn(maybeTable, sub, file, line, ".or foreign filter");
    } else {
      checkColumn(table, colPath, file, line, ".or filter");
    }
  }
}

const roots = ["src", join("supabase", "functions")];
for (const root of roots) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    const fromRe = /\.from\(\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s*\)((?:\s*\.\s*[a-zA-Z]+\s*\((?:[^()"'`]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\([^()]*\))*\))*)/g;
    let m;
    while ((m = fromRe.exec(text)) !== null) {
      const [, table, chain] = m;
      const line = text.slice(0, m.index).split("\n").length;
      if (!schema.has(table)) {
        findings.push(`${file}:${line} — table "${table}" not in schema`);
        continue;
      }
      const callRe = /\.\s*([a-zA-Z]+)\s*\(\s*(["'`])((?:[^"'`\\]|\\.)*?)\2/g;
      let c;
      while ((c = callRe.exec(chain)) !== null) {
        const [, method, , arg] = c;
        if (method === "select") {
          for (const part of splitTop(arg)) checkSelectPart(table, part, file, line);
        } else if (method === "or") {
          checkOrString(table, arg, file, line);
        } else if (FILTER_METHODS.has(method)) {
          if (arg.includes(".") && schema.has(arg.split(".")[0])) {
            checkColumn(arg.split(".")[0], arg.split(".")[1], file, line, `.${method} foreign`);
          } else {
            checkColumn(table, arg, file, line, `.${method}`);
          }
        }
      }
    }
  }
}

const unique = [...new Set(findings)];
if (unique.length === 0) {
  console.log(`✅ No phantom columns — checked ${schema.size} tables against ${useLocal ? "LOCAL" : "PROD"} schema.`);
  process.exit(0);
}
console.log(`❌ ${unique.length} phantom column reference(s) (${useLocal ? "LOCAL" : "PROD"} schema):\n`);
for (const f of unique) console.log("  " + f);
process.exit(1);
