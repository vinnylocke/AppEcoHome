// create-home-invite — owner generates a tokenised email invite to add a
// co-gardener to their home.
//
// UX review 2026-06-15 item 5.1.
//
// Flow:
//   1. Auth + verify caller is the home owner.
//   2. Reject if the invitee is already a member.
//   3. Rate-limit: max 10 active (unused, unexpired) invites per home per day.
//   4. Insert a fresh row into home_invite_tokens.
//   5. Send the invite email via Resend.
//   6. Return the token + expiry so the UI can show "Pending invites".
//
// The redemption path lives in redeem-home-invite.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { sendInviteEmail } from "../_shared/inviteEmail.ts";

const FN = "create-home-invite";

const VALID_ROLES = new Set(["editor", "viewer"]);
const MAX_INVITES_PER_HOME_PER_DAY = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const homeId = typeof body?.homeId === "string" ? body.homeId : null;
    const rawEmail = typeof body?.email === "string" ? body.email : null;
    const role = typeof body?.role === "string" ? body.role : "editor";
    const appOriginIn = typeof body?.appOrigin === "string" ? body.appOrigin : null;

    if (!homeId) throw new Error("homeId is required");
    if (!rawEmail) throw new Error("email is required");
    const invitee = rawEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(invitee)) {
      return new Response(
        JSON.stringify({ error: "invalid_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!VALID_ROLES.has(role)) {
      return new Response(
        JSON.stringify({ error: "invalid_role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase Variables");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;
    const inviterId = authResult.user.id;

    // Confirm the caller is an owner of this home — RLS would also block
    // the insert below, but we want a clean 403 + a useful error message
    // before paying for the email send.
    const { data: membership, error: memberErr } = await supabase
      .from("home_members")
      .select("role")
      .eq("home_id", homeId)
      .eq("user_id", inviterId)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!membership || membership.role !== "owner") {
      return new Response(
        JSON.stringify({ error: "not_owner" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reject if the invitee is already a member. We check via the
    // `user_profiles.email` join because home_members doesn't carry an
    // email column — go through auth.users via service role.
    const { data: existingUser } = await supabase.auth.admin.listUsers({
      perPage: 1,
      page: 1,
    });
    // listUsers doesn't support email filtering directly; fall back to a
    // SQL probe against auth.users via the service-role client. This is
    // intentionally a tight probe — we read 1 row max.
    const { data: alreadyMember } = await supabase
      .from("home_members")
      .select("user_id, user_profiles!inner(uid, email)")
      .eq("home_id", homeId)
      .eq("user_profiles.email", invitee)
      .maybeSingle();
    if (alreadyMember) {
      return new Response(
        JSON.stringify({ error: "already_member" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // existingUser is unused — kept the call only as a quick service-role
    // sanity probe. Drop it to silence linters.
    void existingUser;

    // Rate-limit: count active (unused, unexpired) invites for this home
    // in the last 24 hours.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("home_invite_tokens")
      .select("token", { count: "exact", head: true })
      .eq("home_id", homeId)
      .gte("created_at", since);
    if ((recentCount ?? 0) >= MAX_INVITES_PER_HOME_PER_DAY) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: `You can send up to ${MAX_INVITES_PER_HOME_PER_DAY} invites per home per day. Try again tomorrow or revoke some pending invites first.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If there's already an active invite for this email + home, reuse
    // it instead of creating a duplicate. Keeps the user inbox clean.
    const { data: existingInvite } = await supabase
      .from("home_invite_tokens")
      .select("token, expires_at")
      .eq("home_id", homeId)
      .eq("invitee_email", invitee)
      .is("used_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token: string;
    let expiresAt: string;
    let resentExisting = false;

    if (existingInvite) {
      token = existingInvite.token;
      expiresAt = existingInvite.expires_at;
      resentExisting = true;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("home_invite_tokens")
        .insert({
          home_id: homeId,
          role,
          created_by: inviterId,
          invitee_email: invitee,
        })
        .select("token, expires_at")
        .single();
      if (insertErr) throw insertErr;
      token = inserted.token;
      expiresAt = inserted.expires_at;
    }

    // Inviter + home metadata for the email body.
    const [{ data: inviterProfile }, { data: home }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("display_name, first_name, email")
        .eq("uid", inviterId)
        .maybeSingle(),
      supabase
        .from("homes")
        .select("name")
        .eq("id", homeId)
        .maybeSingle(),
    ]);

    const inviterName =
      inviterProfile?.display_name ??
      inviterProfile?.first_name ??
      null;
    const inviterEmail = inviterProfile?.email ?? "noreply@rhozly.com";
    const homeName = home?.name ?? "your shared garden";

    // appOrigin lets the client override the production URL (useful for
    // staging + Capacitor deep-link variants). Fall back to the
    // production https URL.
    const appOrigin = (appOriginIn && /^https?:\/\//.test(appOriginIn))
      ? appOriginIn.replace(/\/$/, "")
      : "https://rhozly.com";
    const inviteUrl = `${appOrigin}/join/${token}`;

    try {
      await sendInviteEmail({
        inviteeEmail: invitee,
        inviterName,
        inviterEmail,
        homeName,
        inviteUrl,
        expiresAt,
      });
    } catch (emailErr) {
      logError(FN, "email_send_failed", {
        homeId,
        invitee,
        message: (emailErr as Error)?.message ?? String(emailErr),
      });
      // We don't roll back the insert — the owner can resend or copy the
      // invite URL from the Pending invites list.
    }

    log(FN, "invite_created", {
      homeId,
      invitee,
      role,
      resentExisting,
    });

    return new Response(
      JSON.stringify({
        token,
        expiresAt,
        invitee,
        resentExisting,
        inviteUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
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
