import { log, warn } from "./logger.ts";

// Cascade order: cheapest / fastest first, most capable / expensive
// last. When the leading models are overloaded or rate-limited we
// fall through. 7 models — if the cascade reaches the bottom rung
// (gemini-3.5-flash at $1.50/$9.00 per million) the batch's cost
// jumps 15× vs the top rung, so cascade depth has cost implications
// worth keeping an eye on in the admin "est. cost" column.
export const DEFAULT_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-preview-09-2025",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
];

/**
 * Pro-first cascade for vision-heavy plant doctor actions
 * (diagnose / identify_pest / identify_vision /
 * analyse_comprehensive). Trades ~20× cost vs the default Flash
 * cascade for noticeably better visual reasoning — Pro models
 * actually "look at" the image with more care, which matters when
 * hallucinated symptoms damage trust.
 *
 * Falls back to Flash if both Pro tiers are overloaded so the user
 * gets SOME answer rather than an error. The two-stage prompt +
 * confidence floor we apply on top means even the Flash fallback
 * stays grounded.
 */
export const VISION_DIAGNOSIS_MODELS = [
  "gemini-2.5-pro",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

export interface GeminiPart {
  text?: string;
  inlineData?: { data: string; mimeType: string };
}

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiUsage {
  /** Total input tokens reported by the API. Includes cached tokens. */
  promptTokenCount: number;
  /** Output / response tokens. */
  candidatesTokenCount: number;
  /**
   * Prompt tokens served from Google's context cache. Billed at
   * ~10% of the model's normal input rate (current published rate
   * across the Gemini 2.5 / 3.x range). Default 0 when the API
   * doesn't return the field (older models / non-cache call).
   */
  cachedContentTokenCount: number;
  /**
   * Pro-model "thinking" / reasoning tokens. Billed at the model's
   * normal OUTPUT rate (not free). Default 0 when absent.
   */
  thoughtsTokenCount: number;
  totalTokenCount: number;
  model: string;
}

export interface GeminiOptions {
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** When provided, enables JSON mode with schema enforcement. */
  responseSchema?: any;
  /** Used when you want JSON mode without a strict schema. */
  responseMimeType?: string;
  /** Override the default model cascade. */
  models?: string[];
  maxRetriesPerModel?: number;
  timeoutMs?: number;
  /** Extra fields merged into every model_attempt / model_success / model_failed log. */
  logContext?: Record<string, unknown>;
}

/**
 * Convert a mixed SDK-style contents array (strings + inlineData objects)
 * into a single-user GeminiMessage — useful for migrating plant-doctor calls.
 */
export function toMessages(
  contents: Array<string | GeminiPart>,
): GeminiMessage[] {
  return [
    {
      role: "user",
      parts: contents.map((c) => (typeof c === "string" ? { text: c } : c)),
    },
  ];
}

/**
 * Join the text from EVERY text-bearing part of a Gemini candidate.
 *
 * Gemini splits long output across multiple `content.parts`; reading only
 * `parts[0].text` silently truncates large responses (e.g. a big JSON document),
 * which then fails `JSON.parse`. Concatenating with no separator faithfully
 * reconstructs a single document that was chunked across parts. Returns "" when
 * there is no usable text (e.g. empty parts on a MAX_TOKENS-during-thinking stop).
 */
export function joinPartsText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (p && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
    .join("");
}

/**
 * Call the Gemini REST API with model cascade and per-model retry on transient
 * errors (503, 429, timeout). Returns the response text and usage metadata.
 * Callers are responsible for JSON.parse() when they expect structured output.
 */
export async function callGeminiCascade(
  apiKey: string,
  fn: string,
  messages: GeminiMessage[],
  opts: GeminiOptions = {},
): Promise<{ text: string; usage: GeminiUsage }> {
  const models = opts.models ?? DEFAULT_MODELS;
  const maxRetries = opts.maxRetriesPerModel ?? 2;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const extra = opts.logContext ?? {};

  let lastError: Error | undefined;
  // Per-model "last error we saw on this model" so the thrown
  // message can show the FULL cascade outcome — not just whichever
  // model happened to fail last. Helpful when an admin reads the
  // failure reason and wants to know "did we actually try all of
  // them?".
  const perModelErrors: Array<{ model: string; attempts: number; error: string }> = [];

  for (const model of models) {
    let attemptsForModel = 0;
    let lastModelError: string | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attemptsForModel = attempt;
      log(fn, "model_attempt", { model, attempt, ...extra });
      try {
        const result = await raceWithTimeout(timeoutMs, (signal) =>
          callOnce(apiKey, model, messages, opts, signal),
        );
        log(fn, "model_success", { model, attempt, tokens: result.usage.totalTokenCount, ...extra });
        return result;
      } catch (err: any) {
        lastError = err;
        lastModelError = err.message;
        warn(fn, "model_failed", { model, attempt, error: err.message, ...extra });
        const retryable =
          err.message.includes("503") ||
          err.message.includes("429") ||
          err.message.includes("Timeout");
        if (retryable && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 2_000));
          continue;
        }
        break;
      }
    }
    perModelErrors.push({
      model,
      attempts: attemptsForModel,
      error: lastModelError ?? "no error captured",
    });
  }

  const summary = perModelErrors
    .map((e) => `  • ${e.model} (${e.attempts}x): ${e.error}`)
    .join("\n");
  throw new Error(
    `All ${models.length} Gemini models exhausted (cascade tried each up to ${maxRetries} times):\n${summary}`,
  );
}

/**
 * Race `make(signal)` against a timeout that ABORTS the losing request.
 * The old bare Promise.race left the timed-out fetch running to
 * completion — the retry then started a SECOND live request and both
 * billed tokens (the Imagen helpers already did this correctly).
 */
async function raceWithTimeout<T>(
  timeoutMs: number,
  make: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = make(controller.signal);
  // The post-abort rejection of the losing promise must not surface as an
  // unhandled rejection after the race has already settled.
  attempt.catch(() => {});
  try {
    return await Promise.race([
      attempt,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function callOnce(
  apiKey: string,
  model: string,
  messages: GeminiMessage[],
  opts: GeminiOptions,
  signal?: AbortSignal,
): Promise<{ text: string; usage: GeminiUsage }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig: any = {
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };

  if (opts.responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = opts.responseSchema;
  } else if (opts.responseMimeType) {
    generationConfig.responseMimeType = opts.responseMimeType;
  }

  const body: any = { contents: messages, generationConfig };

  if (opts.systemPrompt) {
    body.system_instruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData.error?.message ?? `Gemini HTTP ${res.status} from ${model}`,
    );
  }

  const data = await res.json();
  // Defensive read — Gemini can return no candidates (safety block) or a
  // candidate with empty `parts` when the model hits MAX_TOKENS during
  // thinking. The raw destructure below would crash with a cryptic
  // `TypeError: Cannot read properties of undefined` and the caller
  // would see no attributable reason. Surface finishReason/blockReason
  // instead so the cascade can fall through to the next model and the
  // client can show a useful error.
  const candidate = data.candidates?.[0];
  const text = joinPartsText(candidate?.content?.parts);
  if (!text) {
    const finishReason = candidate?.finishReason ?? "UNKNOWN";
    const blockReason = data.promptFeedback?.blockReason;
    throw new Error(
      `Gemini ${model} returned no usable text (finishReason: ${finishReason}${blockReason ? `, blockReason: ${blockReason}` : ""}).`,
    );
  }
  return {
    text,
    usage: {
      promptTokenCount: data.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokenCount: data.usageMetadata?.candidatesTokenCount ?? 0,
      cachedContentTokenCount: data.usageMetadata?.cachedContentTokenCount ?? 0,
      thoughtsTokenCount: data.usageMetadata?.thoughtsTokenCount ?? 0,
      totalTokenCount: data.usageMetadata?.totalTokenCount ?? 0,
      model,
    },
  };
}

// ─── Tool calling (function calling) ────────────────────────────────
//
// Gemini supports native function calling. Pass a list of typed tool
// declarations and the model will return either a text reply OR one or
// more `functionCall` parts that the caller is expected to execute and
// (optionally) feed back into a follow-up turn for the model to consume.
//
// Used by the agent-chat edge function for the agentic Plant Doctor.

/** JSON-schema-shaped declaration of a tool the model may call. */
export interface GeminiToolDeclaration {
  name: string;
  description: string;
  /** OpenAPI/JSON-schema-style parameter spec. */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** A function call returned by the model. */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/** Tool-aware response. Either `text` is set (model wants to reply) or
 *  `functionCalls` is non-empty (model wants the caller to execute one
 *  or more tools). Both may be set when the model includes a textual
 *  preamble alongside its tool calls. */
export interface GeminiToolResponse {
  text?: string;
  functionCalls?: GeminiFunctionCall[];
  usage: GeminiUsage;
}

/**
 * Tool-aware Gemini call with the same model cascade + retry behaviour
 * as `callGeminiCascade`. Use this when you want function-calling; the
 * non-tool path stays on `callGeminiCascade` unchanged.
 *
 * `toolChoice` controls whether the model is forced to use tools:
 *   - `AUTO` (default): model decides whether to call tools or reply with text
 *   - `ANY`: model MUST call at least one tool
 *   - `NONE`: model cannot call tools (text-only response)
 */
export async function callGeminiWithTools(
  apiKey: string,
  fn: string,
  messages: GeminiMessage[],
  tools: GeminiToolDeclaration[],
  opts: GeminiOptions & { toolChoice?: "AUTO" | "ANY" | "NONE" } = {},
): Promise<GeminiToolResponse> {
  const models = opts.models ?? DEFAULT_MODELS;
  const maxRetries = opts.maxRetriesPerModel ?? 2;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const extra = opts.logContext ?? {};

  let lastError: Error | undefined;
  const perModelErrors: Array<{ model: string; attempts: number; error: string }> = [];

  for (const model of models) {
    let attemptsForModel = 0;
    let lastModelError: string | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attemptsForModel = attempt;
      log(fn, "tool_model_attempt", { model, attempt, toolCount: tools.length, ...extra });
      try {
        const result = await raceWithTimeout(timeoutMs, (signal) =>
          callOnceWithTools(apiKey, model, messages, tools, opts, signal),
        );
        log(fn, "tool_model_success", {
          model,
          attempt,
          tokens: result.usage.totalTokenCount,
          functionCalls: result.functionCalls?.length ?? 0,
          ...extra,
        });
        return result;
      } catch (err: any) {
        lastError = err;
        lastModelError = err.message;
        warn(fn, "tool_model_failed", { model, attempt, error: err.message, ...extra });
        const retryable =
          err.message.includes("503") ||
          err.message.includes("429") ||
          err.message.includes("Timeout");
        if (retryable && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 2_000));
          continue;
        }
        break;
      }
    }
    perModelErrors.push({
      model,
      attempts: attemptsForModel,
      error: lastModelError ?? "no error captured",
    });
  }

  const summary = perModelErrors
    .map((e) => `  • ${e.model} (${e.attempts}x): ${e.error}`)
    .join("\n");
  throw new Error(
    `All ${models.length} Gemini models exhausted (cascade tried each up to ${maxRetries} times):\n${summary}`,
  );
}

async function callOnceWithTools(
  apiKey: string,
  model: string,
  messages: GeminiMessage[],
  tools: GeminiToolDeclaration[],
  opts: GeminiOptions & { toolChoice?: "AUTO" | "ANY" | "NONE" },
  signal?: AbortSignal,
): Promise<GeminiToolResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig: any = {
    temperature: opts.temperature ?? 0.3, // lower than free-form chat — tool calls want deterministic args
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };

  const body: any = {
    contents: messages,
    generationConfig,
    tools: [{ functionDeclarations: tools }],
    toolConfig: {
      functionCallingConfig: { mode: opts.toolChoice ?? "AUTO" },
    },
  };

  if (opts.systemPrompt) {
    body.system_instruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData.error?.message ?? `Gemini HTTP ${res.status} from ${model}`,
    );
  }

  const data = await res.json();
  const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];

  // Split parts into text vs function calls. Gemini can return either
  // or both in the same response.
  const textParts: string[] = [];
  const functionCalls: GeminiFunctionCall[] = [];
  for (const part of parts) {
    if (part.text) textParts.push(part.text);
    if (part.functionCall) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      });
    }
  }

  return {
    text: textParts.length > 0 ? textParts.join("\n") : undefined,
    functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
    usage: {
      promptTokenCount: data.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokenCount: data.usageMetadata?.candidatesTokenCount ?? 0,
      cachedContentTokenCount: data.usageMetadata?.cachedContentTokenCount ?? 0,
      thoughtsTokenCount: data.usageMetadata?.thoughtsTokenCount ?? 0,
      totalTokenCount: data.usageMetadata?.totalTokenCount ?? 0,
      model,
    },
  };
}

// ─── Batch API ───────────────────────────────────────────────────────
//
// Google's Gemini Batch API. 50% cheaper than sync, results within
// 24 hours (usually much sooner). Per
// https://ai.google.dev/gemini-api/docs/batch-mode:
//
//   POST /v1beta/models/{model}:batchGenerateContent
//     body: { batch: { display_name, input_config: { requests: { requests: [ … ] } } } }
//     header: x-goog-api-key
//     returns: { name: "batches/<id>", state: "JOB_STATE_PENDING", … }
//
//   GET /v1beta/{batch_name}
//     header: x-goog-api-key
//     returns: { name, state, response?: { inlinedResponses: [...] }, error? }
//
// States: JOB_STATE_PENDING / RUNNING / SUCCEEDED / FAILED /
// CANCELLED / EXPIRED (48h cap).
//
// Inline format only — we cap individual batches small enough
// (well under 20MB request limit) so we don't need the file-upload
// path. Each request line carries a `metadata.key` so the response
// rows can be matched back to the input.

export interface BatchRequestLine {
  /** Stable identifier we use to match the response back to the input. */
  key: string;
  /** Prompt text — wrapped into a single-user `contents` block by the helper. */
  prompt: string;
}

export interface BatchSubmitResult {
  /** Full Gemini operation name, e.g. "batches/abc123". */
  name: string;
  /** Initial state Gemini reports — usually JOB_STATE_PENDING. */
  state: string;
}

/**
 * Gemini returns `JOB_STATE_*` or `BATCH_STATE_*` depending on the
 * API surface / version that handles a given request. Both prefixes
 * carry the same suffix vocabulary (PENDING / RUNNING / SUCCEEDED /
 * FAILED / CANCELLED / EXPIRED). Typed as `string` because callers
 * normalize on the suffix; pinning the union here just sets us up
 * to silently drop unknown new prefixes Google introduces.
 */
export type BatchState = string;

export interface BatchStatusResult {
  state: BatchState;
  /** Populated only on terminal failure states. */
  error?: string;
}

export interface BatchResponseLine {
  key: string;
  /** Parsed model response text on success. */
  text: string | null;
  /** Per-line usage metadata when Gemini supplied it. */
  usage: GeminiUsage | null;
  /** Non-null on error — e.g. "RESOURCE_EXHAUSTED" or a parse failure. */
  error: string | null;
}

/**
 * Submit a batch of generation requests to Gemini. All requests in
 * a batch use the SAME model + generation config — caller groups
 * by model upstream if mixing.
 *
 * Returns the batch operation name. Use `getBatchStatus()` to poll
 * + `getBatchResults()` once SUCCEEDED.
 */
export async function submitGeminiBatch(
  apiKey: string,
  model: string,
  displayName: string,
  requests: BatchRequestLine[],
  opts: {
    temperature?: number;
    maxOutputTokens?: number;
    responseSchema?: unknown;
    responseMimeType?: string;
  } = {},
): Promise<BatchSubmitResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`;

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };
  if (opts.responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = opts.responseSchema;
  } else if (opts.responseMimeType) {
    generationConfig.responseMimeType = opts.responseMimeType;
  }

  const inlineRequests = requests.map((r) => ({
    request: {
      contents: [{ parts: [{ text: r.prompt }] }],
      generationConfig,
    },
    metadata: { key: r.key },
  }));

  const body = {
    batch: {
      display_name: displayName,
      input_config: {
        requests: { requests: inlineRequests },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      `Gemini batch submit failed (HTTP ${res.status}): ${
        errData.error?.message ?? res.statusText
      }`,
    );
  }

  const data = await res.json();
  if (!data?.name) {
    throw new Error(`Gemini batch submit returned no operation name. Body: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return {
    name: data.name,
    state: data.state ?? data.metadata?.state ?? "JOB_STATE_PENDING",
  };
}

/**
 * GET /v1beta/{batch_name} — returns the current state. Cheap;
 * safe to call every few minutes per active batch.
 */
export async function getGeminiBatchStatus(
  apiKey: string,
  batchName: string,
): Promise<BatchStatusResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${batchName}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-goog-api-key": apiKey },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      `Gemini batch status failed (HTTP ${res.status}): ${
        errData.error?.message ?? res.statusText
      }`,
    );
  }
  const data = await res.json();
  const state: string = data.state ?? data.metadata?.state ?? "JOB_STATE_PENDING";
  const error: string | undefined =
    data.error?.message ?? data.metadata?.error?.message ?? undefined;
  return { state: state as BatchState, error };
}

/**
 * Fetch inline results from a SUCCEEDED batch. Returns one entry
 * per submitted request, in the order they were submitted. Lines
 * that failed Gemini-side carry an `error` string; successful
 * lines carry parsed `text` + usage metadata.
 *
 * Response shape per the docs is `data.dest.inlinedResponses[]` —
 * NOT `data.response.inlinedResponses[]` as the SDK examples loosely
 * imply. We try several known nesting paths defensively (different
 * API surfaces / versions / capitalisations have shipped over time)
 * and fall through to an empty array only if everything misses.
 * Caller logs when that happens for diagnosis.
 */
export async function getGeminiBatchResults(
  apiKey: string,
  batchName: string,
): Promise<BatchResponseLine[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${batchName}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-goog-api-key": apiKey },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      `Gemini batch results fetch failed (HTTP ${res.status}): ${
        errData.error?.message ?? res.statusText
      }`,
    );
  }
  const data = await res.json();
  // Cover every nesting path the API has used in published examples
  // / docs / SDK source. `data.dest.inlinedResponses` is the current
  // canonical path per https://ai.google.dev/gemini-api/docs/batch-api.
  const inlined: any[] =
    data.dest?.inlinedResponses?.inlinedResponses ??
    data.dest?.inlinedResponses ??
    data.response?.inlinedResponses?.inlinedResponses ??
    data.response?.inlinedResponses ??
    data.inlinedResponses ??
    [];

  return inlined.map((line, idx) => {
    // Gemini doesn't reliably echo our submission metadata.key back —
    // fall back to the array index so failure logs still identify
    // which line went wrong.
    const key = line.metadata?.key ?? `#${idx}`;
    const err: string | undefined = line.error?.message ?? line.status?.message;
    if (err) {
      return { key, text: null, usage: null, error: err };
    }
    const text: string | null =
      joinPartsText(line.response?.candidates?.[0]?.content?.parts) || null;
    const um = line.response?.usageMetadata;
    return {
      key,
      text,
      usage: um
        ? {
            promptTokenCount: um.promptTokenCount ?? 0,
            candidatesTokenCount: um.candidatesTokenCount ?? 0,
            cachedContentTokenCount: um.cachedContentTokenCount ?? 0,
            thoughtsTokenCount: um.thoughtsTokenCount ?? 0,
            totalTokenCount: um.totalTokenCount ?? 0,
            model: line.response?.modelVersion ?? "unknown",
          }
        : null,
      error: text == null ? "no candidate text in response" : null,
    };
  });
}

/**
 * Best-effort cancel for a non-terminal batch. Google's
 * batches:cancel endpoint flips the state to JOB_STATE_CANCELLED;
 * work already in flight may still complete + still be billed.
 */
export async function cancelGeminiBatch(
  apiKey: string,
  batchName: string,
): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${batchName}:cancel`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok && res.status !== 404) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      `Gemini batch cancel failed (HTTP ${res.status}): ${
        errData.error?.message ?? res.statusText
      }`,
    );
  }
}

// ── Imagen image generation ────────────────────────────────────────
//
// Generates an image from a text prompt via Google's Imagen 4
// endpoint. Paid tier only. Used by the planner Garden Overhaul flow
// to produce "after" concept images.
//
// Returns base64 image bytes + mime type. Caller is responsible for
// uploading to Supabase Storage and getting a public URL.

export interface ImagenResult {
  base64: string;
  mimeType: string;
  model: string;
}

/**
 * Call gemini-2.5-flash-image with a text prompt + reference photo
 * to TRANSFORM the photo. Returns the transformed image as base64.
 *
 * Different from `generateImagenImage` (text-to-image only) — this
 * model is multimodal: it sees the reference photo and produces an
 * image that retains the photo's structure (pathways, fencing,
 * existing trees) while applying the requested transformation. The
 * right fit for Garden Overhaul concept images so users see THEIR
 * garden transformed, not a generic mockup.
 *
 * Cost: $0.039/image (vs Imagen 4 Fast's $0.02). Worth the ~2x
 * for actual photo continuity.
 */
export async function generateGeminiFlashImage(
  apiKey: string,
  prompt: string,
  referencePhoto: { base64: string; mimeType: string },
  opts: {
    timeoutMs?: number;
  } = {},
): Promise<{ base64: string; mimeType: string; model: string }> {
  const model = "gemini-2.5-flash-image";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: referencePhoto.mimeType, data: referencePhoto.base64 } },
      ],
    }],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      `gemini-2.5-flash-image failed (HTTP ${res.status}): ${
        errData.error?.message ?? res.statusText
      }`,
    );
  }

  const data = await res.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  // The model can return text + image; grab the first inlineData part.
  const imgPart = parts.find((p) => p?.inlineData?.data);
  if (!imgPart) {
    const reason = data?.candidates?.[0]?.finishReason ?? "no inlineData in response";
    throw new Error(`gemini-2.5-flash-image returned no image: ${reason}`);
  }
  return {
    base64: imgPart.inlineData.data as string,
    mimeType: (imgPart.inlineData.mimeType as string) ?? "image/png",
    model,
  };
}

/**
 * Call Imagen 4 to generate one image. Fast tier is the cheapest
 * ($0.02/image) and visually adequate for "concept" mockups;
 * caller can override with the standard or ultra model when they
 * need higher fidelity. Single image per call (Imagen's API
 * supports multi-sample but we want predictable cost accounting).
 */
export async function generateImagenImage(
  apiKey: string,
  prompt: string,
  opts: {
    model?: string;
    aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
    timeoutMs?: number;
  } = {},
): Promise<ImagenResult> {
  const model = opts.model ?? "imagen-4.0-fast-generate-001";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;
  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: opts.aspectRatio ?? "4:3",
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      `Imagen generation failed (HTTP ${res.status}): ${
        errData.error?.message ?? res.statusText
      }`,
    );
  }

  const data = await res.json();
  // Imagen response shape: predictions[].bytesBase64Encoded
  const prediction = Array.isArray(data?.predictions) ? data.predictions[0] : null;
  const base64: string | undefined = prediction?.bytesBase64Encoded;
  if (!base64) {
    // Filtered output (safety / content policy) — Imagen returns
    // a structured reason. Surface it so the caller can record it.
    const filter = prediction?.raiFilteredReason ?? prediction?.error?.message;
    throw new Error(`Imagen returned no image${filter ? `: ${filter}` : ""}`);
  }
  return {
    base64,
    mimeType: prediction?.mimeType ?? "image/png",
    model,
  };
}
