// Pure presentation helpers for the AI Area Coach panel — extracted so the
// status/label mapping is unit-testable without rendering React.

import type { MetricKey, MetricStatus } from "../services/areaSensorsService";

export function metricLabel(metric: MetricKey): string {
  switch (metric) {
    case "moisture": return "Soil Moisture";
    case "ec": return "EC / Nutrients";
    case "temperature": return "Soil Temperature";
    default: return metric;
  }
}

export interface StatusMeta {
  label: string;
  /** Tailwind classes for the status badge. */
  badgeClass: string;
  /** Tailwind classes for the status dot. */
  dotClass: string;
}

export function statusMeta(status: MetricStatus): StatusMeta {
  switch (status) {
    case "good":
      return { label: "On target", badgeClass: "bg-emerald-100 text-emerald-800", dotClass: "bg-emerald-500" };
    case "low":
      return { label: "Below target", badgeClass: "bg-amber-100 text-amber-800", dotClass: "bg-amber-500" };
    case "high":
      return { label: "Above target", badgeClass: "bg-rose-100 text-rose-800", dotClass: "bg-rose-500" };
    case "unknown":
    default:
      return { label: "No reading", badgeClass: "bg-gray-100 text-gray-600", dotClass: "bg-gray-400" };
  }
}

/**
 * Human "Analysed …" label from an ISO timestamp. Pure (now injectable for
 * tests). Returns "" when no timestamp.
 */
export function formatAnalysedLabel(generatedAt?: string | null, now: number = Date.now()): string {
  if (!generatedAt) return "";
  const then = new Date(generatedAt).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "Analysed just now";
  if (mins < 60) return `Analysed ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Analysed ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Analysed ${days}d ago`;
  return `Analysed on ${new Date(generatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}
