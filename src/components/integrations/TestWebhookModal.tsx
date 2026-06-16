import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { X, Loader2, Send, Play, Square, AlertCircle, CheckCircle2 } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { Device } from "./IntegrationsPage";

interface Props {
  device: Device;
  onClose: () => void;
  onReadingWritten: () => void;
}

type Tab = "single" | "stream";

const STREAM_INTERVAL_OPTIONS = [30, 60, 120, 300]; // seconds
const STREAM_DURATION_OPTIONS = [5, 15, 30, 60]; // minutes
const STREAM_MAX_REQUESTS = 120;
const LOG_RING_SIZE = 20;

function buildWebhookUrl(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  return `${base}/functions/v1/integrations-webhook-router/custom_http`;
}

function defaultSoilPayload(externalId: string) {
  return {
    schema_version: 1,
    device_external_id: externalId,
    soil_moisture: 45,
    soil_temp: 18,
    soil_ec: 1200,
    ec_source: "calibrated_us_cm",
    battery_percent: 87,
  };
}

function defaultValvePayload(externalId: string) {
  return {
    schema_version: 1,
    device_external_id: externalId,
    state: "on",
    battery_percent: 87,
  };
}

interface LogEntry {
  at: Date;
  status: number;
  detail: string;
}

/**
 * Random-walk: nudge `value` by up to ±5% of the range, clamped to bounds.
 * Used in stream mode to produce wiggly history charts that look like
 * real sensor data rather than a flat line.
 */
function drift(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return value;
  const delta = (Math.random() * 2 - 1) * 0.05 * range;
  return Math.max(min, Math.min(max, value + delta));
}

export default function TestWebhookModal({ device, onClose, onReadingWritten }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const isSoil = device.device_type === "soil_sensor";

  // Webhook secret — fetched from integrations.metadata.
  const [secret, setSecret] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("integrations")
      .select("metadata")
      .eq("id", device.integration_id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) { setSecretError(err.message); return; }
        const meta = (data?.metadata ?? {}) as Record<string, unknown>;
        const s = typeof meta.webhook_secret === "string" ? meta.webhook_secret : null;
        if (!s) setSecretError("No webhook secret on this integration");
        setSecret(s);
      });
  }, [device.integration_id]);

  // ── Tabs ────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("single");

  // ── Single tab state ────────────────────────────────────────────────────
  const defaultPayload = isSoil ? defaultSoilPayload(device.external_device_id) : defaultValvePayload(device.external_device_id);
  const [payloadText, setPayloadText] = useState<string>(JSON.stringify(defaultPayload, null, 2));
  const [sending, setSending] = useState(false);
  const [singleResult, setSingleResult] = useState<{ ok: boolean; status: number; message: string } | null>(null);
  const [latestReading, setLatestReading] = useState<{ data: Record<string, unknown>; recorded_at: string } | null>(null);

  const resetPayload = () => {
    setPayloadText(JSON.stringify(defaultPayload, null, 2));
    setSingleResult(null);
    setLatestReading(null);
  };

  const sendOne = async (rawBody?: string) => {
    if (!secret) return;
    setSending(true);
    setSingleResult(null);
    setLatestReading(null);
    try {
      const body = rawBody ?? payloadText;
      // Sanity-check JSON before sending so we don't surface a confusing
      // network error for what's really a syntax mistake in the editor.
      try { JSON.parse(body); } catch {
        throw new Error("Payload is not valid JSON");
      }
      const res = await fetch(buildWebhookUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Rhozly-Token": secret,
        },
        body,
      });
      const json = await res.json().catch(() => ({}));
      const message = res.ok
        ? `${json.written ?? 0} reading(s) written`
        : (json.error ?? `HTTP ${res.status}`);
      setSingleResult({ ok: res.ok, status: res.status, message });

      if (res.ok) {
        const { data } = await supabase
          .from("device_readings")
          .select("data, recorded_at")
          .eq("device_id", device.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) setLatestReading(data as { data: Record<string, unknown>; recorded_at: string });
        onReadingWritten();
      }
    } catch (e) {
      setSingleResult({ ok: false, status: 0, message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSending(false);
    }
  };

  // ── Stream tab state ────────────────────────────────────────────────────
  const [intervalSec, setIntervalSec] = useState(STREAM_INTERVAL_OPTIONS[0]);
  const [durationMin, setDurationMin] = useState(STREAM_DURATION_OPTIONS[0]);
  const [varyValues, setVaryValues] = useState(true);
  const [batteryDecay, setBatteryDecay] = useState(true);

  // Drift bounds — sensible defaults for each family.
  const [moistureRange, setMoistureRange] = useState<[number, number]>([30, 60]);
  const [tempRange, setTempRange] = useState<[number, number]>([14, 22]);

  const [streaming, setStreaming] = useState(false);
  const [sent, setSent] = useState(0);
  const [failed, setFailed] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);

  const streamStateRef = useRef<{
    cancel: boolean;
    moisture: number;
    temp: number;
    battery: number;
    ticks: number;
  }>({ cancel: false, moisture: 45, temp: 18, battery: 87, ticks: 0 });

  const maxRequests = useMemo(() => {
    const max = Math.floor((durationMin * 60) / intervalSec);
    return Math.min(max, STREAM_MAX_REQUESTS);
  }, [intervalSec, durationMin]);

  const startStream = async () => {
    if (!secret) return;
    streamStateRef.current = {
      cancel: false,
      moisture: (moistureRange[0] + moistureRange[1]) / 2,
      temp: (tempRange[0] + tempRange[1]) / 2,
      battery: 87,
      ticks: 0,
    };
    setStreaming(true);
    setSent(0);
    setFailed(0);
    setLog([]);

    let count = 0;
    while (count < maxRequests && !streamStateRef.current.cancel) {
      const state = streamStateRef.current;
      if (varyValues) {
        state.moisture = drift(state.moisture, moistureRange[0], moistureRange[1]);
        state.temp = drift(state.temp, tempRange[0], tempRange[1]);
      }
      if (batteryDecay && state.ticks > 0 && state.ticks % 5 === 0) {
        state.battery = Math.max(0, state.battery - 1);
      }
      state.ticks += 1;

      const body = isSoil
        ? {
            schema_version: 1,
            device_external_id: device.external_device_id,
            soil_moisture: Math.round(state.moisture * 10) / 10,
            soil_temp: Math.round(state.temp * 10) / 10,
            soil_ec: 1200,
            ec_source: "calibrated_us_cm",
            battery_percent: state.battery,
          }
        : {
            schema_version: 1,
            device_external_id: device.external_device_id,
            state: count % 2 === 0 ? "on" : "off",
            battery_percent: state.battery,
          };

      try {
        const res = await fetch(buildWebhookUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Rhozly-Token": secret },
          body: JSON.stringify(body),
        });
        const detail = isSoil
          ? `moisture=${(body as { soil_moisture: number }).soil_moisture} battery=${state.battery}`
          : `state=${(body as { state: string }).state} battery=${state.battery}`;
        if (res.ok) {
          setSent((n) => n + 1);
          setLog((l) => [...l, { at: new Date(), status: res.status, detail }].slice(-LOG_RING_SIZE));
        } else {
          setFailed((n) => n + 1);
          setLog((l) => [...l, { at: new Date(), status: res.status, detail: `failed: ${detail}` }].slice(-LOG_RING_SIZE));
        }
      } catch {
        setFailed((n) => n + 1);
        setLog((l) => [...l, { at: new Date(), status: 0, detail: "network error" }].slice(-LOG_RING_SIZE));
      }

      count += 1;
      if (count < maxRequests && !streamStateRef.current.cancel) {
        await new Promise<void>((resolve) => setTimeout(resolve, intervalSec * 1000));
      }
    }

    setStreaming(false);
    onReadingWritten();
  };

  const stopStream = () => {
    streamStateRef.current.cancel = true;
  };

  // Clean up if the modal is closed mid-stream
  useEffect(() => {
    return () => {
      streamStateRef.current.cancel = true;
    };
  }, []);

  const close = () => {
    streamStateRef.current.cancel = true;
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Test webhook" className="relative w-[calc(100vw-2rem)] max-w-lg bg-white rounded-3xl shadow-xl max-h-[90vh] overflow-y-auto" data-testid="test-webhook-modal">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-rhozly-outline/10 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div>
            <h2 className="font-black text-rhozly-on-surface text-lg">Test webhook</h2>
            <p className="text-xs text-rhozly-on-surface-variant mt-0.5">{device.name}</p>
          </div>
          <button onClick={close} aria-label="Close" data-testid="test-webhook-close" className="p-2 text-rhozly-on-surface-variant hover:text-rhozly-on-surface">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("single")}
            data-testid="test-webhook-tab-single"
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === "single" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface text-rhozly-on-surface-variant"}`}
          >Single</button>
          <button
            type="button"
            onClick={() => setTab("stream")}
            data-testid="test-webhook-tab-stream"
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === "stream" ? "bg-rhozly-primary text-white" : "bg-rhozly-surface text-rhozly-on-surface-variant"}`}
          >Stream</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {secretError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {secretError}
            </div>
          )}

          {tab === "single" && (
            <>
              <p className="text-xs text-rhozly-on-surface-variant">
                This sends a fake reading to your webhook just like a real device would. Useful for validating your
                firmware's JSON shape or checking the integration works end-to-end.
              </p>

              <div>
                <label className="block text-xs font-semibold text-rhozly-on-surface mb-1.5">Payload</label>
                <textarea
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  data-testid="test-webhook-payload"
                  spellCheck={false}
                  className="w-full h-56 px-3 py-2 rounded-xl border border-rhozly-outline/30 bg-rhozly-surface-low/30 font-mono text-xs text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetPayload}
                  className="px-4 py-2 rounded-xl border border-rhozly-outline/20 text-xs font-semibold text-rhozly-on-surface-variant hover:bg-rhozly-surface transition-colors"
                >Reset to sample</button>
                <button
                  type="button"
                  onClick={() => sendOne()}
                  disabled={sending || !secret}
                  data-testid="test-webhook-send"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rhozly-primary text-white font-bold text-sm disabled:opacity-60"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>

              {singleResult && (
                <div
                  data-testid="test-webhook-result"
                  className={`rounded-xl px-3 py-2 text-xs ${singleResult.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    {singleResult.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                    {singleResult.ok ? "Success" : "Error"} · HTTP {singleResult.status || "—"}
                  </div>
                  <div className="mt-0.5">{singleResult.message}</div>
                </div>
              )}

              {latestReading && (
                <div className="rounded-xl bg-rhozly-surface-low/50 border border-rhozly-outline/10 p-3 text-xs">
                  <p className="font-semibold text-rhozly-on-surface mb-1">Latest reading from the DB</p>
                  <pre className="text-rhozly-on-surface-variant font-mono overflow-x-auto" data-testid="test-webhook-latest">
                    {JSON.stringify(latestReading.data, null, 2)}
                  </pre>
                  <p className="text-rhozly-on-surface-variant/70 mt-1">
                    Recorded {new Date(latestReading.recorded_at).toLocaleString()}
                  </p>
                </div>
              )}
            </>
          )}

          {tab === "stream" && (
            <>
              <p className="text-xs text-rhozly-on-surface-variant">
                Fires fake readings at a fixed interval so you can watch the history chart populate, the battery pip
                tick down, and the sensor-driven automations fire. Streaming stops automatically after the duration
                or {STREAM_MAX_REQUESTS} requests — whichever comes first.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-rhozly-on-surface mb-1">Interval</label>
                  <select
                    value={intervalSec}
                    onChange={(e) => setIntervalSec(Number(e.target.value))}
                    disabled={streaming}
                    data-testid="stream-interval"
                    className="w-full px-3 py-2 rounded-xl border border-rhozly-outline/30 bg-white text-xs"
                  >
                    {STREAM_INTERVAL_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}s</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-rhozly-on-surface mb-1">Duration</label>
                  <select
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    disabled={streaming}
                    data-testid="stream-duration"
                    className="w-full px-3 py-2 rounded-xl border border-rhozly-outline/30 bg-white text-xs"
                  >
                    {STREAM_DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-rhozly-on-surface-variant">
                Will send up to {maxRequests} requests (capped at {STREAM_MAX_REQUESTS}).
              </p>

              {isSoil && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-rhozly-on-surface">
                    <input
                      type="checkbox"
                      checked={varyValues}
                      onChange={(e) => setVaryValues(e.target.checked)}
                      disabled={streaming}
                      data-testid="stream-vary"
                      className="accent-rhozly-primary"
                    />
                    Random-walk values within bounds
                  </label>
                  {varyValues && (
                    <div className="grid grid-cols-2 gap-2 pl-5">
                      <RangeInput label="Moisture" range={moistureRange} onChange={setMoistureRange} disabled={streaming} testId="stream-moisture-range" />
                      <RangeInput label="Temp (°C)" range={tempRange} onChange={setTempRange} disabled={streaming} testId="stream-temp-range" />
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-semibold text-rhozly-on-surface">
                <input
                  type="checkbox"
                  checked={batteryDecay}
                  onChange={(e) => setBatteryDecay(e.target.checked)}
                  disabled={streaming}
                  data-testid="stream-battery-decay"
                  className="accent-rhozly-primary"
                />
                Battery decay (drop ~1% every 5 readings)
              </label>

              <div className="flex gap-2">
                {!streaming ? (
                  <button
                    type="button"
                    onClick={startStream}
                    disabled={!secret}
                    data-testid="stream-start"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rhozly-primary text-white font-bold text-sm disabled:opacity-60"
                  >
                    <Play size={14} /> Start streaming
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopStream}
                    data-testid="stream-stop"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm"
                  >
                    <Square size={14} /> Stop
                  </button>
                )}
              </div>

              <div className="rounded-xl bg-rhozly-surface-low/50 border border-rhozly-outline/10 p-3 text-xs">
                <p className="font-semibold text-rhozly-on-surface mb-2">
                  Sent: {sent} · Failed: {failed} · {streaming ? "Running…" : (sent > 0 || failed > 0 ? "Done" : "Idle")}
                </p>
                <div className="max-h-40 overflow-y-auto font-mono text-[11px] text-rhozly-on-surface-variant space-y-0.5" data-testid="stream-log">
                  {log.length === 0 && <p className="text-rhozly-on-surface-variant/60">No requests yet</p>}
                  {log.map((entry, i) => (
                    <div key={i}>
                      {entry.at.toLocaleTimeString()} {entry.status === 200 ? "✓" : "✗"} {entry.detail}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <p className="text-[11px] text-rhozly-on-surface-variant/70 text-center">
            Closing this tab stops any in-flight stream — no infrastructure provisioned.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RangeInput({
  label,
  range,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  range: [number, number];
  onChange: (next: [number, number]) => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <p className="text-[10px] text-rhozly-on-surface-variant mb-0.5">{label}</p>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={range[0]}
          onChange={(e) => onChange([Number(e.target.value), range[1]])}
          disabled={disabled}
          className="w-full px-2 py-1 rounded-lg border border-rhozly-outline/30 bg-white text-[11px]"
        />
        <span className="text-[10px] text-rhozly-on-surface-variant">–</span>
        <input
          type="number"
          value={range[1]}
          onChange={(e) => onChange([range[0], Number(e.target.value)])}
          disabled={disabled}
          className="w-full px-2 py-1 rounded-lg border border-rhozly-outline/30 bg-white text-[11px]"
        />
      </div>
    </div>
  );
}
