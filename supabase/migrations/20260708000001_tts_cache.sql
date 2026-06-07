-- ─── Wave 22.0001-A — TTS cache ─────────────────────────────────────────
--
-- Caches Google Cloud Text-to-Speech audio output keyed by (text_hash,
-- voice). The TTS edge function checks this table before hitting Google;
-- re-plays of the same assistant reply are free after the first.
--
-- Audio is stored as base64 in a public storage bucket `tts-audio` so the
-- client can stream it directly without round-tripping through the edge
-- function on cache hits.

CREATE TABLE IF NOT EXISTS public.tts_cache (
  id            uuid primary key default gen_random_uuid(),
  -- SHA-256 hex digest of the canonical text (whitespace-normalised).
  text_hash     text not null,
  -- Google Cloud TTS voice id (e.g. "en-GB-Chirp3-HD-Achernar").
  voice         text not null,
  -- Public URL of the cached MP3 in the `tts-audio` bucket.
  audio_url     text not null,
  -- Byte size of the cached audio (for storage observability).
  byte_size     integer,
  -- First generation time + last play time so we can prune cold entries.
  generated_at  timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  unique (text_hash, voice)
);

ALTER TABLE public.tts_cache ENABLE ROW LEVEL SECURITY;

-- Every user can read the cache (audio URLs are public and not user-
-- identifying — they're hashes of the assistant text). Writes are
-- service-role only.
CREATE POLICY tts_cache_read ON public.tts_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY tts_cache_service_role_all ON public.tts_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Data API grants — explicit per CLAUDE.md (2026-10-30 deadline).
GRANT SELECT ON TABLE public.tts_cache TO authenticated;
GRANT SELECT ON TABLE public.tts_cache TO anon;

-- ── Storage bucket: tts-audio ──
-- Public read; service-role writes. Public read is safe because the
-- audio is just synthesised text the user already chose to read aloud,
-- and the URL is content-addressed by hash so guessing is impractical.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('tts-audio', 'tts-audio', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tts-audio public read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'tts-audio');

CREATE POLICY "tts-audio service-role write"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'tts-audio');
