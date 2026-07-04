// Server-side admin gate for edge functions. Reads `user_profiles.is_admin`
// for the authenticated user (call AFTER requireAuth). Returns a 403 Response
// when the user isn't an admin, else null. `user_profiles` is keyed by `uid`.

export async function requireAdmin(
  db: { from: (t: string) => any },
  userId: string,
  corsHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const { data, error } = await db
    .from("user_profiles")
    .select("is_admin")
    .eq("uid", userId)
    .maybeSingle();
  if (error || !data?.is_admin) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}
