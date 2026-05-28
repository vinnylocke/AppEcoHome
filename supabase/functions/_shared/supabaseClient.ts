/**
 * Central Supabase client factory for edge functions.
 *
 * Use this instead of importing `createClient` from esm.sh directly in
 * each edge function — keeps the SDK version pinned in one place and
 * makes future upgrades a single-file change.
 *
 * Usage:
 *   import { serviceClient } from "../_shared/supabaseClient.ts";
 *   const db = serviceClient();
 *
 * For requests that should run under a user's auth (rare — most edge
 * functions use the service role), pass a `userToken` and the client
 * will attach it as the Authorization header so RLS applies.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Service-role client. Bypasses RLS — only use server-side, never
 * proxy through to the browser. The vast majority of edge functions
 * use this.
 */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * User-scoped client. Forwards the caller's bearer token so RLS
 * policies apply. Useful when you want the database itself to enforce
 * row visibility — e.g. when reading a user's own data and want defense
 * in depth against an auth bypass in the edge function.
 */
export function userClient(userToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
}
