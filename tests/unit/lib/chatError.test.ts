import { describe, it, expect } from "vitest";
import {
  chatErrorToUserMessage,
  parseFunctionsErrorBody,
  AI_UNAVAILABLE_CHAT_ERROR,
  QUOTA_CHAT_ERROR,
  GENERIC_CHAT_ERROR,
} from "../../../src/lib/chatError";

describe("chatErrorToUserMessage", () => {
  it("maps ai_unavailable to the distinct outage copy", () => {
    const p = chatErrorToUserMessage({ error: "ai_unavailable", reason: "billing" });
    expect(p.kind).toBe("unavailable");
    expect(p.text).toBe(AI_UNAVAILABLE_CHAT_ERROR);
  });

  it("prefers the server-provided message when present", () => {
    const p = chatErrorToUserMessage({
      error: "ai_unavailable",
      message: "Rhozly's AI is having a lie-down — back soon.",
    });
    expect(p.kind).toBe("unavailable");
    expect(p.text).toBe("Rhozly's AI is having a lie-down — back soon.");
  });

  it("maps quota_exceeded with the server's tier-specific message", () => {
    const p = chatErrorToUserMessage({
      error: "quota_exceeded",
      message: "You've reached today's chat message limit for the sage tier (100 per day). Upgrade to keep chatting.",
    });
    expect(p.kind).toBe("quota");
    expect(p.text).toContain("sage tier");
  });

  it("falls back to canned quota copy when the server message is missing", () => {
    expect(chatErrorToUserMessage({ error: "quota_exceeded" }).text).toBe(QUOTA_CHAT_ERROR);
    expect(chatErrorToUserMessage({ error: "quota_exceeded", message: "  " }).text).toBe(
      QUOTA_CHAT_ERROR,
    );
  });

  it("stays generic for unknown codes, plain errors, and malformed bodies", () => {
    for (const body of [
      null,
      undefined,
      {},
      { error: "Unknown action: nonsense" },
      { error: 503 },
      "GEMINI_API_KEY not configured",
    ]) {
      const p = chatErrorToUserMessage(body);
      expect(p.kind).toBe("generic");
      expect(p.text).toBe(GENERIC_CHAT_ERROR);
    }
  });
});

describe("parseFunctionsErrorBody", () => {
  it("extracts the JSON body from a FunctionsHttpError-shaped error", async () => {
    const err = {
      name: "FunctionsHttpError",
      context: new Response(JSON.stringify({ error: "ai_unavailable", reason: "billing" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    };
    expect(await parseFunctionsErrorBody(err)).toEqual({
      error: "ai_unavailable",
      reason: "billing",
    });
  });

  it("returns null for plain Errors and unreadable bodies", async () => {
    expect(await parseFunctionsErrorBody(new Error("boom"))).toBeNull();
    expect(await parseFunctionsErrorBody(null)).toBeNull();
    expect(
      await parseFunctionsErrorBody({ context: new Response("<html>bad gateway</html>") }),
    ).toBeNull();
  });

  it("returns null when the body was already consumed", async () => {
    const res = new Response(JSON.stringify({ error: "ai_unavailable" }));
    await res.json(); // consume
    expect(await parseFunctionsErrorBody({ context: res })).toBeNull();
  });
});
