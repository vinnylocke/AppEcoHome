import { assert, assertEquals } from "@std/assert";
import {
  classifyCascadeErrors,
  GeminiCascadeExhaustedError,
  type CascadeModelError,
} from "../functions/_shared/gemini.ts";

// July 2026 spend-cap incident: every model in the chat cascade returned 429
// "monthly spending cap exceeded" and the failure surfaced as a generic 500.
// The classification lets agent-chat return a structured `ai_unavailable`
// (503) and lets Sentry alerts distinguish billing outages from transient
// model overload.

const rung = (model: string, error: string, attempts = 2): CascadeModelError => ({
  model,
  attempts,
  error,
});

const SPEND_CAP =
  '429 "Your project has exceeded its monthly spending cap. Please go to AI Studio…"';

Deno.test("classifyCascadeErrors — all rungs on the spend cap → billing", () => {
  assertEquals(
    classifyCascadeErrors([
      rung("gemini-3.1-pro-preview", SPEND_CAP),
      rung("gemini-2.5-pro", SPEND_CAP),
      rung("gemini-3-flash-preview", SPEND_CAP),
      rung("gemini-2.5-flash", SPEND_CAP),
    ]),
    "billing",
  );
});

Deno.test("classifyCascadeErrors — billing signature matches case-insensitively", () => {
  assertEquals(
    classifyCascadeErrors([rung("gemini-2.5-flash", "429 BILLING account suspended")]),
    "billing",
  );
});

Deno.test("classifyCascadeErrors — all 429 without billing wording → rate_limit", () => {
  assertEquals(
    classifyCascadeErrors([
      rung("gemini-2.5-pro", "Gemini API error 429: Resource has been exhausted"),
      rung("gemini-2.5-flash", "Gemini API error 429: Resource has been exhausted"),
    ]),
    "rate_limit",
  );
});

Deno.test("classifyCascadeErrors — plain quota 429 mentioning 'billing details' is rate_limit, NOT billing", () => {
  // Google's standard quota copy says "please check your plan and billing
  // details" — a loose /billing/ match would send the operator chasing the
  // spend cap when the real fix is throttling / waiting out the quota window.
  const quota429 =
    "Gemini HTTP 429 from gemini-2.5-flash: You exceeded your current quota, please check your plan and billing details.";
  assertEquals(
    classifyCascadeErrors([
      rung("gemini-2.5-pro", quota429),
      rung("gemini-2.5-flash", quota429),
    ]),
    "rate_limit",
  );
});

Deno.test("classifyCascadeErrors — 503s / timeouts / mixed → transient", () => {
  assertEquals(
    classifyCascadeErrors([
      rung("gemini-2.5-pro", "Gemini API error 503: overloaded"),
      rung("gemini-2.5-flash", "Timeout after 45000ms"),
    ]),
    "transient",
  );
  // A mixed cascade (one rung billing, one 503) must NOT read as billing —
  // a partial failure can recover on retry, so it stays transient.
  assertEquals(
    classifyCascadeErrors([
      rung("gemini-2.5-pro", SPEND_CAP),
      rung("gemini-2.5-flash", "Gemini API error 503: overloaded"),
    ]),
    "transient",
  );
  assertEquals(classifyCascadeErrors([]), "transient");
});

Deno.test("GeminiCascadeExhaustedError — carries per-rung errors + legacy message shape", () => {
  const rungs = [rung("gemini-2.5-pro", SPEND_CAP), rung("gemini-2.5-flash", SPEND_CAP)];
  const err = new GeminiCascadeExhaustedError(
    "All 2 Gemini models exhausted (cascade tried each up to 2 times):\n  • …",
    rungs,
  );
  assert(err instanceof Error, "must stay a plain Error for existing catch sites");
  assertEquals(err.name, "GeminiCascadeExhaustedError");
  assertEquals(err.perModelErrors, rungs);
  // Callers that match on message text (pre-typed-error behaviour) keep working.
  assert(err.message.includes("Gemini models exhausted"));
});
