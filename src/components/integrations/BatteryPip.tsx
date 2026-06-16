import React from "react";
import { Battery, BatteryLow, BatteryWarning } from "lucide-react";

interface Props {
  percent: number | null;
  reportedAt: string | null;
  size?: "sm" | "md";
  /**
   * When true, render a muted "Battery —" placeholder if `percent` is
   * null instead of returning null. Useful on cards + headers where we
   * want users to know battery info exists for that device family,
   * even before the first reading lands.
   *
   * 2026-06-16 — flipped to true at every call site so the pip is
   * always discoverable.
   */
  showUnknown?: boolean;
}

/**
 * Small battery health chip. Colour-graded: green ≥50, amber 20-49,
 * red <20. When `showUnknown` is set and no battery has been reported
 * yet, renders a muted "Battery —" placeholder so users can tell the
 * feature is wired but waiting (vs. hidden entirely, which used to
 * look identical to "not battery-aware").
 */
export default function BatteryPip({ percent, reportedAt, size = "sm", showUnknown = false }: Props) {
  const px = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  const iconSize = size === "md" ? 12 : 10;

  if (percent === null || percent === undefined) {
    if (!showUnknown) return null;
    return (
      <span
        title="No battery reading received yet — try Refresh, or check that this device exposes a battery field."
        data-testid="battery-pip-unknown"
        className={`inline-flex items-center gap-1 font-semibold rounded-xl bg-rhozly-surface-low text-rhozly-on-surface-variant/80 ${px}`}
      >
        <Battery size={iconSize} />
        Battery —
      </span>
    );
  }

  const colour = percent < 20
    ? "bg-red-100 text-red-700"
    : percent < 50
      ? "bg-amber-100 text-amber-700"
      : "bg-green-100 text-green-700";

  const Icon = percent < 20 ? BatteryWarning : percent < 50 ? BatteryLow : Battery;

  const title = reportedAt
    ? `Battery ${percent}% — last reported ${new Date(reportedAt).toLocaleString()}`
    : `Battery ${percent}%`;

  return (
    <span
      title={title}
      data-testid="battery-pip"
      className={`inline-flex items-center gap-1 font-semibold rounded-xl ${colour} ${px}`}
    >
      <Icon size={iconSize} />
      {percent}%
    </span>
  );
}
