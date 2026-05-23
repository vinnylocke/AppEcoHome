import { log, warn } from "./logger.ts";

export const DEFAULT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
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
  promptTokenCount: number;
  candidatesTokenCount: number;
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
        const result = await Promise.race([
          callOnce(apiKey, model, messages, opts),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeoutMs),
          ),
        ]);
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

async function callOnce(
  apiKey: string,
  model: string,
  messages: GeminiMessage[],
  opts: GeminiOptions,
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
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData.error?.message ?? `Gemini HTTP ${res.status} from ${model}`,
    );
  }

  const data = await res.json();
  return {
    text: data.candidates[0].content.parts[0].text,
    usage: {
      promptTokenCount: data.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokenCount: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokenCount: data.usageMetadata?.totalTokenCount ?? 0,
      model,
    },
  };
}
