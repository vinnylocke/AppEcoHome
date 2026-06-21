import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { buildUserContext, renderContextBlock } from "../_shared/userContext.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const FN = "generate-task-from-photo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TASK_TYPES = [
  "Watering",
  "Pruning",
  "Harvesting",
  "Maintenance",
  "Planting",
  "Feeding",
  "Inspection",
];

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title:           { type: "STRING",  description: "Short imperative task title (e.g. 'Prune the lavender hedge')." },
    description:     { type: "STRING",  description: "1–2 sentence elaboration of what to do and why." },
    task_type:       { type: "STRING",  description: `One of: ${ALLOWED_TASK_TYPES.join(", ")}.` },
    frequency_days:  { type: "INTEGER", description: "Suggested recurrence in days. Use 0 for a one-off task." },
    notes:           { type: "STRING",  description: "Optional extra observation or caveat (e.g. 'photo shows yellowing — investigate root cause too')." },
  },
  required: ["title", "description", "task_type", "frequency_days"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;
    const callerUserId = authResult.user.id;

    const body = await req.json();
    const { homeId, imageBase64, mimeType } = body as {
      homeId?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    if (!homeId || !imageBase64) {
      return new Response(
        JSON.stringify({ error: "homeId and imageBase64 are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiGate = await guardAiByHome(supabase, homeId);
    if (aiGate) return aiGate;

    const rl = await enforceRateLimit(supabase, callerUserId, FN, 30);
    if (rl) return rl;

    // Phase 2 — ground the suggestion in the gardener's location / season / weather
    // so timing is realistic (no out-of-season actions; weather-driven urgency).
    let contextBlock = "";
    try {
      const uctx = await buildUserContext(
        supabase as unknown as Parameters<typeof buildUserContext>[0],
        { userId: callerUserId, homeId, skip: ["garden", "tasks", "behaviour"] },
      );
      contextBlock = renderContextBlock(uctx, ["location", "weather"]);
    } catch { /* non-fatal — fall back to image-only */ }

    const prompt = `${contextBlock ? `${contextBlock}\n\n` : ""}You are a gardening assistant. The user has photographed something in their garden and wants a single concrete task suggestion.

From the image, infer the most useful next action. Choose a task_type from: ${ALLOWED_TASK_TYPES.join(", ")}.

Rules:
- Title must be short and imperative (e.g. "Prune the lavender hedge", "Stake the tomato plant").
- frequency_days: a sensible recurrence in days. Use 0 if this is genuinely a one-off (e.g. staking, repotting). Watering = typically 2–4, pruning = 14–28, harvesting = 7–14, feeding = 14–30, inspection = 7.
- Be specific to the photo — don't generate generic advice.
- Use the gardener context above (location, season, weather) for realistic timing — avoid out-of-season actions and raise weather-driven urgency (e.g. frost or heat in the forecast).
- If the image is unclear or doesn't show a plant / garden context, default to task_type "Maintenance" with a title "Inspect this area" and explain in the description what was unclear.

Return JSON matching the response schema.`;

    const messages = toMessages([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType ?? "image/jpeg",
        },
      },
    ]);

    const { text, usage } = await callGeminiCascade(apiKey, FN, messages, {
      temperature: 0.4,
      maxOutputTokens: 600,
      responseSchema: RESPONSE_SCHEMA,
      responseMimeType: "application/json",
      logContext: { homeId, userId: callerUserId },
    });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      throw new Error("Gemini returned malformed JSON.");
    }

    // Sanity check the task_type fell within the allowed set.
    if (!ALLOWED_TASK_TYPES.includes(parsed.task_type)) {
      parsed.task_type = "Maintenance";
    }
    if (typeof parsed.frequency_days !== "number" || parsed.frequency_days < 0) {
      parsed.frequency_days = 0;
    }

    await logAiUsage(supabase, {
      homeId,
      userId: callerUserId,
      functionName: FN,
      usage,
      contextBlock,
      prompt,
      rawResult: text,
    });

    log(FN, "success", { homeId, task_type: parsed.task_type });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "unhandled", { error: err?.message ?? String(err) });
    captureException(err, { fn: FN });
    return new Response(
      JSON.stringify({ error: err?.message ?? "Failed to generate task." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
