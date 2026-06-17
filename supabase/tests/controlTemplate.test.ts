import { assert, assertEquals, assertThrows } from "@std/assert";
import { renderTemplate, templateVarsUsed } from "@shared/integrations/template.ts";
import { checkControlUrl } from "@shared/integrations/urlSafety.ts";

// ── renderTemplate ──────────────────────────────────────────────────────────

const VARS = {
  command: "turn_on",
  duration_seconds: 1800,
  device_external_id: "garage-tap",
};

Deno.test("renderTemplate — substitutes string + number vars", () => {
  assertEquals(
    renderTemplate('{"command":"{{command}}","duration_seconds":{{duration_seconds}}}', VARS),
    '{"command":"turn_on","duration_seconds":1800}',
  );
});

Deno.test("renderTemplate — tolerates inner whitespace", () => {
  assertEquals(renderTemplate("{{ command }}", VARS), "turn_on");
});

Deno.test("renderTemplate — leaves plain text untouched", () => {
  assertEquals(renderTemplate("on", VARS), "on");
});

Deno.test("renderTemplate — throws on unknown placeholder (typo protection)", () => {
  assertThrows(
    () => renderTemplate("{{durtion_seconds}}", VARS),
    Error,
    "unknown_template_variable: durtion_seconds",
  );
});

Deno.test("renderTemplate — no expression eval (only {{name}} tokens)", () => {
  // Anything that isn't a bare {{name}} is left verbatim — no logic runs.
  assertEquals(renderTemplate("{{command}} && rm -rf /", VARS), "turn_on && rm -rf /");
});

Deno.test("templateVarsUsed — lists distinct placeholders", () => {
  assertEquals(
    templateVarsUsed("{{command}} {{duration_seconds}} {{command}}").sort(),
    ["command", "duration_seconds"],
  );
});

// ── checkControlUrl ─────────────────────────────────────────────────────────

Deno.test("checkControlUrl — accepts a public https url", () => {
  assert(checkControlUrl("https://valve.example.com/control").ok);
});

Deno.test("checkControlUrl — rejects http", () => {
  assertEquals(checkControlUrl("http://valve.example.com").error, "url_must_be_https");
});

Deno.test("checkControlUrl — rejects garbage", () => {
  assertEquals(checkControlUrl("not a url").error, "invalid_url");
});

Deno.test("checkControlUrl — blocks private / loopback / metadata hosts", () => {
  for (
    const host of [
      "https://127.0.0.1/x",
      "https://localhost/x",
      "https://10.0.0.5/x",
      "https://192.168.1.20/x",
      "https://172.16.4.4/x",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x",
      "https://valve.local/x",
    ]
  ) {
    const r = checkControlUrl(host);
    assert(!r.ok, `expected ${host} to be blocked`);
    assertEquals(r.error, "url_host_not_allowed");
  }
});
