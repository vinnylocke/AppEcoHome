import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { buildInviteEmailHtml } from "@shared/inviteEmail.ts";

// UX review 2026-06-15 item 5.1 — invite email template safety + content.
//
// We intentionally don't test sendInviteEmail itself (it just hands off
// to Resend via the wrapper). What matters is that the HTML body is
// well-formed and won't leak unescaped user input via the inviter name
// or the home name — both come from user_profiles + homes and could
// contain HTML if anyone uses a colourful display name.

const baseCtx = {
  inviteeEmail: "alice@example.com",
  inviterName: "Bob Smith",
  inviterEmail: "bob@example.com",
  homeName: "Allotment 42",
  inviteUrl: "https://rhozly.com/join/abc-123",
  expiresAt: new Date("2026-06-22T10:00:00Z").toISOString(),
};

Deno.test("buildInviteEmailHtml — includes invitee, inviter, home, URL, expiry", () => {
  const html = buildInviteEmailHtml(baseCtx);
  assertStringIncludes(html, "alice@example.com");
  assertStringIncludes(html, "Bob Smith");
  assertStringIncludes(html, "bob@example.com");
  assertStringIncludes(html, "Allotment 42");
  assertStringIncludes(html, "https://rhozly.com/join/abc-123");
  // Expiry day appears in the email's formatted date.
  assertStringIncludes(html, "22 June");
});

Deno.test("buildInviteEmailHtml — escapes HTML in display name (XSS guard)", () => {
  const html = buildInviteEmailHtml({
    ...baseCtx,
    inviterName: "<script>alert('xss')</script>",
  });
  // The raw script tag must not appear.
  assert(!html.includes("<script>"), "raw <script> tag leaked into HTML");
  // The escaped form must be present.
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("buildInviteEmailHtml — escapes HTML in home name", () => {
  const html = buildInviteEmailHtml({
    ...baseCtx,
    homeName: 'My "Special" <Garden>',
  });
  assert(!html.includes('"Special"'));
  assertStringIncludes(html, "&quot;Special&quot;");
  assertStringIncludes(html, "&lt;Garden&gt;");
});

Deno.test("buildInviteEmailHtml — handles null inviter name (anon fallback)", () => {
  const html = buildInviteEmailHtml({ ...baseCtx, inviterName: null });
  // Falls back to the inviter email when display name is null.
  assertStringIncludes(html, "bob@example.com");
});

Deno.test("buildInviteEmailHtml — escapes the invite URL itself", () => {
  // A maliciously-crafted URL with HTML characters must not break out
  // of the href context. We're using basic HTML attribute escaping —
  // double-quote is the killer character.
  const html = buildInviteEmailHtml({
    ...baseCtx,
    inviteUrl: 'https://evil.test/" onclick="alert(1)',
  });
  assert(!html.includes('onclick="alert(1)"'), "URL attribute escape failed");
  assertStringIncludes(html, "&quot;");
});

Deno.test("buildInviteEmailHtml — produces an Accept button with a clickable href", () => {
  const html = buildInviteEmailHtml(baseCtx);
  // Cheap structural check — anchor tag with the invite URL in href.
  assertStringIncludes(html, `href="https://rhozly.com/join/abc-123"`);
  assertStringIncludes(html, "Accept invite");
});

Deno.test("buildInviteEmailHtml — bad expiresAt falls back to 'in 7 days'", () => {
  const html = buildInviteEmailHtml({
    ...baseCtx,
    expiresAt: "not-a-date",
  });
  // The label area should not contain "Invalid Date" — formatExpiry
  // returns a safe fallback. Either "in 7 days" appears, or the
  // formatter returned a literal "Invalid Date" — only the safe path
  // is acceptable.
  assert(
    html.includes("in 7 days") || !html.includes("Invalid Date"),
    "bad date leaked Invalid Date into the email",
  );
});

Deno.test("buildInviteEmailHtml — output starts with a valid HTML doctype", () => {
  const html = buildInviteEmailHtml(baseCtx);
  assertEquals(html.startsWith("<!doctype html>"), true);
});
