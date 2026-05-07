import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, error as logError } from "../_shared/logger.ts";
import { sendEmail } from "../_shared/resend.ts";

const FN = "contact-support";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { name, email, message } = await req.json();

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "name, email and message are required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    log(FN, "request_received", { email });

    // 1. Forward to support inbox
    await sendEmail({
      from: "Rhozly Support <noreply@rhozly.com>",
      to: "support@rhozly.com",
      replyTo: email,
      subject: `Support request from ${name}`,
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 0;">
          <h2 style="margin:0 0 16px;color:#075737;">New support request</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#9aada3;font-size:13px;width:80px;">Name</td><td style="padding:8px 0;font-size:14px;color:#0f2a1e;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#9aada3;font-size:13px;">Email</td><td style="padding:8px 0;font-size:14px;color:#0f2a1e;"><a href="mailto:${email}" style="color:#075737;">${email}</a></td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e8f0eb;margin:20px 0;" />
          <p style="margin:0;font-size:14px;color:#4a6355;line-height:1.7;white-space:pre-wrap;">${message}</p>
        </div>
      `,
    });

    // 2. Auto-reply to the user
    await sendEmail({
      from: "Rhozly <noreply@rhozly.com>",
      to: email,
      subject: "We've received your message — Rhozly Support",
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f0f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px 40px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(7,87,55,0.08);">
      <div style="background-color:#075737;padding:28px 40px;text-align:center;">
        <p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Rhozly</p>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;">Support</p>
      </div>
      <div style="padding:36px 40px;">
        <h2 style="margin:0 0 16px;color:#0f2a1e;font-size:20px;font-weight:700;">We've got your message, ${name}.</h2>
        <p style="margin:0 0 24px;font-size:15px;color:#4a6355;line-height:1.6;">Thanks for reaching out. We've received your support request and will get back to you as soon as we can — usually within one business day.</p>
        <div style="background:#f8faf8;border-left:3px solid #075737;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
          <p style="margin:0;font-size:13px;color:#4a6355;line-height:1.7;white-space:pre-wrap;">${message}</p>
        </div>
        <p style="margin:0;font-size:14px;color:#9aada3;line-height:1.6;">In the meantime, if you have anything to add just reply to this email and it'll go straight to our inbox.</p>
      </div>
      <div style="padding:20px 40px;border-top:1px solid #e8f0eb;">
        <p style="margin:0;font-size:12px;color:#9aada3;line-height:1.6;">This is a confirmation email — please don't reply directly to this address. To add information to your request, email <a href="mailto:support@rhozly.com" style="color:#075737;">support@rhozly.com</a>.</p>
      </div>
    </div>
  </div>
</body>
</html>`,
    });

    log(FN, "complete", { email });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
