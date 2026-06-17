/**
 * Frontend mirror of the Deno control-template renderer
 * (`supabase/functions/_shared/integrations/template.ts`). Used only for
 * the Connect wizard's **live preview** of the outbound valve request —
 * the actual request is built + sent server-side. Kept in lockstep with
 * the Deno copy via parity tests; the two can't share a module because
 * they run in different runtimes (browser bundle vs Deno edge).
 *
 * Pure string substitution from a fixed map — no expression eval.
 */
export type TemplateVars = Record<string, string | number>;

// Defaults mirror the Deno adapter (`customHttp.ts`). Kept here so the
// wizard pre-fills a working request without importing Deno code.
export const DEFAULT_CONTROL_METHOD = "POST";
export const DEFAULT_CONTROL_HEADERS = "Content-Type: application/json";
export const DEFAULT_CONTROL_BODY =
  '{"schema_version":1,"command":"{{command}}","duration_seconds":{{duration_seconds}}}';

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) {
      throw new Error(`unknown_template_variable: ${name}`);
    }
    return String(vars[name]);
  });
}

/** Sample values used in the preview. */
export const PREVIEW_VARS: TemplateVars = {
  command: "turn_on",
  state: "on",
  duration_seconds: 1800,
  duration_minutes: 30,
  device_external_id: "garage-tap-valve",
  device_name: "Garage tap",
};

/** Parse a `Key: Value` per-line header block (preview-side; mirrors the adapter). */
export function parseHeaderBlock(
  raw: string,
): { headers: Record<string, string>; error?: string } {
  const headers: Record<string, string> = {};
  for (const line of (raw ?? "").split("\n")) {
    const t = line.replace(/\r$/, "");
    if (t.trim() === "") continue;
    const idx = t.indexOf(":");
    if (idx <= 0) return { headers, error: "invalid_header_line" };
    const key = t.slice(0, idx).trim();
    if (!key) return { headers, error: "invalid_header_line" };
    headers[key] = t.slice(idx + 1).trim();
  }
  return { headers };
}

function isJsonContentType(headers: Record<string, string>): boolean {
  const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  return ct.toLowerCase().includes("application/json");
}

export interface ControlTemplateConfig {
  url: string;
  method?: string;
  headers?: string;
  body?: string;
}

/**
 * Build a readable preview of the request Rhozly will POST, with the
 * sample variables substituted. Returns an error string when a template
 * references an unknown variable / a header line is malformed / a JSON
 * body doesn't parse — exactly the validation the server applies.
 */
export function buildControlPreview(
  cfg: ControlTemplateConfig,
): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const method = (cfg.method || "POST").toUpperCase();
    const parsed = parseHeaderBlock(cfg.headers ?? "Content-Type: application/json");
    if (parsed.error) return { ok: false, error: parsed.error };

    const lines: string[] = [`${method} ${cfg.url || "(no URL set)"}`];
    for (const [k, v] of Object.entries(parsed.headers)) {
      lines.push(`${k}: ${renderTemplate(v, PREVIEW_VARS)}`);
    }
    if (method !== "GET") {
      const body = renderTemplate(cfg.body ?? "", PREVIEW_VARS);
      if (isJsonContentType(parsed.headers) && body.trim() !== "") {
        try { JSON.parse(body); } catch { return { ok: false, error: "control_body_not_json" }; }
      }
      lines.push("", body);
    }
    return { ok: true, text: lines.join("\n") };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "invalid_template" };
  }
}
