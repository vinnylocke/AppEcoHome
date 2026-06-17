import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  buildControlPreview,
  parseHeaderBlock,
  DEFAULT_CONTROL_BODY,
  DEFAULT_CONTROL_HEADERS,
} from "../../../src/lib/payloadTemplate";

describe("renderTemplate (frontend preview mirror)", () => {
  it("substitutes variables", () => {
    expect(
      renderTemplate('{"command":"{{command}}","duration_seconds":{{duration_seconds}}}', {
        command: "turn_on",
        duration_seconds: 1800,
      }),
    ).toBe('{"command":"turn_on","duration_seconds":1800}');
  });

  it("throws on an unknown placeholder (parity with the Deno renderer)", () => {
    expect(() => renderTemplate("{{durtion}}", { duration_seconds: 1 })).toThrow(
      "unknown_template_variable: durtion",
    );
  });
});

describe("parseHeaderBlock", () => {
  it("parses Key: Value lines and flags malformed ones", () => {
    expect(parseHeaderBlock("Content-Type: application/json").headers["Content-Type"]).toBe(
      "application/json",
    );
    expect(parseHeaderBlock("oops").error).toBeTruthy();
  });
});

describe("buildControlPreview", () => {
  it("renders the default request with sample values", () => {
    const r = buildControlPreview({
      url: "https://valve.example.com/control",
      method: "POST",
      headers: DEFAULT_CONTROL_HEADERS,
      body: DEFAULT_CONTROL_BODY,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("POST https://valve.example.com/control");
      expect(r.text).toContain("Content-Type: application/json");
      expect(r.text).toContain('"command":"turn_on"');
      expect(r.text).toContain('"duration_seconds":1800');
    }
  });

  it("reports an unknown-variable template error", () => {
    const r = buildControlPreview({ url: "https://x.example.com", body: "{{nope}}" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unknown_template_variable");
  });

  it("reports a non-JSON body under a JSON content type", () => {
    const r = buildControlPreview({
      url: "https://x.example.com",
      headers: "Content-Type: application/json",
      body: "command={{command}}",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("control_body_not_json");
  });
});
