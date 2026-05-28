import React from "react";
import { Loader2 } from "lucide-react";

interface Props {
  /** Which skeleton layout to render. */
  shape: "card-grid" | "list" | "form" | "stats-strip" | "detail-page" | "spinner";
  /** Number of skeleton items to render where shape is repeatable. Default 3 for grid, 5 for list. */
  count?: number;
  /** Optional explanatory text for the spinner shape. */
  label?: string;
  /** Optional className appended to the root. */
  className?: string;
  /** Optional test id. */
  "data-testid"?: string;
}

/**
 * Shared skeleton-loading component. Renders a layout that matches
 * the surface's actual shape so the user sees structural feedback
 * (not just a bare spinner).
 *
 * Shapes:
 *   • card-grid — 1-col mobile, 3-col desktop grid of plant-card-shaped skeletons.
 *   • list — vertical list of row-shaped skeletons.
 *   • form — labels + inputs.
 *   • stats-strip — horizontal row of stat-card skeletons.
 *   • detail-page — hero image + title block + content rows.
 *   • spinner — centred Loader2 with optional label (escape hatch).
 *
 * All skeletons use Tailwind's animate-pulse + design-token bgs so
 * they look native to the app.
 */
export default function SurfaceLoader({
  shape,
  count,
  label,
  className = "",
  "data-testid": testId,
}: Props) {
  if (shape === "spinner") {
    return (
      <div
        data-testid={testId ?? "surface-loader-spinner"}
        role="status"
        aria-live="polite"
        className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`}
      >
        <Loader2 size={22} className="animate-spin text-rhozly-primary" />
        {label && (
          <p className="text-xs font-bold text-rhozly-on-surface/55">{label}</p>
        )}
      </div>
    );
  }

  if (shape === "card-grid") {
    const n = count ?? 3;
    return (
      <div
        data-testid={testId ?? "surface-loader-card-grid"}
        role="status"
        aria-busy="true"
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}
      >
        {Array.from({ length: n }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (shape === "list") {
    const n = count ?? 5;
    return (
      <div
        data-testid={testId ?? "surface-loader-list"}
        role="status"
        aria-busy="true"
        className={`flex flex-col gap-2 ${className}`}
      >
        {Array.from({ length: n }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (shape === "form") {
    return (
      <div
        data-testid={testId ?? "surface-loader-form"}
        role="status"
        aria-busy="true"
        className={`flex flex-col gap-5 ${className}`}
      >
        {Array.from({ length: count ?? 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 bg-rhozly-surface-low rounded-full animate-pulse" />
            <div className="h-12 w-full bg-rhozly-surface-low rounded-2xl animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (shape === "stats-strip") {
    const n = count ?? 4;
    return (
      <div
        data-testid={testId ?? "surface-loader-stats-strip"}
        role="status"
        aria-busy="true"
        className={`grid grid-cols-2 sm:grid-cols-${Math.min(n, 4)} gap-3 ${className}`}
      >
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className="h-20 rounded-2xl bg-rhozly-surface-low animate-pulse"
          />
        ))}
      </div>
    );
  }

  // detail-page
  return (
    <div
      data-testid={testId ?? "surface-loader-detail-page"}
      role="status"
      aria-busy="true"
      className={`space-y-6 ${className}`}
    >
      {/* Hero */}
      <div className="h-56 sm:h-64 w-full rounded-3xl bg-rhozly-surface-low animate-pulse" />
      {/* Title block */}
      <div className="space-y-3">
        <div className="h-6 w-2/3 bg-rhozly-surface-low rounded-full animate-pulse" />
        <div className="h-3 w-full bg-rhozly-surface-low rounded-full animate-pulse" />
        <div className="h-3 w-5/6 bg-rhozly-surface-low rounded-full animate-pulse" />
      </div>
      {/* Content sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: count ?? 4 }, (_, i) => (
          <div key={i} className="h-40 rounded-3xl bg-rhozly-surface-low animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-[2.5rem] border border-rhozly-outline/10 overflow-hidden animate-pulse">
      <div className="h-40 bg-rhozly-surface-low" />
      <div className="p-6 space-y-3">
        <div className="h-6 w-2/3 bg-rhozly-surface-low rounded-full" />
        <div className="h-3 w-full bg-rhozly-surface-low rounded-full" />
        <div className="h-3 w-4/5 bg-rhozly-surface-low rounded-full" />
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="rounded-2xl border border-rhozly-outline/15 bg-white p-3 flex items-center gap-3 animate-pulse">
      <div className="shrink-0 w-12 h-12 rounded-xl bg-rhozly-surface-low" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 bg-rhozly-surface-low rounded-full" />
        <div className="h-2.5 w-2/3 bg-rhozly-surface-low rounded-full" />
      </div>
    </div>
  );
}
