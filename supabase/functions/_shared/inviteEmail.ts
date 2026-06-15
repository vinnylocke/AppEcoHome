// Shared invite email template + sender for the home_invite_tokens flow.
//
// UX review 2026-06-15 item 5.1. The owner clicks "Invite by email" in
// HomeManagement, the create-home-invite edge function inserts a row +
// calls this module to fire the email via Resend.

import { sendEmail } from "./resend.ts";

export interface InviteEmailContext {
  inviteeEmail: string;
  inviterName: string | null;
  inviterEmail: string;
  homeName: string;
  /** Absolute https URL the invitee will land on. Example:
   *  https://rhozly.com/join/<token>. */
  inviteUrl: string;
  /** ISO timestamp the token expires. */
  expiresAt: string;
}

function formatExpiry(iso: string): string {
  try {
    const d = new Date(iso);
    // Date constructor doesn't throw on garbage input — it produces an
    // Invalid Date silently. Guard explicitly.
    if (Number.isNaN(d.getTime())) return "in 7 days";
    return d.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return "in 7 days";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInviteEmailHtml(ctx: InviteEmailContext): string {
  const inviterLabel = ctx.inviterName
    ? `${escapeHtml(ctx.inviterName)} (${escapeHtml(ctx.inviterEmail)})`
    : escapeHtml(ctx.inviterEmail);
  const homeName = escapeHtml(ctx.homeName);
  const inviteUrl = escapeHtml(ctx.inviteUrl);
  const expiresLabel = escapeHtml(formatExpiry(ctx.expiresAt));

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Join Rhozly</title>
</head>
<body style="margin:0;padding:0;background:#f5f7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2a23;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7f3;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 24px rgba(7,87,55,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#2d6a4f 0%,#52b788 100%);padding:28px 32px;color:#ffffff;">
              <h1 style="margin:0;font-size:22px;font-weight:900;letter-spacing:-0.01em;">🌿 Rhozly</h1>
              <p style="margin:6px 0 0;font-size:13px;font-weight:700;opacity:0.85;">You've been invited to a garden</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 12px;font-size:16px;line-height:1.55;">
                <strong>${inviterLabel}</strong> has invited you to help look after the
                <strong style="color:#2d6a4f;">${homeName}</strong> garden on Rhozly.
              </p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#475548;">
                You'll be able to view plants, log tasks, post photos, and (depending on the role assigned) make changes to the garden. Accept the invite and you'll land directly in the garden's dashboard.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 28px;">
              <a
                href="${inviteUrl}"
                style="display:inline-block;background:#2d6a4f;color:#ffffff;text-decoration:none;font-weight:900;font-size:15px;padding:14px 28px;border-radius:18px;box-shadow:0 4px 12px rgba(45,106,79,0.25);"
              >Accept invite →</a>
              <p style="margin:14px 0 0;font-size:12px;color:#85907f;line-height:1.5;">
                Or open this link:<br/>
                <span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;color:#2d6a4f;word-break:break-all;">${inviteUrl}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="background:#fff8e1;border:1px solid #f4d36b;border-radius:14px;padding:14px 16px;font-size:12px;color:#7a5b1f;line-height:1.5;">
                <strong style="display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.06em;font-size:11px;color:#5e4515;">Heads up</strong>
                This invite is tied to <strong>${escapeHtml(ctx.inviteeEmail)}</strong> and expires on <strong>${expiresLabel}</strong>. If you didn't expect this email, you can safely ignore it.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f5f7f3;padding:18px 32px;text-align:center;font-size:11px;color:#85907f;line-height:1.5;">
              Sent by Rhozly on behalf of ${inviterLabel}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

export async function sendInviteEmail(ctx: InviteEmailContext): Promise<void> {
  const inviterFirst = ctx.inviterName?.split(/\s+/)[0] ?? null;
  const subject = inviterFirst
    ? `${inviterFirst} invited you to a garden on Rhozly`
    : `You're invited to a garden on Rhozly`;
  await sendEmail({
    to: ctx.inviteeEmail,
    from: "Rhozly Invites <noreply@rhozly.com>",
    subject,
    html: buildInviteEmailHtml(ctx),
    replyTo: ctx.inviterEmail,
  });
}
