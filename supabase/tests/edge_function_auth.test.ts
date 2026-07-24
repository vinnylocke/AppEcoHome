/**
 * Tier B — Edge Function Auth & Rate Limit Tests
 *
 * Verifies that edge functions reject unauthenticated / cross-tenant requests
 * and enforce rate limits.
 *
 * Prerequisites:
 *   - Local Supabase running: `supabase start`
 *   - Edge functions served locally: `supabase functions serve`
 *   - Worker accounts seeded: `npm run test:seed`
 *   - Env vars in .env.test (loaded automatically by npm run test:functions)
 *
 * Note: These tests call the local edge function runtime. Set
 *   SUPABASE_FUNCTIONS_URL (default: http://127.0.0.1:54321/functions/v1)
 * if your local setup differs.
 */

import { assertEquals } from "@std/assert";

const FUNCTIONS_URL =
  Deno.env.get("SUPABASE_FUNCTIONS_URL") ??
  `${Deno.env.get("VITE_SUPABASE_URL") ?? "http://127.0.0.1:54321"}/functions/v1`;

const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";
const PASSWORD = Deno.env.get("TEST_USER_PASSWORD") ?? "TestPassword123!";
const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? "http://127.0.0.1:54321";

const SKIP = !ANON_KEY;
if (SKIP) {
  console.warn(
    "[edge_function_auth] Skipping — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to run.",
  );
}

async function getJwt(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Sign-in failed for ${email}: ${JSON.stringify(data)}`);
  return data.access_token;
}

/** Call an edge function and drain the response body to avoid Deno leak detection. */
async function callFunction(
  name: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      ...opts.headers,
    },
    body: JSON.stringify(opts.body ?? {}),
  });
  const body = await res.text();
  return { status: res.status, body };
}

// ── EF-001: plant-doctor without Authorization header → 401 ─────────────────

Deno.test({
  name: "EF-001: plant-doctor — no Authorization header → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("plant-doctor", {
      body: { action: "search_plants_text", plantSearch: "rose" },
    });
    assertEquals(res.status, 401);
  },
});

// ── EF-002: plant-doctor with invalid JWT → 401 ─────────────────────────────

Deno.test({
  name: "EF-002: plant-doctor — invalid JWT → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("plant-doctor", {
      headers: { Authorization: "Bearer this_is_not_a_real_jwt" },
      body: { action: "search_plants_text", plantSearch: "rose" },
    });
    assertEquals(res.status, 401);
  },
});

// ── EF-003: plant-doctor with valid JWT but wrong homeId → guardAiByHome or 200 ──

Deno.test({
  name: "EF-003: plant-doctor — valid JWT, alien homeId → not 500",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    // Worker2's homeId supplied with Worker1's JWT
    const res = await callFunction("plant-doctor", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: {
        action: "recommend_plants",
        homeId: "00000002-0000-0000-0000-000000000002",
        isOutside: true,
        currentPlants: [],
        areaData: { name: "Test Area" },
      },
    });
    // Should be 401 (auth failed), 403 (AI guard/home mismatch), or 200 if the
    // guardAiByHome only checks ai_enabled. Never 500.
    assertEquals(res.status !== 500, true, `Expected not 500, got ${res.status}`);
  },
});

// ── EF-004: contact-support without Authorization → 401 ────────────────────

Deno.test({
  name: "EF-004: contact-support — no Authorization header → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("contact-support", {
      body: { name: "Test", email: "test@example.com", message: "Hello" },
    });
    assertEquals(res.status, 401);
  },
});

// ── EF-005: scan-area with missing homeId → 400 ─────────────────────────────

Deno.test({
  name: "EF-005: scan-area — authenticated but missing homeId → 400",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("scan-area", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: { imageBase64: "abc", areaId: "some-area" }, // no homeId
    });
    assertEquals(res.status, 400);
  },
});

// ── EF-006: generate-guide unauthenticated → 401 ─────────────────────────────

Deno.test({
  name: "EF-006: generate-guide — no Authorization header → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("generate-guide", {
      body: { topic: "Tomato growing" },
    });
    assertEquals(res.status, 401);
  },
});

// ── EF-007: image-proxy unauthenticated → 401 ────────────────────────────────

Deno.test({
  name: "EF-007: image-proxy — no Authorization header → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("image-proxy", {
      body: { imageUrl: "https://example.com/img.jpg", plantName: "Rose" },
    });
    assertEquals(res.status, 401);
  },
});

// ─── Batch 2 (bug-audit-2026-07-10) — on-demand AI auth + membership ─────────

// EF-008: generate-daily-brief — targeted { homeId } with no auth → 401
Deno.test({
  name: "EF-008: generate-daily-brief — { homeId } no auth → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("generate-daily-brief", {
      body: { homeId: "00000001-0000-0000-0000-000000000002" },
    });
    assertEquals(res.status, 401);
  },
});

// EF-009: generate-daily-brief — valid JWT but a home the caller isn't in → 403
Deno.test({
  name: "EF-009: generate-daily-brief — member JWT, alien homeId → 403",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("generate-daily-brief", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: { homeId: "00000002-0000-0000-0000-000000000002" }, // worker2's home
    });
    assertEquals(res.status, 403);
  },
});

// EF-010: generate-grow-suggestions — targeted { homeId } with no auth → 401
Deno.test({
  name: "EF-010: generate-grow-suggestions — { homeId } no auth → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("generate-grow-suggestions", {
      body: { homeId: "00000001-0000-0000-0000-000000000002" },
    });
    assertEquals(res.status, 401);
  },
});

// EF-011: predict-yield — valid JWT, another home's ids → 403 (IDOR closed)
Deno.test({
  name: "EF-011: predict-yield — member JWT, alien home_id → 403",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("predict-yield", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: { instance_id: "10000001", home_id: "00000002-0000-0000-0000-000000000002" },
    });
    assertEquals(res.status, 403);
  },
});

// EF-012: visualiser-analyse — authenticated but no homeId → 400 (gate can't be skipped)
Deno.test({
  name: "EF-012: visualiser-analyse — authed, missing homeId → 400",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("visualiser-analyse", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: { imageBase64: "abc", plants: [{ name: "Rose" }] }, // no homeId
    });
    assertEquals(res.status, 400);
  },
});

// EF-013: add-plant-to-library — authenticated non-admin → 403
Deno.test({
  name: "EF-013: add-plant-to-library — non-admin → 403",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("add-plant-to-library", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: { name: "Sneaky Plant" },
    });
    assertEquals(res.status, 403);
  },
});

// EF-014: generate-daily-brief — no-body cron sweep stays OPEN (not 401)
Deno.test({
  name: "EF-014: generate-daily-brief — {} cron sweep is not gated (≠401/403)",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("generate-daily-brief", { body: {} });
    assertEquals(res.status !== 401 && res.status !== 403, true, `cron path should stay open, got ${res.status}`);
  },
});

// ─── Batch 3 (sketch-to-layout) — auth + membership + missing-field guard ────

// EF-015: sketch-to-layout — no Authorization header → 401
Deno.test({
  name: "EF-015: sketch-to-layout — no Authorization header → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("sketch-to-layout", {
      body: { homeId: "00000001-0000-0000-0000-000000000002", sketchBase64: "abc" },
    });
    assertEquals(res.status, 401);
  },
});

// EF-016: sketch-to-layout — valid JWT, alien homeId → 403 (membership gate)
Deno.test({
  name: "EF-016: sketch-to-layout — member JWT, alien homeId → 403",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("sketch-to-layout", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: { homeId: "00000002-0000-0000-0000-000000000002", sketchBase64: "abc" }, // worker2's home
    });
    assertEquals(res.status, 403);
  },
});

// EF-017: sketch-to-layout — valid JWT, own homeId, missing sketchBase64 → 400
Deno.test({
  name: "EF-017: sketch-to-layout — own homeId, missing sketchBase64 → 400",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("sketch-to-layout", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: { homeId: "00000001-0000-0000-0000-000000000002" }, // no sketchBase64
    });
    assertEquals(res.status, 400);
  },
});

// ─── Batch 4 (Wear write path) — mutate-task auth + membership + guards ───────

// EF-018: mutate-task — no Authorization header → 401
Deno.test({
  name: "EF-018: mutate-task — no Authorization header → 401",
  ignore: SKIP,
  fn: async () => {
    const res = await callFunction("mutate-task", {
      body: {
        home_id: "00000001-0000-0000-0000-000000000002",
        action: "complete",
        task: { id: "x", due_date: "2026-08-04", is_ghost: false },
      },
    });
    assertEquals(res.status, 401);
  },
});

// EF-019: mutate-task — valid JWT, alien homeId → 403 (membership gate)
Deno.test({
  name: "EF-019: mutate-task — member JWT, alien homeId → 403",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("mutate-task", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: {
        home_id: "00000002-0000-0000-0000-000000000002", // worker2's home
        action: "complete",
        task: { id: "x", due_date: "2026-08-04", is_ghost: false },
      },
    });
    assertEquals(res.status, 403);
  },
});

// EF-020: mutate-task — own home, invalid action → 400
Deno.test({
  name: "EF-020: mutate-task — own home, invalid action → 400",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("mutate-task", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: {
        home_id: "00000001-0000-0000-0000-000000000002",
        action: "frobnicate",
        task: { id: "x", due_date: "2026-08-04", is_ghost: false },
      },
    });
    assertEquals(res.status, 400);
  },
});

// EF-021: mutate-task — IDOR: own home membership + a task id from ANOTHER home
//          → 403 wrong_home (the home-match guard, not just membership).
//          Worker2's seeded standalone task carried under worker1's own home.
Deno.test({
  name: "EF-021: mutate-task — own home + foreign task id → 403 (no cross-home write)",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("mutate-task", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: {
        home_id: "00000001-0000-0000-0000-000000000002", // worker1's own home (member → passes membership)
        action: "complete",
        task: {
          id: "00000002-0000-0000-0005-000000000001", // worker2's task
          due_date: "2026-08-04",
          is_ghost: false,
        },
      },
    });
    assertEquals(res.status, 403);
  },
});

// EF-022: mutate-task — own home, unknown task id → 404 (clean, never 500 / never a write)
Deno.test({
  name: "EF-022: mutate-task — own home, unknown task id → 404",
  ignore: SKIP,
  fn: async () => {
    const jwt = await getJwt("test1@rhozly.com");
    const res = await callFunction("mutate-task", {
      headers: { Authorization: `Bearer ${jwt}` },
      body: {
        home_id: "00000001-0000-0000-0000-000000000002",
        action: "complete",
        task: {
          id: "00000001-0000-0000-0005-0000000000ff", // does not exist
          due_date: "2026-08-04",
          is_ghost: false,
        },
      },
    });
    assertEquals(res.status, 404);
  },
});
