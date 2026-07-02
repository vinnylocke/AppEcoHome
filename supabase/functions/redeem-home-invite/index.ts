// redeem-home-invite — signed-in user redeems an invite token to join a home.
//
// UX review 2026-06-15 item 5.1.
//
// Validation chain:
//   1. Auth: caller must be signed in.
//   2. Token exists.
//   3. Token not used (used_at IS NULL).
//   4. Token not expired (expires_at > now).
//   5. Caller's auth.users.email matches invitee_email (case-insensitive).
//   6. Caller is not already a member of the home.
//
// On success: insert into home_members + mark used_at. Returns the home_id
// so the client can route the user to /dashboard for that home.
//
// This function uses the service role for the SELECT against
// home_invite_tokens — there is NO permissive RLS read policy for tokens,
// so anonymous probing /home_invite_tokens?token=eq.<guess> returns
// nothing. The service-role read is gated by requireAuth + email match.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";

const FN = "redeem-home-invite";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token.trim() : null;
    if (!token) throw new Error("token is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase Variables");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    // Pull the user's auth.users row for the email check.
    const { data: { user: authUser }, error: userErr } = await supabase.auth.admin.getUserById(userId);
    if (userErr || !authUser?.email) {
      return new Response(
        JSON.stringify({ error: "no_email_on_account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const callerEmail = authUser.email.trim().toLowerCase();

    // Fetch the invite. Service role bypasses RLS — see top-of-file note.
    const { data: invite, error: inviteErr } = await supabase
      .from("home_invite_tokens")
      .select("token, home_id, role, invitee_email, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();
    if (inviteErr) throw inviteErr;
    if (!invite) {
      return new Response(
        JSON.stringify({ error: "invite_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (invite.used_at) {
      return new Response(
        JSON.stringify({ error: "invite_already_used" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return new Response(
        JSON.stringify({ error: "invite_expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (invite.invitee_email !== callerEmail) {
      log(FN, "email_mismatch", {
        token: invite.token,
        callerEmail,
        invitee: invite.invitee_email,
      });
      return new Response(
        JSON.stringify({
          error: "email_mismatch",
          message:
            "This invite was sent to a different email address. Sign in with the inbox that received the invite.",
          invitee: invite.invitee_email,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reject if already a member (idempotent — still returns home_id).
    const { data: existingMembership } = await supabase
      .from("home_members")
      .select("home_id")
      .eq("home_id", invite.home_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMembership) {
      // Mark the token used so it doesn't dangle on the dashboard.
      await supabase
        .from("home_invite_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("token", token)
        .is("used_at", null);
      return new Response(
        JSON.stringify({
          ok: true,
          alreadyMember: true,
          home_id: invite.home_id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Invite tokens speak the invite-facing vocabulary (editor/viewer) but
    // home_members_role_check allows owner/admin/member/viewer — inserting
    // 'editor' verbatim violates the constraint and the invitee can never
    // join. Map to the membership vocabulary here.
    const memberRole = invite.role === "editor" ? "member" : invite.role;

    // Atomic-ish: insert the membership + flip used_at. If the
    // membership insert succeeds but the flip fails (unlikely), the
    // owner sees a stale "pending" entry — they can revoke it from the
    // UI without functional impact.
    const { error: memberErr } = await supabase
      .from("home_members")
      .insert({
        home_id: invite.home_id,
        user_id: userId,
        role: memberRole,
      });
    if (memberErr) {
      logError(FN, "member_insert_failed", {
        token: invite.token,
        message: memberErr.message,
      });
      throw memberErr;
    }

    await supabase
      .from("home_invite_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    log(FN, "invite_redeemed", {
      token: invite.token,
      home_id: invite.home_id,
      role: invite.role,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        home_id: invite.home_id,
        role: invite.role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err, {});
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
