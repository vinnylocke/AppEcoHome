/**
 * Chat error presentation — maps an edge-function error body to the message
 * shown as an assistant bubble in the Garden AI chat.
 *
 * supabase-js collapses every non-2xx edge response into a FunctionsHttpError
 * whose `message` is the useless "Edge Function returned a non-2xx status
 * code" — the real signal (`ai_unavailable`, `quota_exceeded`) is only in the
 * response body, exposed via `error.context` (the raw Response). Without this
 * mapping every failure renders the same generic copy, which is how the
 * July 2026 spend-cap outage looked identical to an app bug.
 */

export interface ChatErrorPresentation {
  kind: "unavailable" | "quota" | "generic";
  text: string;
}

export const GENERIC_CHAT_ERROR =
  "Oops! My roots got tangled. I couldn't process that right now.";

export const AI_UNAVAILABLE_CHAT_ERROR =
  "Rhozly's AI is temporarily unavailable — your message wasn't lost. Please try again in a little while.";

export const QUOTA_CHAT_ERROR =
  "You've reached today's chat message limit for your plan. Upgrade to keep chatting.";

/**
 * Pure mapping from a parsed error body to user-facing copy. Prefers the
 * server's `message` (it carries tier-specific wording) and falls back to
 * canned copy per error code; anything unrecognised stays generic.
 */
export function chatErrorToUserMessage(body: unknown): ChatErrorPresentation {
  const b = body as { error?: unknown; message?: unknown } | null | undefined;
  const code = typeof b?.error === "string" ? b.error : null;
  const serverMessage =
    typeof b?.message === "string" && b.message.trim() ? b.message : null;
  if (code === "ai_unavailable") {
    return { kind: "unavailable", text: serverMessage ?? AI_UNAVAILABLE_CHAT_ERROR };
  }
  if (code === "quota_exceeded") {
    return { kind: "quota", text: serverMessage ?? QUOTA_CHAT_ERROR };
  }
  return { kind: "generic", text: GENERIC_CHAT_ERROR };
}

/**
 * Extract the JSON body from a thrown FunctionsHttpError. Returns null for
 * anything unreadable — network failures, non-JSON bodies, plain Errors —
 * which chatErrorToUserMessage then maps to the generic copy.
 */
export async function parseFunctionsErrorBody(err: unknown): Promise<unknown> {
  const ctx = (err as { context?: unknown } | null | undefined)?.context;
  if (!ctx || typeof (ctx as Response).json !== "function") return null;
  try {
    return await (ctx as Response).json();
  } catch {
    return null;
  }
}
