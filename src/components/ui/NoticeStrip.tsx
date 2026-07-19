import React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export type NoticeTone = "info" | "success" | "warning" | "caution" | "danger" | "neutral";

export interface NoticeStripProps {
  /** Functional colour of the strip; defaults to the quiet neutral surface. */
  tone?: NoticeTone;
  /** Leading icon (a lucide icon, sized by the caller). */
  icon?: React.ReactNode;
  /** The message body. */
  children: React.ReactNode;
  /** Optional trailing action (e.g. a "Sync now" or "Update" button). */
  action?: React.ReactNode;
  /** When provided, renders a trailing dismiss (X) button that calls this. */
  onDismiss?: () => void;
  className?: string;
  "data-testid"?: string;
}

const TONE_CLASSES: Record<NoticeTone, string> = {
  info: "bg-status-water-fill border-status-water-line text-status-water-ink",
  success: "bg-status-success-fill border-status-success-line text-status-success-ink",
  warning: "bg-status-weather-fill border-status-weather-line text-status-weather-ink",
  caution: "bg-status-caution-fill border-status-caution-line text-status-caution-ink",
  danger: "bg-status-danger-fill border-status-danger-line text-status-danger-ink",
  neutral: "bg-rhozly-surface-low border-rhozly-outline/15 text-rhozly-on-surface-variant",
};

/**
 * The house inline notice strip — the shared primitive behind the
 * Offline / WeatherAlert / Update / BetaFeedback banner family.
 *
 * Anatomy: icon + message + optional trailing action + optional dismiss.
 * Tones map to the brand functional-colour recipe (`status-*` fill/line/ink
 * families); high-contrast mode only lifts `rhozly-*` utilities, which is
 * exactly why banners must use these token classes rather than raw
 * `amber-100` and friends. `danger` announces as `role="alert"`; every other
 * tone is a polite `role="status"`.
 */
export const NoticeStrip = React.forwardRef<HTMLDivElement, NoticeStripProps>(function NoticeStrip(
  { tone = "neutral", icon, children, action, onDismiss, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? undefined : "polite"}
      className={cn(
        "flex items-start gap-2.5 rounded-control border px-4 py-3 text-sm font-semibold animate-in fade-in slide-in-from-top-2",
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {icon && (
        <span aria-hidden className="shrink-0 mt-0.5">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">{children}</div>
      {action}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 -m-1 p-1.5 rounded-full opacity-60 can-hover:hover:opacity-100 active:scale-95 transition-opacity pointer-coarse:min-h-11 pointer-coarse:min-w-11 inline-flex items-center justify-center"
        >
          <X aria-hidden className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});
