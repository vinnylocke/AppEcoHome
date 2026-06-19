/**
 * agent-chat — the agentic Plant Doctor.
 *
 * Phase 1: 13 read tools, auto-executed.
 * Phase 2: 10 mutation tools, gated by a confirm card.
 *
 * Request actions:
 *   - send_message  { homeId, message, history? }
 *   - confirm_tool  { callId }
 *   - cancel_tool   { callId }
 *   - undo_tool     { callId }
 *
 * Response shapes:
 *   send_message  → { reply, toolResults?, pendingToolCalls?, quota }
 *   confirm_tool  → { callId, status, result?, error? }
 *   cancel_tool   → { callId, status }
 *   undo_tool     → { callId, status, error? }
 */

import { serviceClient } from "../_shared/supabaseClient.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import {
  callGeminiWithTools,
  type GeminiMessage,
  type GeminiFunctionCall,
} from "../_shared/gemini.ts";
import { getToolsForTier, getToolMeta } from "./tools.ts";
import { READ_EXECUTORS } from "./executors/read.ts";
import { MUTATION_EXECUTORS } from "./executors/mutations.ts";
import { STRUCTURAL_EXECUTORS } from "./executors/structural.ts";
import { DESTRUCTIVE_EXECUTORS } from "./executors/destructive.ts";
import { AUTOMATION_EXECUTORS } from "./executors/automations.ts";

// Combined mutation executor registry across Phase 2 + 3 + 4 + 5.
const ALL_MUTATION_EXECUTORS = {
  ...MUTATION_EXECUTORS,
  ...STRUCTURAL_EXECUTORS,
  ...DESTRUCTIVE_EXECUTORS,
  ...AUTOMATION_EXECUTORS,
};
import { buildHomeContext, invalidateContext } from "./context.ts";

const FN = "agent-chat";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const TIER_MESSAGE_LIMITS: Record<string, number> = {
  sprout: 5,
  botanist: 25,
  sage: 100,
  evergreen: 9999,
};

const MAX_TOOL_ROUNDS = 4;

// Pending tool calls older than this are treated as expired — confirm
// attempts fail with status='expired'. Stops a user from confirming a
// call from a chat that's been open for hours after data drifted.
const PENDING_TTL_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const db = serviceClient();

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;
    const authToken = req.headers.get("Authorization")?.replace("Bearer ", "").trim() ?? "";

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "send_message";

    if (action === "send_message")  return await handleSendMessage(db, userId, body, authToken);
    if (action === "confirm_tool")  return await handleConfirmTool(db, userId, body);
    if (action === "cancel_tool")   return await handleCancelTool(db, userId, body);
    if (action === "undo_tool")     return await handleUndoTool(db, userId, body);

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    await captureException(FN, err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Date prefix — pinned per-turn so Gemini resolves relative dates
// ("tomorrow", "next week") against actual reality instead of its
// training cutoff. Uses the home's IANA timezone when set; falls back
// to UTC.
// ─────────────────────────────────────────────────────────────────────
function buildDatePrefix(timezone: string | null): string {
  const now = new Date();
  let dateStr: string;
  let dayName: string;
  let zoneLabel: string;
  try {
    const tz = timezone ?? "UTC";
    // en-CA gives YYYY-MM-DD; en-GB gives e.g. "Tuesday"
    dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    dayName = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(now);
    zoneLabel = tz;
  } catch {
    // Bad timezone string — fall back to UTC.
    dateStr = now.toISOString().split("T")[0];
    dayName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" }).format(now);
    zoneLabel = "UTC";
  }
  return [
    `CURRENT DATE: ${dayName}, ${dateStr} (${zoneLabel}).`,
    `Resolve all relative dates ("today", "tomorrow", "next Tuesday", "in 3 days", "next week") against this date.`,
    `Always emit ISO dates (YYYY-MM-DD) when calling tools. Never invent dates from your training data — the current date above is the only one that matters.`,
  ].join(" ");
}

// ─────────────────────────────────────────────────────────────────────
// send_message — main agentic loop
// ─────────────────────────────────────────────────────────────────────
async function handleSendMessage(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  body: any,
  authToken: string,
) {
  const { homeId, message, history, audio } = body;
  if (!homeId || (!message && !audio)) return json({ error: "homeId and either message or audio are required" }, 400);
  if (message && (typeof message !== "string" || message.length > 4000)) {
    return json({ error: "message must be a string under 4000 chars" }, 400);
  }

  // Wave 22.0001-A — Voice in chat. When the client sends audio (as
  // { base64, mimeType }), we attach it as an `inlineData` part on the
  // user turn so Gemini transcribes + reasons in one round-trip. The
  // text `message` is optional in that case (the AI hears the audio
  // directly). Caps mirror Gemini's limits: ~10 MB of base64 per part.
  let audioPart: { inlineData: { data: string; mimeType: string } } | null = null;
  if (audio && typeof audio === "object") {
    const data = typeof audio.base64 === "string" ? audio.base64 : null;
    const mime = typeof audio.mimeType === "string" ? audio.mimeType : null;
    if (data && mime && /^audio\//.test(mime)) {
      if (data.length > 10_000_000) {
        return json({ error: "audio must be under ~7.5 MB encoded" }, 400);
      }
      audioPart = { inlineData: { data, mimeType: mime } };
    }
  }

  // Membership check
  const { data: membership } = await db
    .from("home_members")
    .select("home_id")
    .eq("home_id", homeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return json({ error: "Not a member of that home" }, 403);

  const context = await buildHomeContext(db, userId, homeId);

  // ── Quota check ──
  const limit = TIER_MESSAGE_LIMITS[context.tier] ?? TIER_MESSAGE_LIMITS.sprout;
  const { data: quotaRow } = await db.rpc("check_ai_message_quota", {
    p_user_id: userId,
    p_function_name: "agent-chat-message",
    p_limit: limit,
  });
  if (quotaRow && !quotaRow.allowed) {
    return json({
      error: "quota_exceeded",
      message: `You've reached today's chat message limit for the ${context.tier} tier (${limit} per day). Upgrade to keep chatting.`,
      quota: quotaRow,
    }, 429);
  }

  // Log the message turn upfront (quota counter).
  // Returns the new message_id so we can attach chat_tool_calls.
  const { data: assistantMsg } = await db
    .from("chat_messages")
    .insert({
      home_id: homeId,
      user_id: userId,
      role: "assistant",
      content: "",
    })
    .select("id")
    .single();
  await db.from("ai_usage_log").insert({
    home_id: homeId,
    user_id: userId,
    function_name: "agent-chat-message",
    action: "send_message",
    model: "agent-chat-orchestrator",
    prompt_tokens: 0,
    candidates_tokens: 0,
    total_tokens: 0,
  });

  const tools = getToolsForTier(context.tier);
  log(FN, "request_received", {
    userId, homeId, tier: context.tier, tools: tools.length,
  });

  // When the user turn carries audio, attach it as a sibling inlineData
  // part. The text part is always present (defaults to the empty string
  // when audio-only, which Gemini handles fine — the audio is enough
  // signal).
  const userParts: Array<{ text?: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: typeof message === "string" ? message : "" },
  ];
  if (audioPart) userParts.push(audioPart);

  const messages: GeminiMessage[] = [
    ...(Array.isArray(history) ? history.slice(-10) : []),
    { role: "user", parts: userParts as any },
  ];

  // Frozen copy of the original conversation — used by the knowledge
  // fallback below if the agentic loop exits with no text. We can't
  // reuse `messages` because the loop mutates it with tool calls +
  // tool responses.
  const originalMessages: GeminiMessage[] = [...messages];

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) return json({ error: "GEMINI_API_KEY not configured" }, 500);

  const toolResults: Array<{ tool: string; args: unknown; summary: string; payload: unknown }> = [];
  const pendingToolCalls: Array<{
    id: string; tool: string; args: unknown; risk_level: string; preview: string;
  }> = [];

  let finalReply: string | undefined;
  let totalTokensSpent = 0;

  // Build a date prefix the model can use to resolve relative dates
  // ("tomorrow", "next Tuesday"). Done per-call (not cached) so a chat
  // that crosses midnight doesn't see a stale "today".
  const datePrefix = buildDatePrefix(context.timezone);
  const imageRule = "IMAGES: You CAN show plants. When the user asks to see a plant or what something looks like, CALL the show_plant_images tool with the plant name(s) — the app then displays a real licensed photo for each. After calling it, reply with ONE short friendly caption (e.g. \"Here's what a runner bean looks like 🌱\"). NEVER tell the user you can't show images or can't help with this — you can, via the tool. NEVER write code, code blocks, ```tool_code```, or otherwise describe/print the tool call in your text reply. NEVER use markdown image syntax (![...](...)) or paste image URLs — only the tool.";
  const fullPrompt = `${datePrefix}\n\n${context.prompt}\n\n${imageRule}`;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await callGeminiWithTools(apiKey, FN, messages, tools, {
      systemPrompt: fullPrompt,
      toolChoice: "AUTO",
      logContext: { round, userId },
    });
    totalTokensSpent += resp.usage.totalTokenCount;

    // No tool calls → done.
    if (!resp.functionCalls || resp.functionCalls.length === 0) {
      finalReply = resp.text ?? "";
      break;
    }

    // Process each tool call. Auto-risk → execute. Confirm-risk → defer.
    const modelResponseParts: any[] = [];
    const toolResponseParts: any[] = [];
    let anyDeferred = false;

    for (const call of resp.functionCalls) {
      modelResponseParts.push({ functionCall: { name: call.name, args: call.args } });

      const meta = getToolMeta(call.name);
      if (!meta) {
        toolResponseParts.push({
          functionResponse: {
            name: call.name,
            response: { error: `Unknown tool: ${call.name}` },
          },
        });
        continue;
      }

      if (meta.risk === "auto") {
        const executor = READ_EXECUTORS[call.name];
        if (!executor) {
          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: `No read executor for ${call.name}` },
            },
          });
          continue;
        }
        try {
          const result = await executor({ db, userId, homeId, authToken }, call.args);
          toolResults.push({
            tool: call.name,
            args: call.args,
            summary: result.summary,
            payload: result.payload,
          });
          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              response: { result: result.payload, summary: result.summary },
            },
          });
        } catch (err: any) {
          warn(FN, "auto_tool_error", { tool: call.name, error: err.message });
          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: err.message },
            },
          });
        }
        continue;
      }

      // Confirm-risk: build preview, insert pending chat_tool_calls row.
      const mutation = ALL_MUTATION_EXECUTORS[call.name];
      if (!mutation) {
        toolResponseParts.push({
          functionResponse: {
            name: call.name,
            response: { error: `No mutation executor for ${call.name}` },
          },
        });
        continue;
      }

      let previewText: string;
      try {
        previewText = await mutation.preview({ db, userId, homeId }, call.args);
      } catch (err: any) {
        warn(FN, "preview_failed", { tool: call.name, error: err.message });
        previewText = `Run ${call.name} (preview unavailable: ${err.message})`;
      }

      const { data: callRow, error: insertErr } = await db
        .from("chat_tool_calls")
        .insert({
          message_id: assistantMsg!.id,
          home_id: homeId,
          user_id: userId,
          tool_name: call.name,
          tool_args: call.args,
          risk_level: meta.risk,
          status: "pending",
          preview: previewText,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      pendingToolCalls.push({
        id: callRow.id,
        tool: call.name,
        args: call.args,
        risk_level: meta.risk,
        preview: previewText,
      });
      anyDeferred = true;

      // Don't add a functionResponse for this — the model can't continue
      // without the user's confirmation. We stop the loop after this batch.
    }

    messages.push({ role: "model", parts: modelResponseParts });
    if (toolResponseParts.length > 0) {
      messages.push({ role: "user", parts: toolResponseParts });
    }

    // If any tool was deferred for confirmation, break the loop here.
    // The model's text reply (if any) is what we return to the user.
    if (anyDeferred) {
      finalReply = resp.text ?? "I need a quick confirmation before I make those changes.";
      break;
    }
  }

  if (!finalReply) {
    // The tool-driven path produced no text. Most often this is a
    // knowledge question (e.g. "how far apart should I plant butterhead
    // lettuce?") that doesn't match any tool. Re-ask Gemini with no
    // tools so the user always gets a real conversational answer
    // instead of a canned "I ran the tools…" line.
    try {
      const fallback = await callGeminiWithTools(apiKey, FN, originalMessages, [], {
        systemPrompt: `${fullPrompt}\n\nAnswer the user's last message directly and conversationally as a knowledgeable gardener. Do not mention tools or apologise for not using them.`,
        toolChoice: "NONE",
        logContext: { round: "knowledge_fallback", userId },
      });
      totalTokensSpent += fallback.usage.totalTokenCount;
      finalReply = fallback.text?.trim() || "";
    } catch (err: any) {
      warn(FN, "knowledge_fallback_failed", { error: err.message });
    }
    if (!finalReply) {
      finalReply = "I'm not quite sure how to help with that — could you rephrase or give me a bit more detail?";
    }
  }

  // Plants the model asked to SHOW (via show_plant_images) → rendered as
  // licensed photo cards by the client (no web-image scraping).
  const suggestedPlants = toolResults
    .filter((t) => t.tool === "show_plant_images")
    .flatMap((t) => {
      const p = (t.payload as { plants?: Array<{ name: string; search_query: string; show?: boolean }> })?.plants;
      return Array.isArray(p) ? p : [];
    });

  // Display-only tools are surfaced through dedicated UI (e.g. show_plant_images
  // → suggested_plants photo cards), so they must NOT also be returned as raw
  // tool results — the client renders unknown tool results as a JSON debug dump.
  const DISPLAY_ONLY_TOOLS = new Set(["show_plant_images"]);
  const visibleToolResults = toolResults.filter((t) => !DISPLAY_ONLY_TOOLS.has(t.tool));

  // Update the chat_messages row with the final content (+ any plant cards so
  // they persist on reload).
  await db
    .from("chat_messages")
    .update({ content: finalReply, suggested_plants: suggestedPlants.length ? suggestedPlants : null })
    .eq("id", assistantMsg!.id);

  // Best-effort token update (don't block response).
  db.from("ai_usage_log")
    .update({ total_tokens: totalTokensSpent })
    .eq("user_id", userId)
    .eq("function_name", "agent-chat-message")
    .order("created_at", { ascending: false })
    .limit(1)
    .then(() => {});

  log(FN, "complete", {
    auto: toolResults.length,
    pending: pendingToolCalls.length,
    tokens: totalTokensSpent,
  });

  return json({
    messageId: assistantMsg!.id,
    reply: finalReply,
    toolResults: visibleToolResults,
    pendingToolCalls,
    suggested_plants: suggestedPlants,
    quota: quotaRow,
  });
}

// ─────────────────────────────────────────────────────────────────────
// confirm_tool — user tapped Confirm on a pending call
// ─────────────────────────────────────────────────────────────────────
async function handleConfirmTool(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  body: any,
) {
  const { callId } = body;
  if (!callId) return json({ error: "callId required" }, 400);

  // Fetch the call and validate ownership + status + age.
  const { data: row, error } = await db
    .from("chat_tool_calls")
    .select("*")
    .eq("id", callId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return json({ error: "Call not found" }, 404);

  if (row.status !== "pending") {
    return json({ callId, status: row.status, error: `Call is already ${row.status}` }, 409);
  }

  // TTL check.
  const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60_000;
  if (ageMin > PENDING_TTL_MIN) {
    await db.from("chat_tool_calls").update({ status: "expired" }).eq("id", callId);
    return json({ callId, status: "expired", error: "This action expired — ask again." }, 410);
  }

  const executor = ALL_MUTATION_EXECUTORS[row.tool_name];
  if (!executor) {
    await db.from("chat_tool_calls").update({
      status: "failed",
      error_message: `No executor for ${row.tool_name}`,
    }).eq("id", callId);
    return json({ callId, status: "failed", error: "No executor for that tool" }, 500);
  }

  try {
    const result = await executor.execute(
      { db, userId, homeId: row.home_id },
      row.tool_args ?? {},
    );

    await db.from("chat_tool_calls").update({
      status: "executed",
      confirmed_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
      result: { summary: result.summary, payload: result.payload },
      affected_row_refs: result.affected_row_refs ?? null,
    }).eq("id", callId);

    // Invalidate context cache so the next agent turn sees the change.
    invalidateContext(userId, row.home_id);

    log(FN, "confirm_executed", { tool: row.tool_name, callId });
    return json({
      callId,
      status: "executed",
      result: {
        summary: result.summary,
        payload: result.payload,
        affected_row_refs: result.affected_row_refs ?? null,
      },
    });
  } catch (err: any) {
    await db.from("chat_tool_calls").update({
      status: "failed",
      error_message: err.message ?? String(err),
    }).eq("id", callId);
    warn(FN, "confirm_failed", { tool: row.tool_name, callId, error: err.message });
    return json({ callId, status: "failed", error: err.message ?? "Execution failed" }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────
// cancel_tool — user tapped Cancel
// ─────────────────────────────────────────────────────────────────────
async function handleCancelTool(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  body: any,
) {
  const { callId } = body;
  if (!callId) return json({ error: "callId required" }, 400);

  const { data: row } = await db
    .from("chat_tool_calls")
    .select("status, user_id")
    .eq("id", callId)
    .maybeSingle();
  if (!row || row.user_id !== userId) return json({ error: "Call not found" }, 404);
  if (row.status !== "pending") {
    return json({ callId, status: row.status, error: `Call is already ${row.status}` }, 409);
  }

  await db.from("chat_tool_calls").update({ status: "cancelled" }).eq("id", callId);
  return json({ callId, status: "cancelled" });
}

// ─────────────────────────────────────────────────────────────────────
// undo_tool — user tapped Undo on an executed call
// ─────────────────────────────────────────────────────────────────────
async function handleUndoTool(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  body: any,
) {
  const { callId } = body;
  if (!callId) return json({ error: "callId required" }, 400);

  const { data: row } = await db
    .from("chat_tool_calls")
    .select("*")
    .eq("id", callId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return json({ error: "Call not found" }, 404);
  if (row.status !== "executed") {
    return json({ callId, status: row.status, error: "Only executed calls can be undone." }, 409);
  }

  const executor = ALL_MUTATION_EXECUTORS[row.tool_name];
  if (!executor || !executor.undo) {
    return json({ error: `Undo not supported for ${row.tool_name}` }, 400);
  }
  if (!row.affected_row_refs) {
    return json({ error: "No row refs stored — can't undo." }, 400);
  }

  try {
    await executor.undo({ db, userId, homeId: row.home_id }, row.affected_row_refs);
    // Mark the call as cancelled-by-undo; preserve the executed history
    // for transparency.
    await db
      .from("chat_tool_calls")
      .update({ status: "cancelled", error_message: "undone_by_user" })
      .eq("id", callId);
    invalidateContext(userId, row.home_id);
    return json({ callId, status: "undone" });
  } catch (err: any) {
    warn(FN, "undo_failed", { callId, error: err.message });
    return json({ callId, error: err.message ?? "Undo failed" }, 500);
  }
}
