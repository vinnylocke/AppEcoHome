import React from "react";
import { Zap, Wifi, WifiOff } from "lucide-react";
import { IconWatering, IconTemperature } from "../../constants/icons";
import BatteryPip from "./BatteryPip";
import type { Device } from "./IntegrationsPage";

interface Props {
  device: Device;
  onClick: () => void;
}

export default function DeviceCard({ device, onClick }: Props) {
  // Valves don't send periodic readings so last_seen_at goes stale — treat as
  // online whenever the device is linked (external_device_id present).
  const isOnline = device.device_type === "water_valve"
    ? !!device.external_device_id
    : device.last_seen_at
      ? Date.now() - new Date(device.last_seen_at).getTime() < 60 * 60 * 1000
      : false;

  const isSoil = device.device_type === "soil_sensor";

  return (
    <button
      onClick={onClick}
      data-testid={`device-card-${device.id}`}
      className="w-full text-left rounded-3xl bg-rhozly-surface-lowest border border-rhozly-outline/20 shadow-sm p-5 hover:shadow-md hover:border-rhozly-primary/20 transition-all duration-200 group"
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isSoil ? "bg-amber-100" : "bg-blue-100"}`}>
          {isSoil ? (
            <IconTemperature className="text-amber-600" size={20} />
          ) : (
            <IconWatering className="text-blue-600" size={20} />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <BatteryPip percent={device.battery_percent} reportedAt={device.battery_reported_at} showUnknown />
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl ${isOnline ? "bg-green-100 text-green-700" : "bg-rhozly-surface-low text-rhozly-on-surface-variant"}`}>
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isOnline ? "Online" : "Offline"}
          </div>
        </div>
      </div>

      {/* Name */}
      <p className="font-bold text-rhozly-on-surface text-base leading-tight mb-0.5 line-clamp-1 group-hover:text-rhozly-primary transition-colors">
        {device.name}
      </p>
      <p className="text-xs text-rhozly-on-surface-variant capitalize mb-3">
        {device.provider} · {isSoil ? "Soil Sensor" : "Water Valve"}
      </p>

      {/* Last seen */}
      {isSoil ? (
        device.last_seen_at ? (
          <p className="text-xs text-rhozly-on-surface-variant">
            Last reading {timeAgo(device.last_seen_at)}
          </p>
        ) : (
          // 2026-06-16 — clearer copy when the device is new. Ecowitt
          // gateways push every ~16 min and may not have done so yet —
          // tapping Refresh on the Integrations page polls immediately.
          <p className="text-xs text-rhozly-on-surface-variant/60">
            Awaiting first reading — tap Refresh to sync now
          </p>
        )
      ) : (
        <p className="text-xs text-rhozly-on-surface-variant/60">
          {device.last_seen_at ? `Last run ${timeAgo(device.last_seen_at)}` : "No runs yet"}
        </p>
      )}
    </button>
  );
}

function timeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
