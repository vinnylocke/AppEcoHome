// ─── tts-speak ─────────────────────────────────────────────────────────────
//
// Synthesises assistant chat text into speech via Google Cloud TTS.
// Reads from `tts_cache` first — same (text_hash, voice) returns the
// cached MP3 URL instead of paying for synthesis. Writes new audio to
// the public `tts-audio` bucket on cache miss.
//
// Request body:
//   { text: string, voice?: string }
//
// Response:
//   { audio_url: string, cache_hit: boolean, voice: string }
//
// Errors are typed in `error.kind` so the client can decide whether to
// fall back to browser SpeechSynthesis or surface a real failure.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "tts-speak";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const DEFAULT_VOICE = "en-GB-Chirp3-HD-Achernar";
const TTS_BUCKET = "tts-audio";

// Normalise whitespace so trivially-different copies of the same reply
// share the same cache key.
function normaliseText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface GoogleTtsResponse {
  audioContent?: string;
  error?: { message?: string };
}

async function callGoogleTts(opts: {
  apiKey: string;
  text: string;
  voice: string;
}): Promise<{ base64: string; bytes: number }> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${opts.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: opts.text },
        voice: { languageCode: opts.voice.slice(0, 5), name: opts.voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google TTS ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as GoogleTtsResponse;
  if (data.error?.message) throw new Error(`Google TTS: ${data.error.message}`);
  const base64 = data.audioContent;
  if (!base64) throw new Error("Google TTS returned no audioContent");
  return { base64, bytes: Math.floor(base64.length * 0.75) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const googleKey = Deno.env.get("GOOGLE_CLOUD_API_KEY")
      ?? Deno.env.get("GEMINI_API_KEY"); // both work — same Google account
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!googleKey) {
      return new Response(
        JSON.stringify({ error: { kind: "missing_api_key" } }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawText = typeof body?.text === "string" ? body.text : "";
    const text = normaliseText(rawText);
    const voice = (typeof body?.voice === "string" && body.voice.length > 0)
      ? body.voice
      : DEFAULT_VOICE;

    if (text.length === 0) {
      return new Response(
        JSON.stringify({ error: { kind: "empty_text" } }),
        { status: 400, headers: jsonHeaders },
      );
    }
    // Google TTS hard limit is 5000 chars per request. Reject longer
    // payloads — chunking can come later; for now the client truncates.
    if (text.length > 4500) {
      return new Response(
        JSON.stringify({ error: { kind: "text_too_long" } }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const textHash = await sha256Hex(text);

    // ── Cache lookup ──
    const { data: cached } = await supabase
      .from("tts_cache")
      .select("audio_url")
      .eq("text_hash", textHash)
      .eq("voice", voice)
      .maybeSingle();

    if (cached?.audio_url) {
      // Best-effort last_used touch — no need to await.
      supabase
        .from("tts_cache")
        .update({ last_used_at: new Date().toISOString() })
        .eq("text_hash", textHash)
        .eq("voice", voice)
        .then(() => {});
      log(FN, "cache_hit", { textLen: text.length, voice });
      return new Response(
        JSON.stringify({ audio_url: cached.audio_url, cache_hit: true, voice }),
        { headers: jsonHeaders },
      );
    }

    // ── Cache miss — synthesise + persist ──
    const synth = await callGoogleTts({ apiKey: googleKey, text, voice });
    const bytes = base64ToBytes(synth.base64);
    const objectPath = `${textHash.slice(0, 2)}/${textHash}-${voice}.mp3`;

    const { error: uploadErr } = await supabase
      .storage
      .from(TTS_BUCKET)
      .upload(objectPath, bytes, {
        contentType: "audio/mpeg",
        upsert: false,
      });
    if (uploadErr && !uploadErr.message?.includes("already exists")) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const { data: publicUrl } = supabase
      .storage
      .from(TTS_BUCKET)
      .getPublicUrl(objectPath);

    const audioUrl = publicUrl.publicUrl;

    // Insert cache row. Idempotent via unique(text_hash, voice).
    await supabase
      .from("tts_cache")
      .upsert({
        text_hash: textHash,
        voice,
        audio_url: audioUrl,
        byte_size: synth.bytes,
      }, { onConflict: "text_hash,voice" });

    log(FN, "cache_miss_synthesised", { textLen: text.length, voice, bytes: synth.bytes });
    return new Response(
      JSON.stringify({ audio_url: audioUrl, cache_hit: false, voice }),
      { headers: jsonHeaders },
    );
  } catch (err: any) {
    warn(FN, "synth_failed", { error: err.message });
    await captureException(FN, err);
    return new Response(
      JSON.stringify({ error: { kind: "synthesis_failed", message: err.message } }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
