import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Copy, Eye, EyeOff, RefreshCw, Loader2, AlertTriangle, ChevronDown, ChevronUp, CheckCheck } from "lucide-react";

interface Props {
  integrationId: string;
  deviceExternalId: string;
  family: "soil_sensor" | "water_valve";
}

const FUNCTIONS_URL_KEY = "VITE_SUPABASE_FUNCTIONS_URL";

const SOIL_SAMPLE = `{
  "schema_version": 1,
  "device_external_id": "<your-device-id>",
  "soil_moisture": 45,
  "soil_temp": 18,
  "soil_ec": 1200,
  "ec_source": "calibrated_us_cm",
  "battery_percent": 87
}`;

const VALVE_SAMPLE = `{
  "schema_version": 1,
  "device_external_id": "<your-device-id>",
  "state": "on",
  "battery_percent": 87
}`;

function buildWebhookUrl(secret: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const functionsUrl = (import.meta.env as Record<string, string | undefined>)[FUNCTIONS_URL_KEY];
  const base = (functionsUrl ?? supabaseUrl ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/integrations-webhook-router/custom_http/${secret}`;
}

/**
 * Read-only panel showing the webhook URL + sample payload for a
 * custom_http integration. Includes a reveal-secret toggle and a
 * "Regenerate" button that swaps the secret out and immediately
 * surfaces the new URL.
 *
 * Solves the "I closed the wizard and lost my URL" problem — every
 * custom_http device's settings modal can now produce its webhook
 * URL on demand, and rotation is one click away if the secret leaks.
 */
export default function WebhookDetailsPanel({ integrationId, deviceExternalId, family }: Props) {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSample, setShowSample] = useState(false);
  const [rotateConfirm, setRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("integrations")
        .select("metadata")
        .eq("id", integrationId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const meta = (data?.metadata ?? {}) as Record<string, unknown>;
      const s = typeof meta.webhook_secret === "string" ? meta.webhook_secret : null;
      setSecret(s);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [integrationId]);

  const rotate = async () => {
    setRotating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("integrations-rotate-webhook-secret", {
        body: { integrationId, appOrigin: window.location.origin },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { secret?: string; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.secret) throw new Error("Missing secret in response");
      setSecret(payload.secret);
      setRotateConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rotate secret");
    } finally {
      setRotating(false);
    }
  };

  const copyUrl = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(buildWebhookUrl(secret));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sample = (family === "water_valve" ? VALVE_SAMPLE : SOIL_SAMPLE).replace(
    "<your-device-id>",
    deviceExternalId,
  );

  if (loading) {
    return (
      <div className="rounded-2xl bg-rhozly-surface-low/50 border border-rhozly-outline/10 p-4 flex items-center justify-center">
        <Loader2 className="animate-spin text-rhozly-primary" size={16} />
      </div>
    );
  }

  if (!secret) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
        <p className="text-sm text-amber-800 font-semibold">No webhook secret found</p>
        <p className="text-xs text-amber-700 mt-1">
          This integration doesn't have a webhook secret — try reconnecting the device.
        </p>
      </div>
    );
  }

  const fullUrl = buildWebhookUrl(secret);
  const displayed = revealed
    ? fullUrl
    : fullUrl.replace(secret, "•".repeat(Math.min(secret.length, 16)));

  return (
    <div className="rounded-2xl bg-rhozly-surface-low/50 border border-rhozly-outline/10 p-4 space-y-3" data-testid="webhook-details-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-rhozly-on-surface">Webhook details</h3>
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          data-testid="webhook-reveal-toggle"
          className="flex items-center gap-1 text-xs font-semibold text-rhozly-on-surface-variant hover:text-rhozly-on-surface"
        >
          {revealed ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Reveal</>}
        </button>
      </div>

      <div className="bg-white border border-rhozly-outline/20 rounded-xl px-3 py-2 font-mono text-xs text-rhozly-on-surface break-all" data-testid="webhook-url">
        {displayed}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={copyUrl}
          data-testid="webhook-copy"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-rhozly-outline/20 text-xs font-semibold text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
        >
          {copied ? <><CheckCheck size={12} className="text-green-600" /> Copied</> : <><Copy size={12} /> Copy URL</>}
        </button>
        <button
          type="button"
          onClick={() => setRotateConfirm(true)}
          data-testid="webhook-rotate"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <RefreshCw size={12} /> Regenerate
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowSample((s) => !s)}
        data-testid="webhook-sample-toggle"
        className="w-full flex items-center justify-between text-xs font-semibold text-rhozly-on-surface-variant hover:text-rhozly-on-surface"
      >
        Sample payload
        {showSample ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showSample && (
        <pre className="bg-rhozly-on-surface/95 text-green-200 text-[11px] font-mono rounded-xl p-3 overflow-x-auto" data-testid="webhook-sample">
          {sample}
        </pre>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
      )}

      {rotateConfirm && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
            <AlertTriangle size={14} />
            Regenerate webhook secret?
          </div>
          <p className="text-xs text-amber-700 mb-3">
            Any device currently posting to the old URL will stop working until you update its firmware.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRotateConfirm(false)}
              className="flex-1 py-2 rounded-xl border border-amber-200 text-xs font-semibold text-amber-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={rotate}
              disabled={rotating}
              data-testid="webhook-rotate-confirm"
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold disabled:opacity-60"
            >
              {rotating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {rotating ? "Rotating…" : "Regenerate"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
