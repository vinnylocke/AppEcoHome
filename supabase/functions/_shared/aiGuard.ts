import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Guard for functions that receive a homeId in the request body.
 * Looks up the home owner and checks user_profiles.ai_enabled.
 * Returns a 403 Response if AI is not permitted, null if allowed.
 */
export async function guardAiByHome(
  db: SupabaseClient,
  homeId: string,
): Promise<Response | null> {
  const { data: member } = await db
    .from("home_members")
    .select("user_id")
    .eq("home_id", homeId)
    .eq("role", "owner")
    .limit(1)
    .single();

  if (!member) return null;

  const { data: profile } = await db
    .from("user_profiles")
    .select("ai_enabled")
    .eq("uid", member.user_id)
    .single();

  if (profile && !profile.ai_enabled) {
    return new Response(JSON.stringify({ error: "AI tier required" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  return null;
}

/**
 * Guard for functions that have a userId from the auth token.
 * Returns a 403 Response if AI is not permitted, null if allowed.
 */
export async function guardAiByUser(
  db: SupabaseClient,
  userId: string,
): Promise<Response | null> {
  const { data: profile } = await db
    .from("user_profiles")
    .select("ai_enabled")
    .eq("uid", userId)
    .single();

  if (profile && !profile.ai_enabled) {
    return new Response(JSON.stringify({ error: "AI tier required" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  return null;
}

export async function guardPerenualByHome(
  db: SupabaseClient,
  homeId: string,
): Promise<Response | null> {
  const { data: member } = await db
    .from("home_members")
    .select("user_id")
    .eq("home_id", homeId)
    .eq("role", "owner")
    .limit(1)
    .single();

  if (!member) return null;

  const { data: profile } = await db
    .from("user_profiles")
    .select("enable_perenual")
    .eq("uid", member.user_id)
    .single();

  if (profile && !profile.enable_perenual) {
    return new Response(JSON.stringify({ error: "Perenual access required" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  return null;
}

export async function guardPerenualByUser(
  db: SupabaseClient,
  userId: string,
): Promise<Response | null> {
  const { data: profile } = await db
    .from("user_profiles")
    .select("enable_perenual")
    .eq("uid", userId)
    .single();

  if (profile && !profile.enable_perenual) {
    return new Response(JSON.stringify({ error: "Perenual access required" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  return null;
}
