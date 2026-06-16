import React from "react";
import { Battery, BatteryLow, BatteryWarning } from "lucide-react";

interface Props {
  percent: number | null;
  reportedAt: string | null;
  size?: "sm" | "md";
}

/**
 * Small battery health chip. Hidden when no battery_percent has ever
 * been reported (most providers don't report it; the device might
 * even be mains-powered).
 *
 * Colour-graded — green ≥50, amber 20–49, red <20. The pip stays
 * green/amber/red whatever the last reading was; staleness is shown
 * via the title attribute (hover) rather than another colour state,
 * to keep the component readable at a glance.
 */
export default function BatteryPip({ percent, reportedAt, size = "sm" }: Props) {
  if (percent === null || percent === undefined) return null;

  const colour = percent < 20
    ? "bg-red-100 text-red-700"
    : percent < 50
      ? "bg-amber-100 text-amber-700"
      : "bg-green-100 text-green-700";

  const Icon = percent < 20 ? BatteryWarning : percent < 50 ? BatteryLow : Battery;
  const px = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  const iconSize = size === "md" ? 12 : 10;

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
