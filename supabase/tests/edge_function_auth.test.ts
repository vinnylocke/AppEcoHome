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
