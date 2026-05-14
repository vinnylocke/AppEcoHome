import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function requireHomeMembership(
  db: SupabaseClient,
  homeId: string,
  userId: string,
): Promise<Response | null> {
  const { data } = await db
    .from("home_members")
    .select("role")
    .eq("home_id", homeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    return new Response(
      JSON.stringify({ error: "not_a_member" }),
      { status: 403, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
  return null;
}
