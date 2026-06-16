-- 2026-06-16 Custom integrations Phase 3 — metadata column + webhook
-- lookup index on integrations.
--
-- Original spec said the webhook_secret lives on
-- `integrations.metadata`. Discovery: the integrations table didn't
-- actually have a metadata column — the existing eWeLink + Ecowitt
-- adapters stash everything they need inside credentials_encrypted.
-- We add a jsonb metadata column so:
--
--   1. The custom_http adapter can store webhook_secret + family +
--      friendly_name + external_device_id without encryption (the
--      secret IS the auth and needs to be readable by the router).
--   2. Future adapters can attach provider-specific configuration
--      without growing the schema per provider.
--
-- The router's exact-match lookup gets a B-tree expression index for
-- O(log N) access on every inbound webhook.

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP INDEX IF EXISTS public.idx_integrations_webhook_secret;
CREATE INDEX idx_integrations_webhook_secret
  ON public.integrations ((metadata->>'webhook_secret'));

COMMENT ON COLUMN public.integrations.metadata IS
  'Provider-specific configuration that does NOT belong in credentials_encrypted. Used by the custom_http adapter for webhook_secret + family + friendly_name + external_device_id, and reserved for future adapters that need readable per-integration state.';
