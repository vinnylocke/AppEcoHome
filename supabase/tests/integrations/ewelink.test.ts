import { assertEquals, assertNotEquals, assertMatch } from "@std/assert";
import { hmacSign, ewelinkHeaders, buildOAuthUrl, regionToApiBase } from "@shared/integrations/ewelinkAuth.ts";
import {
  resolveEffectiveDuration,
  buildControlPayload,
  parseDeviceState,
} from "@shared/integrations/ewelinkDevice.ts";

// ─────────────────────────────────────────────────────────────────────────────
// hmacSign
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("hmacSign — produces known Base64 output for known inputs", async () => {
  const result = await hmacSign("test_secret", "test_body");
  assertEquals(result, "v2uUqCFQ3M8RlmFJt/vZtTJezDj+wTqi+v0vQDDj3Y8=");
});

Deno.test("hmacSign — different messages produce different signatures", async () => {
  const a = await hmacSign("test_secret", "message_a");
  const b = await hmacSign("test_secret", "message_b");
  assertNotEquals(a, b);
});

Deno.test("hmacSign — different secrets produce different signatures", async () => {
  const a = await hmacSign("secret_a", "same_message");
  const b = await hmacSign("secret_b", "same_message");
  assertNotEquals(a, b);
});

Deno.test("hmacSign — signing contract for get_oauth_url matches known vector", async () => {
  // get_oauth_url signs: `${appId}_${seq}`
  const result = await hmacSign("test_secret", "appId123_1700000000000");
  assertEquals(result, "+YsHok9WNqSCek+F/8yNzpdoJv0lU+voY5laO+16DG4=");
});

Deno.test("hmacSign — same inputs always produce the same output (deterministic)", async () => {
  const a = await hmacSign("my_secret", "my_message");
  const b = await hmacSign("my_secret", "my_message");
  assertEquals(a, b);
});

// ─────────────────────────────────────────────────────────────────────────────
// ewelinkHeaders
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("ewelinkHeaders — returns all five required keys", async () => {
  const h = await ewelinkHeaders("app123", "secret", '{"test":1}');
  const keys = Object.keys(h).sort();
  assertEquals(keys, ["Authorization", "Content-Type", "X-CK-Appid", "X-CK-Nonce", "X-CK-Ts"]);
});

Deno.test("ewelinkHeaders — X-CK-Appid equals the appId argument", async () => {
  const h = await ewelinkHeaders("my_app_id", "secret", "{}");
  assertEquals(h["X-CK-Appid"], "my_app_id");
});

Deno.test("ewelinkHeaders — Authorization starts with 'Sign '", async () => {
  const h = await ewelinkHeaders("app", "secret", "{}");
  assertEquals(h["Authorization"].startsWith("Sign "), true);
});

Deno.test("ewelinkHeaders — X-CK-Nonce is exactly 8 characters", async () => {
  const h = await ewelinkHeaders("app", "secret", "{}");
  assertEquals(h["X-CK-Nonce"].length, 8);
});

Deno.test("ewelinkHeaders — X-CK-Ts is a numeric string close to current epoch seconds", async () => {
  const before = Math.floor(Date.now() / 1000);
  const h = await ewelinkHeaders("app", "secret", "{}");
  const after = Math.floor(Date.now() / 1000);
  const ts = parseInt(h["X-CK-Ts"], 10);
  assertEquals(isNaN(ts), false);
  assertEquals(ts >= before && ts <= after, true);
});

Deno.test("ewelinkHeaders — Authorization changes when body changes", async () => {
  const h1 = await ewelinkHeaders("app", "secret", '{"a":1}');
  const h2 = await ewelinkHeaders("app", "secret", '{"b":2}');
  assertNotEquals(h1["Authorization"], h2["Authorization"]);
});

Deno.test("ewelinkHeaders — Content-Type is application/json", async () => {
  const h = await ewelinkHeaders("app", "secret", "{}");
  assertEquals(h["Content-Type"], "application/json");
});

// ─────────────────────────────────────────────────────────────────────────────
// buildOAuthUrl
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("buildOAuthUrl — returned URL contains all six required params", async () => {
  const { oauthUrl } = await buildOAuthUrl("myApp", "mySecret", "https://rhozly.com/integrations");
  const params = new URLSearchParams(new URL(oauthUrl).search);
  assertEquals(params.has("clientId"), true);
  assertEquals(params.has("seq"), true);
  assertEquals(params.has("authorization"), true);
  assertEquals(params.has("redirectUrl"), true);
  assertEquals(params.has("state"), true);
  assertEquals(params.has("nonce"), true);
});

Deno.test("buildOAuthUrl — redirectUrl param is URL-encoded", async () => {
  const { oauthUrl } = await buildOAuthUrl("app", "secret", "https://rhozly.com/integrations");
  assertEquals(oauthUrl.includes("https%3A"), true);
});

Deno.test("buildOAuthUrl — clientId equals the appId argument", async () => {
  const { oauthUrl } = await buildOAuthUrl("my_client_id", "secret", "https://example.com");
  const params = new URLSearchParams(new URL(oauthUrl).search);
  assertEquals(params.get("clientId"), "my_client_id");
});

Deno.test("buildOAuthUrl — state is a non-empty UUID-shaped string", async () => {
  const { state } = await buildOAuthUrl("app", "secret", "https://example.com");
  assertMatch(state, /^[0-9a-f-]{36}$/);
});

Deno.test("buildOAuthUrl — two calls produce different state values", async () => {
  const { state: s1 } = await buildOAuthUrl("app", "secret", "https://example.com");
  const { state: s2 } = await buildOAuthUrl("app", "secret", "https://example.com");
  assertNotEquals(s1, s2);
});

Deno.test("buildOAuthUrl — authorization param is non-empty Base64", async () => {
  const { oauthUrl } = await buildOAuthUrl("app", "secret", "https://example.com");
  const params = new URLSearchParams(new URL(oauthUrl).search);
  const auth = params.get("authorization") ?? "";
  assertEquals(auth.length > 0, true);
  assertMatch(auth, /^[A-Za-z0-9+/]+=*$/);
});

Deno.test("buildOAuthUrl — grantType param is 'authorization_code'", async () => {
  const { oauthUrl } = await buildOAuthUrl("app", "secret", "https://example.com");
  const params = new URLSearchParams(new URL(oauthUrl).search);
  assertEquals(params.get("grantType"), "authorization_code");
});

// ─────────────────────────────────────────────────────────────────────────────
// regionToApiBase
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("regionToApiBase — eu maps to EU endpoint", () => {
  assertEquals(regionToApiBase("eu"), "https://eu-apia.coolkit.cc");
});

Deno.test("regionToApiBase — us maps to Americas endpoint", () => {
  assertEquals(regionToApiBase("us"), "https://us-apia.coolkit.cc");
});

Deno.test("regionToApiBase — as maps to Asia endpoint", () => {
  assertEquals(regionToApiBase("as"), "https://as-apia.coolkit.cc");
});

Deno.test("regionToApiBase — cn maps to China endpoint", () => {
  assertEquals(regionToApiBase("cn"), "https://cn-apia.coolkit.cn");
});

Deno.test("regionToApiBase — unknown region defaults to EU", () => {
  assertEquals(regionToApiBase("xx"), "https://eu-apia.coolkit.cc");
});

Deno.test("regionToApiBase — undefined defaults to EU", () => {
  assertEquals(regionToApiBase(undefined), "https://eu-apia.coolkit.cc");
});

Deno.test("regionToApiBase — empty string defaults to EU", () => {
  assertEquals(regionToApiBase(""), "https://eu-apia.coolkit.cc");
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEffectiveDuration
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("resolveEffectiveDuration — explicit arg takes priority", () => {
  assertEquals(resolveEffectiveDuration(600, { default_duration_seconds: 300 }), 600);
});

Deno.test("resolveEffectiveDuration — falls back to meta.default_duration_seconds", () => {
  assertEquals(resolveEffectiveDuration(undefined, { default_duration_seconds: 900 }), 900);
});

Deno.test("resolveEffectiveDuration — falls back to 1800 when both absent", () => {
  assertEquals(resolveEffectiveDuration(undefined, {}), 1800);
});

Deno.test("resolveEffectiveDuration — falls back to 1800 when meta value is not a number", () => {
  assertEquals(resolveEffectiveDuration(undefined, { default_duration_seconds: "bad" }), 1800);
});

// ─────────────────────────────────────────────────────────────────────────────
// buildControlPayload — direct device
// ─────────────────────────────────────────────────────────────────────────────

const directMeta = { use_sub_device: false, direct_device_id: "dev-abc" };

Deno.test("buildControlPayload — direct turn_on: correct apiPath", () => {
  const { apiPath } = buildControlPayload(directMeta, "turn_on", 300);
  assertEquals(apiPath, "/v2/device/thing/status");
});

Deno.test("buildControlPayload — direct turn_on: payload id is direct_device_id", () => {
  const { payload } = buildControlPayload(directMeta, "turn_on", 300);
  assertEquals(payload.id, "dev-abc");
});

Deno.test("buildControlPayload — direct turn_on: params.switch is 'on'", () => {
  const { payload } = buildControlPayload(directMeta, "turn_on", 300);
  const params = payload.params as Record<string, unknown>;
  assertEquals(params.switch, "on");
});

Deno.test("buildControlPayload — direct turn_on: countdown equals durationSeconds", () => {
  const { payload } = buildControlPayload(directMeta, "turn_on", 300);
  const params = payload.params as Record<string, unknown>;
  assertEquals(params.countdown, 300);
});

Deno.test("buildControlPayload — direct turn_off: params.switch is 'off'", () => {
  const { payload } = buildControlPayload(directMeta, "turn_off", 300);
  const params = payload.params as Record<string, unknown>;
  assertEquals(params.switch, "off");
});

Deno.test("buildControlPayload — direct turn_off: countdown is absent", () => {
  const { payload } = buildControlPayload(directMeta, "turn_off", 300);
  const params = payload.params as Record<string, unknown>;
  assertEquals("countdown" in params, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// buildControlPayload — sub-device
// ─────────────────────────────────────────────────────────────────────────────

const subMeta = {
  use_sub_device: true,
  parent_device_id: "bridge-xyz",
  sub_device_id: "sub-001",
};

Deno.test("buildControlPayload — sub-device turn_on: correct apiPath", () => {
  const { apiPath } = buildControlPayload(subMeta, "turn_on", 600);
  assertEquals(apiPath, "/v2/device/thing/sub/status");
});

Deno.test("buildControlPayload — sub-device turn_on: payload id is parent_device_id", () => {
  const { payload } = buildControlPayload(subMeta, "turn_on", 600);
  assertEquals(payload.id, "bridge-xyz");
});

Deno.test("buildControlPayload — sub-device turn_on: switches[0].switch is 'on'", () => {
  const { payload } = buildControlPayload(subMeta, "turn_on", 600);
  const params = payload.params as Record<string, unknown>;
  const switches = params.switches as Array<Record<string, unknown>>;
  assertEquals(switches[0].switch, "on");
});

Deno.test("buildControlPayload — sub-device turn_on: switches[0].outlet is 0", () => {
  const { payload } = buildControlPayload(subMeta, "turn_on", 600);
  const params = payload.params as Record<string, unknown>;
  const switches = params.switches as Array<Record<string, unknown>>;
  assertEquals(switches[0].outlet, 0);
});

Deno.test("buildControlPayload — sub-device turn_on: countdown in switches[0]", () => {
  const { payload } = buildControlPayload(subMeta, "turn_on", 600);
  const params = payload.params as Record<string, unknown>;
  const switches = params.switches as Array<Record<string, unknown>>;
  assertEquals(switches[0].countdown, 600);
});

Deno.test("buildControlPayload — sub-device turn_on: subDevId in params", () => {
  const { payload } = buildControlPayload(subMeta, "turn_on", 600);
  const params = payload.params as Record<string, unknown>;
  assertEquals(params.subDevId, "sub-001");
});

Deno.test("buildControlPayload — sub-device turn_off: switches[0].switch is 'off'", () => {
  const { payload } = buildControlPayload(subMeta, "turn_off", 600);
  const params = payload.params as Record<string, unknown>;
  const switches = params.switches as Array<Record<string, unknown>>;
  assertEquals(switches[0].switch, "off");
});

Deno.test("buildControlPayload — sub-device turn_off: countdown absent from switches[0]", () => {
  const { payload } = buildControlPayload(subMeta, "turn_off", 600);
  const params = payload.params as Record<string, unknown>;
  const switches = params.switches as Array<Record<string, unknown>>;
  assertEquals("countdown" in switches[0], false);
});

// ─────────────────────────────────────────────────────────────────────────────
// parseDeviceState
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("parseDeviceState — direct device 'on'", () => {
  assertEquals(parseDeviceState({ params: { switch: "on" } }), "on");
});

Deno.test("parseDeviceState — direct device 'off'", () => {
  assertEquals(parseDeviceState({ params: { switch: "off" } }), "off");
});

Deno.test("parseDeviceState — sub-device switches array 'on'", () => {
  assertEquals(parseDeviceState({ params: { switches: [{ switch: "on" }] } }), "on");
});

Deno.test("parseDeviceState — sub-device switches array 'off'", () => {
  assertEquals(parseDeviceState({ params: { switches: [{ switch: "off" }] } }), "off");
});

Deno.test("parseDeviceState — missing switch field defaults to 'off'", () => {
  assertEquals(parseDeviceState({ params: {} }), "off");
});

Deno.test("parseDeviceState — empty data defaults to 'off'", () => {
  assertEquals(parseDeviceState({}), "off");
});

Deno.test("parseDeviceState — unrecognised switch value defaults to 'off'", () => {
  assertEquals(parseDeviceState({ params: { switch: "unknown" } }), "off");
});
