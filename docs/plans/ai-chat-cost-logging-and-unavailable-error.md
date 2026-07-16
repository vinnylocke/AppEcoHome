# AI Chat — real cost logging + distinct "AI unavailable" error handling

**Date:** 2026-07-14
**Trigger:** Production incident — the Google AI project hit its monthly spending cap, every
Gemini model in the chat cascade returned 429, and the chat showed only the generic
"Oops! My roots got tangled" fallback. Two gaps surfaced:

1. **Cost tracking is blind to the biggest consumer.** `agent-chat` logs each message turn as
   a zero-cost `agent-chat-orchestrator` row and only best-effort-updates `total_tokens` at
   the end. July's ledger showed **$0.60 logged** while agent-chat burned **24.2M tokens**
   (eval runs, July 6–7) through Pro-class models — enough to blow the spend cap invisibly.
2. **Model-outage errors are indistinguishable from bugs.** When the whole cascade exhausts
   (spend cap, billing, sustained 503s), `agent-chat` returns a bare 500 and the client shows
   the same tangled-roots copy it shows for any bug. No structured error reaches the client,
   and the server-side `captureException` silently no-ops if the `SENTRY_DSN` function secret
   is unset (no `agent-chat` events appeared in Sentry during today's incident — the secret is
   likely missing).

## App-reference files consulted

- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — chat surface contract (component graph, edge functions, error states, tier gating)
- `docs/app-reference/99-cross-cutting/13-ai-gemini.md` — Gemini call conventions, `logAiUsage` mandate
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — agent-chat entry
- `docs/app-reference/99-cross-cutting/20-error-handling.md` — Sentry / error-surface conventions
- `docs/app-reference/99-cross-cutting/17-tier-gating.md` — quota semantics (chat message limits)

Key facts extracted:
- `check_ai_message_quota` counts `ai_usage_log` rows where `function_name = 'agent-chat-message'`
  in a rolling 24 h window (migration `20260627030000_agent_chat_foundations.sql`). New rows
  logged under a **different** `function_name` cannot affect quota.
- `logAiUsage` (`_shared/aiUsage.ts`) + `estimateGeminiCostUsd` (`_shared/geminiCost.ts`) are the
  cost authority — per-model, cache/thoughts-aware. agent-chat is the only AI feature not using it.
- `callGeminiWithTools` (`_shared/gemini.ts`) already collects `perModelErrors` per cascade rung
  and throws a plain `Error` with a text summary when all models exhaust.
- `captureException` (`_shared/sentry.ts`) is a silent no-op without the `SENTRY_DSN` secret.
- `AIUsagePanel.tsx`, `AuditPage.tsx`, `admin/AiCallsAdmin.tsx` read `ai_usage_log` — new rows
  will (correctly) start appearing there; the orchestrator counter row stays as-is.

## Part A — accurate cost logging for agent-chat

### Source changes

**`supabase/functions/agent-chat/index.ts`** (`handleSendMessage`)
1. Collect a `usageEvents: Array<{ usage: GeminiUsage; action: string }>` entry after **every**
   `callGeminiWithTools` return — the three call sites: main loop round (`round_${n}`), forced
   retry (`forced_retry`), knowledge fallback (`knowledge_fallback`).
2. After the reply is finalised, fire one `logAiUsage(db, …)` per event with
   `functionName: "agent-chat"`, `homeId`, `userId`, `action`, `usage` (fire-and-forget,
   `Promise.all` not awaited on the response path — `logAiUsage` never throws). The final
   event additionally carries `prompt` (the user's message text) and `rawResult` (the final
   reply) for the audit view; intermediate rounds log usage only to avoid duplicating the
   large system prompt per round.
3. **Remove** the end-of-request best-effort `total_tokens` update on the latest
   `agent-chat-message` row. It double-counts against the new per-call rows and has a
   latest-row race under concurrent sends. The `agent-chat-message` row becomes a **pure
   quota counter** (zeros, as inserted) — its comment updated to say so.

**No migration needed** — `ai_usage_log` already has every column `logAiUsage` writes.

### Why per-call rows (not one aggregated row)

The cascade can answer different rounds with different models (Pro round 0, flash retry), and
pricing differs 10–20×. `estimateGeminiCostUsd` needs the actual model per call. Per-call rows
match the convention every other AI function already follows, and give the admin AI-calls view
model-level visibility — which is exactly what was missing when the eval burned the budget.

### Quota safety

`function_name: "agent-chat"` ≠ `"agent-chat-message"`, so `check_ai_message_quota` is
unaffected. Verified against the RPC definition.

## Part B — distinct "AI unavailable" error + operator alert

### Source changes

**`supabase/functions/_shared/gemini.ts`**
1. New exported class `GeminiCascadeExhaustedError extends Error` carrying
   `perModelErrors: Array<{ model, attempts, error }>` — thrown where the plain `Error` is
   thrown today (message text unchanged, so existing catch-by-message callers keep working).
2. New exported pure helper `classifyCascadeErrors(perModelErrors)` →
   `"billing" | "rate_limit" | "transient"`:
   - every rung's error mentions `spending cap` (or `billing`) → `billing`
   - every rung's error mentions `429` → `rate_limit`
   - anything else (503s, timeouts, mixed) → `transient`

**`supabase/functions/agent-chat/index.ts`**
3. Wrap `handleSendMessage`'s model-call section so a `GeminiCascadeExhaustedError` is caught
   distinctly:
   - Delete the placeholder assistant `chat_messages` row (currently left empty forever —
     today's incident left orphaned empty bubbles in history).
   - `captureException(FN, err, { reason, userId })` so Sentry can alert the operator with the
     classification.
   - Return `503` with a **structured body**:
     `{ error: "ai_unavailable", reason, message: "Rhozly's AI is temporarily unavailable…" }`.
   - The `agent-chat-message` quota row is **not** refunded (kept simple; during an outage no
     Gemini spend occurs and the daily counter resets anyway — flagged as a conscious choice).

**`src/lib/chatError.ts`** (new, pure — no React)
4. `chatErrorToUserMessage(body: unknown): { text: string; kind: "unavailable" | "quota" | "generic" }`
   mapping the parsed error body: `ai_unavailable` → "The garden AI is taking an unscheduled
   nap — your message wasn't lost, please try again in a little while."; `quota_exceeded` →
   the server-provided quota message (upgrade nudge included); anything else → the existing
   tangled-roots copy.

**`src/components/PlantDoctorChat.tsx`**
5. In the `catch` blocks of `handleSend` / `handleRegenerate`: when the error is a
   `FunctionsHttpError`, parse `err.context` (Response) JSON — supabase-js does not surface
   the body in `err.message` — and pass it through `chatErrorToUserMessage`; render the
   returned text as the assistant bubble (same UI path as today). Add
   `data-testid="chat-error-message"` to the error bubble.
   Note: the pre-existing tier-limit 429 (`quota_exceeded`) currently also collapses into
   tangled-roots — this fixes that for free.

**Operator alerting (config, not code)**
6. Run `supabase secrets list` (read-only) to confirm whether `SENTRY_DSN` is set for edge
   functions. If missing, setting it (`supabase secrets set SENTRY_DSN=…`) is a prod change —
   **done only on explicit user confirmation** in the implementation session. Once delivering,
   a Sentry alert rule on `tags.source:edge` gives the operator notification asked for
   (alert-rule creation is a dashboard step for the user; noted in the hand-off).

## Tests (mandatory tier mapping)

- **Deno** (`supabase/tests/`):
  - `geminiCascadeError.test.ts` (new) — `classifyCascadeErrors` truth table (all-spend-cap →
    billing; all-429 → rate_limit; mixed/503/timeout → transient); `GeminiCascadeExhaustedError`
    carries `perModelErrors` and the legacy message format.
  - `aiUsage.test.ts` (extend) — no change to `logAiUsage` itself expected; add a case only if
    the final-round prompt/rawResult convention needs a helper.
- **Vitest** (`tests/unit/lib/`):
  - `chatError.test.ts` (new) — `chatErrorToUserMessage` mapping for `ai_unavailable`,
    `quota_exceeded` (server message passthrough), malformed/absent body → generic.
- **Playwright**: no new E2E spec — simulating a full-cascade Gemini outage isn't feasible in
  the E2E environment; covered by the unit tiers. Test-plan doc rows updated to note this.

## Test documentation updates

- `docs/e2e-test-plan/09-plant-doctor.md` — note the new error-message variants + testid on the
  chat error bubble; mark rows accordingly.
- `TESTING.md § Current Test Inventory` — add the two new test files, bump counts.

## App-reference updates (same task)

- `05-tools/03-plant-doctor-chat.md` — Error states table: three distinct failure copies
  (unavailable / quota / generic); edge-functions section: agent-chat response codes (503
  `ai_unavailable`, 429 `quota_exceeded`); code references: add `src/lib/chatError.ts`.
- `99-cross-cutting/13-ai-gemini.md` — agent-chat now logs per-call usage via `logAiUsage`
  under `function_name: "agent-chat"`; the `agent-chat-message` row documented as pure quota
  counter; `GeminiCascadeExhaustedError` + classification documented as the cascade contract.
- `99-cross-cutting/10-edge-functions-catalogue.md` — agent-chat entry: response codes + usage
  logging note.
- `99-cross-cutting/20-error-handling.md` — edge-function Sentry reporting requires the
  `SENTRY_DSN` function secret (silent no-op otherwise); new `ai_unavailable` code.

## Risks / edge cases

- **Double counting:** removing the `total_tokens` update on the counter row is what prevents
  it — admin views summing tokens by function will see `agent-chat` rows (real) and
  `agent-chat-message` rows (always 0). Historical rows keep their old summed values; noted in
  the app-reference so nobody "fixes" the zeros later.
- **Typed error compatibility:** other callers of `callGeminiWithTools` catch generic errors —
  subclassing `Error` with the same message keeps them all working unchanged.
- **`err.context` body parsing:** the Response body is single-read; parse defensively
  (`try/await .json()/catch`) and fall back to generic copy.
- **Latency:** per-call `logAiUsage` inserts are fire-and-forget after the reply is composed —
  no user-visible latency added.
- **Placeholder-row deletion:** scoped `.eq("id", assistantMsg.id)` — cannot touch other rows.

## Out of scope

- Raising the Google spend cap (user action at https://ai.studio/spend — the actual incident fix).
- Backfilling July's missing cost data (unknowable retroactively — usage detail wasn't stored).
- Sentry alert-rule creation (dashboard step for the operator).
- Cost logging for `plant-doctor-ai` (vision path) — already routes through its own logging.

## Implementation notes (2026-07-14)

- Implemented as planned; both cascade functions (`callGeminiCascade` + `callGeminiWithTools`)
  now throw the typed error — the non-tool path had the identical throw site, and the subclass
  is drop-in compatible.
- The 503 handling lives in a local `aiUnavailable` closure inside `handleSendMessage`, with
  narrow try/catch at the two cascade call sites (keeps the big agent loop unindented). The
  knowledge-fallback site keeps its own swallow-and-degrade behaviour (if the cascade dies
  mid-turn after tools already ran, the user still gets the canned reply).
- Per-call usage rows are awaited (`Promise.all`) rather than fire-and-forget — Deno edge
  runtime can cut off post-response work, and `logAiUsage` never throws.
- **SENTRY_DSN finding revised:** the secret IS set — `source:edge` events exist through
  2026-07-09. But no cascade-exhausted event arrived during the 2026-07-14 incident (searched
  `fn:agent-chat` and "Gemini models exhausted", 7d). Root cause of that gap unconfirmed;
  verify after deploy by sending a chat message while the spend cap is still tripped — the new
  path must produce a 503 client-side, no empty history bubble, and a `cascade_exhausted`
  Sentry event tagged `reason: billing`. If the event still doesn't arrive, investigate
  `captureException` delivery (3s abort timeout, envelope format) as a follow-up.
- CLI auth wasn't available in the implementation session (`supabase secrets list` needs a
  logged-in terminal) — the secret's presence was inferred from delivered events instead.
- **Fresh code-reviewer verdict: ship** (no blocking findings). Two notable outcomes:
  (1) it confirmed the change *fixes a silent money-path bug* — `ai_cost_rollup_for_stripe`
  sums `estimated_cost_usd` with no function filter, so chat spend previously rolled up to
  Stripe as $0; (2) its one LOW finding was applied — the cascade throw sites now always
  prefix `Gemini HTTP <status>` into the message (making the 429/503 retry + classification
  matching reliable), and the `billing` regex was tightened so Google's plain-quota copy
  ("check your plan and billing details") classifies as `rate_limit`, not `billing`.
  Side-effect noted by review, accepted: the `calls_30d` metric mirrored to Stripe metadata
  now counts per-Gemini-call rows (+1 counter row) per turn instead of 1 — it's an internal
  observability figure, not customer-visible.

## Release notes

Add to `release-notes.json` under the next bump: "Garden AI now tells you clearly when the AI
service itself is unavailable (instead of a generic error), and AI usage costs are tracked
accurately in the admin audit views."
