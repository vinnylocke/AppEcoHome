import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Droplets, Power, RotateCcw, Timer, Loader2 } from "lucide-react";

interface Props {
  deviceId: string;
  homeId: string;
  defaultDurationSeconds: number;
}

type ValveState = "on" | "off" | "unknown";

export default function ValveControlPanel({ deviceId, homeId, defaultDurationSeconds }: Props) {
  const [state, setState] = useState<ValveState>("unknown");
  const [autoOffAt, setAutoOffAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [loading, setLoading] = useState<"on" | "off" | "state" | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const fetchState = async () => {
    setLoading("state");
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("integrations-ewelink-state", {
        body: { deviceId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      setState(res.data.state as ValveState);
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
      const res = await supabase.functions.invoke("integrations-ewelink-control", {
        body: { deviceId, command, durationSeconds: defaultDurationSeconds },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
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
    <div className="rounded-3xl border border-rhozly-outline/20 bg-rhozly-surface-lowest p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isOn ? "bg-blue-100" : "bg-rhozly-surface-low"}`}>
          <Droplets className={isOn ? "text-blue-600" : "text-rhozly-on-surface-variant"} size={20} />
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
          disabled={loading !== null || !isOn}
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
    </div>
  );
}
