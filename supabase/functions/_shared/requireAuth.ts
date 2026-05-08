import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Validates the Bearer token in the Authorization header.
 * Returns { user: { id } } on success, or a 401 Response on failure.
 *
 * Call with a service-role Supabase client — getUser() validates the JWT
 * against Supabase Auth without needing the user's anon session.
 */
export async function requireAuth(
  req: Request,
  db: SupabaseClient,
): Promise<{ user: { id: string } } | Response> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim() ?? "";
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const { data: { user }, error } = await db.auth.getUser(token);
  if (!user || error) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  return { user: { id: user.id } };
}
