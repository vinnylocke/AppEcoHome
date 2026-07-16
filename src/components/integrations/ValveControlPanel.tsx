import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Power, RotateCcw, Timer, Loader2, Lock } from "lucide-react";
import { IconWatering } from "../../constants/icons";
import { valveControlMode } from "../../lib/valveControl";

interface Props {
  deviceId: string;
  homeId: string;
  /** `integrations.provider` — drives which control path is used. */
  provider: string;
  /** custom_http valves: true when a control URL was configured at connect. */
  controllable: boolean;
  /** Caller's `integrations.control` permission. */
  canControl: boolean;
  defaultDurationSeconds: number;
}

type ValveState = "on" | "off" | "unknown";

export default function ValveControlPanel({
  deviceId, provider, controllable, canControl, defaultDurationSeconds,
}: Props) {
  const [state, setState] = useState<ValveState>("unknown");
  const [autoOffAt, setAutoOffAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [loading, setLoading] = useState<"on" | "off" | "state" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mode = valveControlMode(provider, controllable);    // "ewelink" | "custom" | "readonly"
  const isEwelink = provider === "ewelink";
  const canActuate = canControl && mode !== "readonly";

  // Countdown timer display
  useEffect(() => {
    if (!autoOffAt || state !== "on") { setCountdown(null); return; }
    const tick = () => {
      const remaining = Math.max(0, autoOffAt.getTime() - Date.now());
      if (remaining === 0) { setCountdown(null); setState("off"); return; }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [autoOffAt, state]);

  // Fetch current state on mount
  useEffect(() => {
    fetchState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  /** supabase.functions.invoke surfaces non-2xx as a FunctionsHttpError
   *  whose `message` is generic; the real reason lives on `error.context`
   *  as JSON. Extract it so the user sees what actually happened. */
  const extractEdgeError = async (err: unknown, fallback: string): Promise<string> => {
    if (!err) return fallback;
    const ctx = (err as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body && typeof body === "object" && "error" in body) {
          const e = (body as { error?: unknown }).error;
          if (typeof e === "string" && e.length > 0) return e;
        }
      } catch { /* keep fallback */ }
    }
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };

  /** eWeLink reads live state from the provider; everything else (custom_http
   *  + read-only valves) reflects the most recent reported reading. */
  const fetchState = async () => {
    setLoading("state");
    setError(null);
    try {
      if (isEwelink) {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke("integrations-ewelink-state", {
          body: { deviceId },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.error) throw new Error(await extractEdgeError(res.error, "Failed to fetch state"));
        setState(res.data.state as ValveState);
      } else {
        const { data, error: qErr } = await supabase
          .from("device_readings")
          .select("data")
          .eq("device_id", deviceId)
          .order("recorded_at", { ascending: false })
          .limit(1);
        if (qErr) throw new Error(qErr.message);
        const reported = (data?.[0]?.data as { state?: string } | undefined)?.state;
        setState(reported === "on" ? "on" : reported === "off" ? "off" : "unknown");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch state");
    } finally {
      setLoading(null);
    }
  };

  const sendCommand = async (command: "turn_on" | "turn_off") => {
    setLoading(command === "turn_on" ? "on" : "off");
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fn = isEwelink ? "integrations-ewelink-control" : "integrations-adapter-control";
      const res = await supabase.functions.invoke(fn, {
        body: { deviceId, command, durationSeconds: defaultDurationSeconds },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeError(res.error, "Command failed"));
      setState(command === "turn_on" ? "on" : "off");
      if (command === "turn_on" && res.data?.autoOffAt) {
        setAutoOffAt(new Date(res.data.autoOffAt));
      } else {
        setAutoOffAt(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Command failed");
    } finally {
      setLoading(null);
    }
  };

  const isOn = state === "on";

  return (
    <div
      className="rounded-3xl border border-rhozly-outline/20 bg-rhozly-surface-lowest p-5"
      data-testid={canActuate ? "valve-control-panel" : "valve-state-panel"}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isOn ? "bg-blue-100" : "bg-rhozly-surface-low"}`}>
          <IconWatering className={isOn ? "text-blue-600" : "text-rhozly-on-surface-variant"} size={20} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-rhozly-on-surface">Water Valve</p>
          <p className={`text-xs font-semibold ${isOn ? "text-blue-600" : "text-rhozly-on-surface-variant"}`}>
            {state === "unknown" ? "—" : isOn ? "Running" : "Off"}
          </p>
        </div>
        <button
          onClick={fetchState}
          disabled={loading !== null}
          className="p-2 rounded-xl text-rhozly-on-surface-variant hover:text-rhozly-on-surface transition-colors"
          title="Refresh state"
        >
          {loading === "state" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
        </button>
      </div>

      {/* Countdown */}
      {countdown && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-2xl bg-blue-50">
          <Timer size={16} className="text-blue-500" />
          <span className="text-sm font-bold text-blue-700">Auto-off in {countdown}</span>
        </div>
      )}

      {error && (
        <p className="mb-4 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
      )}

      {canActuate ? (
        <>
          {/* Control buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => sendCommand("turn_on")}
              disabled={loading !== null || isOn}
              data-testid="valve-turn-on"
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-colors ${
                isOn
                  ? "bg-blue-500 text-white cursor-default"
                  : "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
              }`}
            >
              {loading === "on" ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
              {isOn ? "Running" : "Turn On"}
            </button>

            <button
              onClick={() => sendCommand("turn_off")}
              // Disabled only when confidently OFF — an "unknown" state must
              // still allow a force-close. The old `!isOn` gate meant a valve
              // whose state read wrong couldn't be turned off without turning
              // it on first (2026-07-15 incident).
              disabled={loading !== null || state === "off"}
              data-testid="valve-turn-off"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm border-2 border-rhozly-outline/20 text-rhozly-on-surface hover:border-red-300 hover:text-red-600 disabled:opacity-40 transition-colors"
            >
              {loading === "off" ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
              Turn Off
            </button>
          </div>

          <p className="text-xs text-rhozly-on-surface-variant text-center mt-3">
            Auto-off after {Math.round(defaultDurationSeconds / 60)} min · Configurable in device settings
          </p>
        </>
      ) : (
        // Read-only: custom valve without a control endpoint, or no control permission.
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-rhozly-surface-low/60">
          <Lock size={14} className="text-rhozly-on-surface-variant mt-0.5 shrink-0" />
          <p className="text-xs text-rhozly-on-surface-variant leading-relaxed">
            {mode === "readonly"
              ? "This valve reports its state but isn't set up for control. Add a control URL in the connect flow to turn it on/off from Rhozly."
              : "You don't have permission to control valves in this home."}
          </p>
        </div>
      )}
    </div>
  );
}
