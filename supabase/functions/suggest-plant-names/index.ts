/**
 * suggest-plant-names
 *
 * Lightweight semantic "did you mean" suggestion for the plant search
 * UI. Fires when the user types a query that returns nothing from the
 * library, the trigram fuzzy RPC, and external providers — typically a
 * specific cultivar / variety the catalogue hasn't seen yet. Gemini
 * returns 2–3 likely real plant names (canonical + cultivar form) that
 * the client renders as clickable chips.
 *
 * Request body:  { query: string }
 * Response 200:  { suggestions: Array<{ name: string; reason: string }> }
 *
 * Tier-gated upstream by the client (only fires for ai_enabled users).
 * Small response → bounded cost. No DB writes.
 */

import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "suggest-plant-names";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SUGGEST_SCHEMA = {
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["name"],
      },
    },
  },
  required: ["suggestions"],
};

function buildPrompt(query: string): string {
  return `The user typed "${query}" into our plant search and got no results — likely because they typed a cultivar / variety / regional name that our catalogue doesn't have yet, OR a misspelling that the fuzzy trigram match didn't catch.

Return up to 3 REAL plant names (canonical common name OR cultivar form) that this user most likely meant. Bias toward names a gardener would recognise, not Latin binomials. If the query is unrecognisable, return an empty array.

For each suggestion, give a one-line "reason" — e.g. "Common cultivar of Tomato" or "Often spelled this way".

Examples:
- "sungold tomato" → [{ name: "Tomato 'Sungold'", reason: "Popular cherry-tomato cultivar" }]
- "feverfu" → [{ name: "Feverfew", reason: "Likely a typo of this medicinal herb" }]
- "qwxyz" → []

Return JSON matching the schema. No prose. No markdown.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (query.length < 2) return json({ suggestions: [] });
    if (query.length > 80) {
      return json({ error: "Query too long." }, 400);
    }

    const { text } = await callGeminiCascade(
      apiKey,
      FN,
      toMessages([buildPrompt(query)]),
      {
        temperature: 0.3,
        maxOutputTokens: 256,
        responseSchema: SUGGEST_SCHEMA,
        responseMimeType: "application/json",
        logContext: { query },
      },
    );

    let parsed: { suggestions?: Array<{ name?: unknown; reason?: unknown }> };
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      logError(FN, "parse_failed", { query, error: (err as Error).message });
      return json({ suggestions: [] });
    }

    const out: Array<{ name: string; reason: string }> = [];
    for (const s of parsed.suggestions ?? []) {
      const name = typeof s.name === "string" ? s.name.trim() : "";
      const reason = typeof s.reason === "string" ? s.reason.trim() : "";
      if (name && name.length <= 80 && name.toLowerCase() !== query.toLowerCase()) {
        out.push({ name, reason });
      }
      if (out.length >= 3) break;
    }

    log(FN, "suggest", { query, count: out.length });
    return json({ suggestions: out });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    logError(FN, "error", { error: message });
    await captureException(FN, err as Error);
    return json({ suggestions: [] });
  }
});
