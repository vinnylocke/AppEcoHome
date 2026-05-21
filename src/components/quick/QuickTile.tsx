import React from "react";
import { ChevronRight, Clock } from "lucide-react";

export type QuickTileAccent = "primary" | "tertiary" | "container";

interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  testId: string;
  /**
   * Live tile → renders as a tappable button. Disabled tile → renders as a
   * subdued tile with a "Coming soon" badge; tap fires `onClick` so the
   * parent can show a toast pointing the user to the existing equivalent.
   */
  variant?: "live" | "coming-soon";
  /**
   * Colour accent that telegraphs the tile's purpose. Stays inside the
   * Rhozly theme palette:
   *   - primary   → deep forest green (Visual Lens / vision + AI)
   *   - tertiary  → peachy warm tone   (Today / sunlit, plan-of-day)
   *   - container → softer green       (Quick Capture / notebook, organic)
   */
  accent?: QuickTileAccent;
  /**
   * Layout — `row` is the original wide tile (icon left, text right, chevron).
   * `compact` is a square-ish stacked variant for the 2×2 grid on Quick Access:
   * icon on top, title + short description below, no chevron.
   */
  layout?: "row" | "compact";
  onClick: () => void;
}

interface AccentTokens {
  iconBg: string;
  iconHoverBg: string;
  iconText: string;
  chevronHover: string;
  topGlow: string;
  hoverBorder: string;
}

const ACCENT_MAP: Record<QuickTileAccent, AccentTokens> = {
  primary: {
    iconBg: "bg-rhozly-primary/12",
    iconHoverBg: "group-hover:bg-rhozly-primary/18",
    iconText: "text-rhozly-primary",
    chevronHover: "group-hover:text-rhozly-primary",
    topGlow: "from-rhozly-primary/10 via-rhozly-primary/[0.03]",
    hoverBorder: "group-hover:border-rhozly-primary/40",
  },
  tertiary: {
    // tertiary = #ffdad8 (peachy). Pair with warm amber text for contrast.
    iconBg: "bg-rhozly-tertiary",
    iconHoverBg: "group-hover:brightness-95",
    iconText: "text-amber-800",
    chevronHover: "group-hover:text-amber-700",
    topGlow: "from-rhozly-tertiary/60 via-rhozly-tertiary/15",
    hoverBorder: "group-hover:border-amber-300",
  },
  container: {
    // primary-container = #2a704d (lighter forest green).
    iconBg: "bg-rhozly-primary-container/15",
    iconHoverBg: "group-hover:bg-rhozly-primary-container/22",
    iconText: "text-rhozly-primary-container",
    chevronHover: "group-hover:text-rhozly-primary-container",
    topGlow: "from-rhozly-primary-container/12 via-rhozly-primary-container/[0.04]",
    hoverBorder: "group-hover:border-rhozly-primary-container/40",
  },
};

export default function QuickTile({
  icon,
  title,
  description,
  testId,
  variant = "live",
  accent = "primary",
  layout = "row",
  onClick,
}: Props) {
  const isLive = variant === "live";
  const isCompact = layout === "compact";
  const a = ACCENT_MAP[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-accent={isLive ? accent : "disabled"}
      data-layout={layout}
      className={`group relative w-full rounded-3xl border text-left overflow-hidden transition-all duration-200 active:scale-[0.99] ${
        isCompact
          ? "flex flex-col items-start gap-2 p-4 h-full"
          : "flex items-center gap-4 p-5 min-h-[120px]"
      } ${
        isLive
          ? `bg-white border-rhozly-primary/15 shadow-[0_2px_8px_-2px_rgba(7,87,55,0.08),0_8px_24px_-12px_rgba(7,87,55,0.06)] hover:shadow-[0_4px_12px_-2px_rgba(7,87,55,0.12),0_16px_32px_-16px_rgba(7,87,55,0.10)] ${a.hoverBorder} hover:-translate-y-0.5`
          : "bg-rhozly-surface-low/60 border-rhozly-primary/10 opacity-70 hover:opacity-90"
      }`}
    >
      {/* Top-edge accent highlight — subtle gradient that hints at the tile's
          accent without overpowering the white card. */}
      {isLive && (
        <span
          aria-hidden
          data-testid={`${testId}-glow`}
          className={`pointer-events-none absolute inset-x-0 top-0 ${isCompact ? "h-12" : "h-16"} bg-gradient-to-b ${a.topGlow} to-transparent`}
        />
      )}

      <div
        className={`relative shrink-0 rounded-2xl flex items-center justify-center transition-colors duration-200 ${
          isCompact ? "w-11 h-11" : "w-14 h-14"
        } ${
          isLive
            ? `${a.iconBg} ${a.iconText} ${a.iconHoverBg}`
            : "bg-rhozly-on-surface/5 text-rhozly-on-surface/40"
        }`}
      >
        {icon}
      </div>

      <div className={`relative min-w-0 ${isCompact ? "w-full" : "flex-1"}`}>
        <div className="flex items-center gap-2 mb-1">
          <h2
            className={`font-display font-black tracking-tight ${
              isCompact ? "text-base" : "text-base sm:text-lg"
            } ${
              isLive ? "text-rhozly-on-surface" : "text-rhozly-on-surface/60"
            }`}
          >
            {title}
          </h2>
          {!isLive && (
            <span
              data-testid={`${testId}-coming-soon`}
              className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
            >
              <Clock size={10} />
              Coming soon
            </span>
          )}
        </div>
        <p
          className={`leading-snug ${
            isCompact ? "text-[11px] line-clamp-2" : "text-sm"
          } ${
            isLive ? "text-rhozly-on-surface/65" : "text-rhozly-on-surface/45"
          }`}
        >
          {description}
        </p>
      </div>

      {isLive && !isCompact && (
        <ChevronRight
          size={20}
          className={`relative shrink-0 text-rhozly-on-surface/25 transition-colors ${a.chevronHover}`}
        />
      )}
    </button>
  );
}
