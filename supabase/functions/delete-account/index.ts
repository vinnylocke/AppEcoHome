import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Admin client — validates JWTs and deletes auth users
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authResult = await requireAuth(req, adminClient);
  if (authResult instanceof Response) return authResult;
  const { id: userId } = authResult.user;

  // User-context client — forwards the caller's JWT so auth.uid() is populated
  // inside the delete_own_account() RPC, which needs it to identify which guides
  // and home memberships to clean up.
  const userToken = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: userToken } },
  });

  // Step 1 — anonymise guides + leave all homes
  const { error: cleanupError } = await userClient.rpc("delete_own_account");
  if (cleanupError) {
    console.error("delete_own_account failed:", cleanupError.message);
    return new Response(
      JSON.stringify({ error: "Cleanup failed: " + cleanupError.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // Step 2 — delete the auth user (cascades to user_profiles and any remaining FKs)
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("deleteUser failed:", deleteError.message);
    return new Response(
      JSON.stringify({ error: "Failed to delete account: " + deleteError.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
