import React, { useEffect, useMemo, useState } from "react";
import { Droplet, Loader2, Power, Timer } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { valveControlMode } from "../../lib/valveControl";
import { usePermissions } from "../../context/HomePermissionsContext";
import type { WalkDevice } from "../../lib/gardenWalk";

// RHO-17 Phase 2 (approved answer 2) — one water-valve row on a Garden
// Walk section card. Shows the derived valve state (running countdown /
// failed / next water / idle) and, when the caller may control valves,
// manual OPEN-with-duration (preset chips + custom minutes) and CLOSE.
//
// Control path is EXACTLY the existing manual one (ValveControlPanel):
//   supabase.functions.invoke(
//     provider === "ewelink" ? "integrations-ewelink-control"
//                            : "integrations-adapter-control",
//     { body: { deviceId, command, durationSeconds } })
// Both functions record the command in `device_commands` with
// `auto_off_at` (the dead-man's-switch countdown) and, for eWeLink,
// pass the countdown to the device so it self-enforces the timer. The
// turn_on response returns `autoOffAt`, which drives the local
// countdown. No new control route is invented here.
//
// Permission gate mirrors IntegrationsPage → DeviceDetailModal:
// `integrations.control` OR `integrations.manage`; provider gating via
// valveControlMode (eWeLink / controllable custom_http; otherwise
// read-only display).

interface Props {
  device: WalkDevice;
}

const PRESET_MINUTES = [5, 10, 15];

type Pending = "open" | "close" | null;

function minutesLeft(untilIso: string): number {
  return Math.max(0, Math.ceil((Date.parse(untilIso) - Date.now()) / 60_000));
}

/** supabase.functions.invoke surfaces non-2xx as a FunctionsHttpError
 *  whose `message` is generic; the real reason lives on `error.context`
 *  as JSON (same extraction as ValveControlPanel). */
async function extractEdgeError(err: unknown, fallback: string): Promise<string> {
  if (!err) return fallback;
  const ctx = (err as { context?: { json?: () => Promise<unknown> } }).context;
  if (ctx?.json) {
    try {
      const body = await ctx.json();
      if (body && typeof body === "object" && "error" in body) {
        const e = (body as { error?: unknown }).error;
        if (typeof e === "string" && e.length > 0) return e;
      }
    } catch {
      /* keep fallback */
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function WalkValveRow({ device }: Props) {
  const { can } = usePermissions();
  const mode = valveControlMode(device.provider ?? "", device.controllable);
  const canActuate =
    (can("integrations.control") || can("integrations.manage")) &&
    mode !== "readonly";

  // Optimistic local state — seeded from the walk-view telemetry, then
  // owned by the row once the user acts.
  const [running, setRunning] = useState(device.valve?.state === "running");
  const [runningUntil, setRunningUntil] = useState<string | null>(
    device.valve?.runningUntil ?? null,
  );
  const [failed, setFailed] = useState(device.valve?.state === "failed");
  const [pending, setPending] = useState<Pending>(null);
  const [durationMin, setDurationMin] = useState<number>(10);
  const [customMin, setCustomMin] = useState("");

  // Countdown tick — flips back to idle when the auto-off lands.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running || !runningUntil) return;
    const id = setInterval(() => {
      if (Date.parse(runningUntil) <= Date.now()) {
        setRunning(false);
        setRunningUntil(null);
      } else {
        setTick((t) => t + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running, runningUntil]);

  const effectiveMinutes = useMemo(() => {
    const custom = Number(customMin);
    if (customMin.trim() !== "" && Number.isFinite(custom) && custom >= 1) {
      return Math.min(240, Math.round(custom));
    }
    return durationMin;
  }, [customMin, durationMin]);

  const sendCommand = async (command: "turn_on" | "turn_off") => {
    setPending(command === "turn_on" ? "open" : "close");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fn =
        device.provider === "ewelink"
          ? "integrations-ewelink-control"
          : "integrations-adapter-control";
      const res = await supabase.functions.invoke(fn, {
        body: {
          deviceId: device.id,
          command,
          durationSeconds: effectiveMinutes * 60,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        throw new Error(await extractEdgeError(res.error, "Command failed"));
      }
      if (res.data?.error) throw new Error(String(res.data.error));
      setFailed(false);
      if (command === "turn_on") {
        setRunning(true);
        setRunningUntil(
          (res.data?.autoOffAt as string | undefined) ??
            new Date(Date.now() + effectiveMinutes * 60_000).toISOString(),
        );
        toast.success(`${device.name} on for ${effectiveMinutes} min`);
      } else {
        setRunning(false);
        setRunningUntil(null);
        toast.success(`${device.name} closed`);
      }
    } catch (err: unknown) {
      Logger.error("WalkValveRow command failed", err, {
        deviceId: device.id,
        command,
      });
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Valve command failed — try again.",
      );
    } finally {
      setPending(null);
    }
  };

  const stateLabel = running
    ? runningUntil
      ? `Watering · ${minutesLeft(runningUntil)} min left`
      : "Watering"
    : failed
    ? "Valve failed — last command didn't reach the device"
    : device.valve?.nextRunAt
    ? `Next water ${new Date(device.valve.nextRunAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "Idle";

  return (
    <div
      data-testid={`walk-valve-row-${device.id}`}
      data-valve-state={running ? "running" : failed ? "failed" : "idle"}
      className="rounded-2xl bg-white border border-rhozly-outline/15 p-3"
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            running ? "bg-blue-100 text-blue-600" : "bg-rhozly-surface-low text-rhozly-on-surface/50"
          }`}
        >
          <Droplet size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-rhozly-on-surface truncate">
            {device.name}
          </p>
          <p
            data-testid={`walk-valve-state-${device.id}`}
            className={`text-[11px] font-bold ${
              running
                ? "text-blue-600"
                : failed
                ? "text-red-600"
                : "text-rhozly-on-surface/50"
            }`}
          >
            {running && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1 align-middle" />
            )}
            {stateLabel}
          </p>
        </div>
        {pending && (
          <span
            data-testid={`walk-valve-pending-${device.id}`}
            className="shrink-0 text-rhozly-on-surface/50"
          >
            <Loader2 className="animate-spin" size={16} />
          </span>
        )}
      </div>

      {canActuate && !running && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {PRESET_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`walk-valve-duration-${m}-${device.id}`}
              onClick={() => {
                setDurationMin(m);
                setCustomMin("");
              }}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-black transition ${
                customMin.trim() === "" && durationMin === m
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-rhozly-outline/15 bg-white text-rhozly-on-surface/60 hover:border-blue-300"
              }`}
            >
              {m} min
            </button>
          ))}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            placeholder="Custom"
            value={customMin}
            onChange={(e) => setCustomMin(e.target.value)}
            data-testid={`walk-valve-custom-${device.id}`}
            className="w-20 px-2 py-1.5 rounded-lg bg-white border border-rhozly-outline/15 text-[11px] font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/35 focus:outline-none focus:border-blue-400"
            aria-label={`Custom minutes for ${device.name}`}
          />
          <button
            type="button"
            data-testid={`walk-valve-open-${device.id}`}
            onClick={() => void sendCommand("turn_on")}
            disabled={pending !== null}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-blue-600 disabled:opacity-50"
          >
            <Power size={12} />
            Open {effectiveMinutes} min
          </button>
        </div>
      )}

      {canActuate && running && (
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700">
            <Timer size={12} />
            Auto-off is armed — the valve closes itself.
          </span>
          <button
            type="button"
            data-testid={`walk-valve-close-${device.id}`}
            onClick={() => void sendCommand("turn_off")}
            disabled={pending !== null}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border-2 border-rhozly-outline/20 text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest hover:border-red-300 hover:text-red-600 disabled:opacity-50"
          >
            <Power size={12} />
            Close now
          </button>
        </div>
      )}

      {!canActuate && (
        <p className="mt-1.5 text-[10px] font-bold text-rhozly-on-surface/40 leading-snug">
          {mode === "readonly"
            ? "This valve reports state only — add a control URL in Integrations to open it from here."
            : "You don't have permission to control valves in this home."}
        </p>
      )}
    </div>
  );
}
