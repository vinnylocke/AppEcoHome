import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendEmail } from "../_shared/resend.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { enforceIpRateLimit } from "../_shared/rateLimit.ts";

const FN = "report-error";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const rateLimitErr = await enforceIpRateLimit(db, req, FN, 20);
    if (rateLimitErr) return rateLimitErr;

    const {
      errorMessage,
      errorStack,
      appVersion,
      pageUrl,
      userAgent,
      platform,
      screenSize,
      language,
      onLine,
      timestamp,
    } = await req.json();

    if (!errorMessage) {
      return new Response(JSON.stringify({ error: "errorMessage is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    log(FN, "received", { errorMessage: errorMessage.slice(0, 80) });

    const subject = `[Error Report] ${String(errorMessage).slice(0, 80)}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f0f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:40px auto;padding:0 16px 40px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(7,87,55,0.08);">

      <div style="background:#075737;padding:24px 32px;">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:800;">Rhozly</p>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Error Report</p>
      </div>

      <div style="padding:28px 32px;border-bottom:1px solid #e8f0eb;">
        <h2 style="margin:0 0 4px;color:#0f2a1e;font-size:16px;font-weight:700;">Error</h2>
        <p style="margin:0;font-size:14px;color:#c0392b;font-family:monospace;word-break:break-all;">${String(errorMessage)}</p>
      </div>

      <div style="padding:28px 32px;border-bottom:1px solid #e8f0eb;">
        <h2 style="margin:0 0 12px;color:#0f2a1e;font-size:16px;font-weight:700;">Device &amp; Context</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:5px 0;color:#9aada3;width:120px;">Version</td><td style="padding:5px 0;color:#0f2a1e;">${appVersion ?? "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#9aada3;">Page</td><td style="padding:5px 0;color:#0f2a1e;word-break:break-all;">${pageUrl ?? "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#9aada3;">Time</td><td style="padding:5px 0;color:#0f2a1e;">${timestamp ?? "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#9aada3;">Platform</td><td style="padding:5px 0;color:#0f2a1e;">${platform ?? "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#9aada3;">Screen</td><td style="padding:5px 0;color:#0f2a1e;">${screenSize ?? "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#9aada3;">Language</td><td style="padding:5px 0;color:#0f2a1e;">${language ?? "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#9aada3;">Online</td><td style="padding:5px 0;color:#0f2a1e;">${onLine != null ? (onLine ? "Yes" : "No") : "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#9aada3;vertical-align:top;">User Agent</td><td style="padding:5px 0;color:#0f2a1e;word-break:break-all;">${userAgent ?? "—"}</td></tr>
        </table>
      </div>

      ${errorStack ? `
      <div style="padding:28px 32px;">
        <h2 style="margin:0 0 12px;color:#0f2a1e;font-size:16px;font-weight:700;">Stack Trace</h2>
        <pre style="margin:0;font-size:11px;color:#4a6355;background:#f8faf8;border-radius:8px;padding:16px;white-space:pre-wrap;word-break:break-all;line-height:1.6;">${String(errorStack)}</pre>
      </div>
      ` : ""}

    </div>
  </div>
</body>
</html>`;

    await sendEmail({
      from: "Rhozly Error Reporter <noreply@rhozly.com>",
      to: "reporterror@rhozly.com",
      subject,
      html,
    });

    log(FN, "sent");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
