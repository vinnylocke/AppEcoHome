// Ailment Library — add a single AI-generated ailment to the shared catalogue.
//
// The Watchlist "Search with Rhozly AI" tier generates an ailment client-side
// (via generate-ailment-suggestions). When the user adds it, this function
// persists it to `ailment_library` (read-only for clients; service-role write)
// so every future user finds it in the library tier. Dedups on the generated
// `name_key`; on conflict it returns the existing (curated) row rather than
// overwriting it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { aiResultToLibraryRow, ailmentNameKey, type AiAilmentInput } from "../_shared/ailmentLibraryMap.ts";

const FN = "add-ailment-to-library";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    const db = createClient(supabaseUrl, serviceKey);

    // Authenticated AI-tier callers only (defense in depth — the UI gates it).
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;

    const body = await req.json().catch(() => ({}));
    const input = (body?.ailment ?? {}) as AiAilmentInput;
    const row = aiResultToLibraryRow(input);
    if (!row.name) return json({ error: "ailment.name is required" }, 400);

    const key = ailmentNameKey(row.name);

    // Insert; on unique (name_key) conflict, hand back the existing curated row.
    const { data: inserted, error: insErr } = await db
      .from("ailment_library").insert(row).select().maybeSingle();

    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        const { data: existing } = await db
          .from("ailment_library").select("*").eq("name_key", key).maybeSingle();
        log(FN, "exists", { name: row.name });
        return json({ ailment: existing, created: false });
      }
      throw insErr;
    }

    log(FN, "added", { name: row.name });
    return json({ ailment: inserted, created: true });
  } catch (err) {
    logError(FN, "error", { message: err instanceof Error ? err.message : String(err) });
    await captureException(FN, err);
    return json({ error: "internal" }, 500);
  }
});
