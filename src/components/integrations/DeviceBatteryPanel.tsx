import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Battery, RotateCcw, Loader2 } from "lucide-react";
import { estimateBatteryRemaining, type BatteryReading } from "../../lib/batteryEstimate";
import type { Device } from "./IntegrationsPage";

interface Props {
  device: Device;
  onResetRecorded: () => void;
  canManage: boolean;
}

const HISTORY_DAYS = 30;
const ESTIMATE_WINDOW_DAYS = 14;

/**
 * Battery decay sparkline + "estimated days remaining" + a reset
 * button users hit when they swap the battery.
 *
 * Hidden when the device has no battery history at all (most providers
 * never send one). The estimate is hidden until there's enough signal
 * to be honest — see batteryEstimate.ts for the rules.
 */
export default function DeviceBatteryPanel({ device, onResetRecorded, canManage }: Props) {
  const [history, setHistory] = useState<BatteryReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastReset, setLastReset] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = async () => {
    setLoading(true);
    // 1. Find the most recent battery reset (bounds the estimate window).
    const { data: resetRow } = await supabase
      .from("device_battery_resets")
      .select("occurred_at")
      .eq("device_id", device.id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const resetAt = (resetRow as { occurred_at: string } | null)?.occurred_at ?? null;
    setLastReset(resetAt);

    // 2. Pull battery_percent readings from device_readings.data.
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - HISTORY_DAYS);
    const sinceIso = (resetAt && new Date(resetAt) > sinceDate) ? resetAt : sinceDate.toISOString();

    const { data } = await supabase
      .from("device_readings")
      .select("data, recorded_at")
      .eq("device_id", device.id)
      .gte("recorded_at", sinceIso)
      .order("recorded_at", { ascending: true })
      .limit(1000);

    const series = ((data ?? []) as { data: Record<string, unknown>; recorded_at: string }[])
      .map((r) => {
        const b = r.data?.battery_percent;
        return typeof b === "number" ? { recordedAt: r.recorded_at, percent: b } : null;
      })
      .filter((r): r is BatteryReading => r !== null);
    setHistory(series);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  const recordReset = async () => {
    setResetting(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("device_battery_resets").insert({
      device_id: device.id,
      home_id: device.home_id,
      recorded_by: user?.id ?? null,
    });
    setResetting(false);
    setConfirmReset(false);
    onResetRecorded();
    load();
  };

  if (loading) {
    return (
      <section className="rounded-2xl bg-rhozly-surface-low/50 border border-rhozly-outline/10 p-4 flex items-center justify-center">
        <Loader2 className="animate-spin text-rhozly-primary" size={16} />
      </section>
    );
  }

  // No battery data at all — don't render anything. The hardware
  // doesn't report battery so this whole panel is irrelevant.
  if (device.battery_percent === null && history.length === 0) return null;

  // For the estimate, look only at the last 14 days (or since the
  // most recent reset, whichever is more recent).
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ESTIMATE_WINDOW_DAYS);
  const cutoffIso = (lastReset && new Date(lastReset) > cutoff) ? lastReset : cutoff.toISOString();
  const estimateInput = history.filter((r) => r.recordedAt >= cutoffIso);
  const estimate = estimateBatteryRemaining(estimateInput);

  return (
    <section className="rounded-2xl bg-rhozly-surface-low/50 border border-rhozly-outline/10 p-4" data-testid="device-battery-panel">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-rhozly-on-surface flex items-center gap-1.5">
          <Battery size={14} />
          Battery health
        </h3>
        {device.battery_percent !== null && (
          <span className="text-xs font-semibold text-rhozly-on-surface" data-testid="battery-current">
            {device.battery_percent}% now
          </span>
        )}
      </div>

      {history.length >= 2 ? (
        <div className="h-24 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history.map((r) => ({ t: new Date(r.recordedAt).getTime(), v: r.percent }))}>
              <XAxis dataKey="t" hide />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                // Casts: recharts' Tooltip formatter types are wider than
                // the runtime values this chart produces.
                formatter={((v: number) => [`${Math.round(v)}%`, "Battery"]) as any}
                labelFormatter={((t: number) => new Date(t).toLocaleDateString()) as (label: unknown) => string}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="v" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-rhozly-on-surface-variant/70">
          Not enough history yet — readings will appear once your device has posted a few times.
        </p>
      )}

      {estimate && (
        <p className="text-xs text-rhozly-on-surface-variant mt-2" data-testid="battery-days-remaining">
          Estimated <span className="font-semibold text-rhozly-on-surface">{estimate.daysRemaining} days</span> remaining
          based on the last {ESTIMATE_WINDOW_DAYS} days of readings.
        </p>
      )}

      {canManage && (
        <div className="mt-3 pt-3 border-t border-rhozly-outline/10">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              data-testid="battery-reset-btn"
              className="flex items-center gap-1.5 text-xs font-semibold text-rhozly-on-surface-variant hover:text-rhozly-on-surface"
            >
              <RotateCcw size={12} />
              Battery changed?
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xs text-rhozly-on-surface-variant flex-1">
                Mark battery as freshly changed? Resets the estimate window.
              </p>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="text-xs text-rhozly-on-surface-variant px-2 py-1"
              >Cancel</button>
              <button
                type="button"
                onClick={recordReset}
                disabled={resetting}
                data-testid="battery-reset-confirm"
                className="text-xs font-bold text-white bg-rhozly-primary px-3 py-1 rounded-lg disabled:opacity-60"
              >{resetting ? "…" : "Confirm"}</button>
            </div>
          )}
          {lastReset && (
            <p className="text-[10px] text-rhozly-on-surface-variant/60 mt-1">
              Last changed: {new Date(lastReset).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
