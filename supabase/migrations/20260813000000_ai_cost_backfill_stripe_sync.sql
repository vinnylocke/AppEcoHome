-- AI cost backfill + Stripe per-customer cost sync + payload prune.
-- Phase 1 (cont.) of docs/plans/ai-audit-and-improvement.md.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── 1. Backfill historical estimated_cost_usd ───────────────────────────────
--
-- Old rows were costed with the crude flat per-token rate. Recompute from the
-- stored tokens with the real per-model input/output rates (cached + thoughts
-- columns are 0 for historical rows, so this is input×inputRate +
-- candidates×outputRate). Image-only rows (total_tokens = 0) keep their
-- image_cost_usd. Unknown models are left as-is (no rate to apply).
-- Rates mirror supabase/functions/_shared/geminiCost.ts — keep in sync.

WITH prices(model, input_rate, output_rate) AS (
  VALUES
    ('gemini-2.5-flash-lite',                 0.10::numeric, 0.40::numeric),
    ('gemini-2.5-flash-lite-preview-09-2025', 0.10,          0.40),
    ('gemini-2.5-flash',                      0.30,          2.50),
    ('gemini-3-flash-preview',                0.50,          3.00),
    ('gemini-3.1-flash-lite-preview',         0.25,          1.50),
    ('gemini-3.1-flash-lite',                 0.25,          1.50),
    ('gemini-3.5-flash',                      1.50,          9.00),
    ('gemini-2.5-pro',                        1.25,         10.00),
    ('gemini-3.1-pro-preview',                2.00,         12.00)
)
UPDATE public.ai_usage_log a
SET estimated_cost_usd = round(
  ((a.prompt_tokens::numeric * p.input_rate)
   + (a.candidates_tokens::numeric * p.output_rate)) / 1000000.0
  + coalesce(a.image_cost_usd, 0)
, 8)
FROM prices p
WHERE a.model = p.model
  AND a.total_tokens > 0;

-- ── 2. Per-customer rollup RPC (service-role only) ──────────────────────────
--
-- Returns AI cost per user that has a Stripe customer. SECURITY DEFINER + execute
-- revoked from anon/authenticated so a regular user can't read every customer's
-- spend — only the service-role edge function (sync-stripe-ai-cost) calls it.

CREATE OR REPLACE FUNCTION public.ai_cost_rollup_for_stripe()
RETURNS TABLE (
  user_id            uuid,
  stripe_customer_id text,
  cost_30d           numeric,
  cost_total         numeric,
  calls_30d          bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    up.uid AS user_id,
    up.stripe_customer_id,
    COALESCE(SUM(a.estimated_cost_usd)
      FILTER (WHERE a.created_at >= now() - interval '30 days'), 0) AS cost_30d,
    COALESCE(SUM(a.estimated_cost_usd), 0) AS cost_total,
    COALESCE(COUNT(a.id)
      FILTER (WHERE a.created_at >= now() - interval '30 days'), 0) AS calls_30d
  FROM public.user_profiles up
  LEFT JOIN public.ai_usage_log a ON a.user_id = up.uid
  WHERE up.stripe_customer_id IS NOT NULL
  GROUP BY up.uid, up.stripe_customer_id;
$$;

REVOKE ALL ON FUNCTION public.ai_cost_rollup_for_stripe() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_cost_rollup_for_stripe() TO service_role;

-- ── 3. Prune cron — null payloads after 30 days (keep the cost row) ─────────

DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'prune-ai-usage-payloads';
END $$;

SELECT cron.schedule(
  'prune-ai-usage-payloads',
  '0 4 * * *',  -- daily 04:00 UTC
  $$
  UPDATE public.ai_usage_log
  SET context_block = NULL, prompt = NULL, raw_result = NULL
  WHERE created_at < now() - interval '30 days'
    AND (context_block IS NOT NULL OR prompt IS NOT NULL OR raw_result IS NOT NULL);
  $$
);

-- ── 4. Stripe cost sync cron — daily push of per-customer cost to Stripe ────

DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-stripe-ai-cost-daily';
END $$;

SELECT cron.schedule(
  'sync-stripe-ai-cost-daily',
  '15 4 * * *',  -- daily 04:15 UTC (after the prune)
  $$
  select net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/sync-stripe-ai-cost',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
