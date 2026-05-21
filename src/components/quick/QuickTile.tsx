import React from "react";
import { ChevronRight, Clock } from "lucide-react";

/**
 * Accent keys. The legacy three (`primary | tertiary | container`) drive the
 * subtle row-card look. The four launcher accents
 * (`forest | amber | rose | indigo`) drive the new solid-coloured compact
 * tile look — one signature colour per Quick Access shortcut.
 */
export type QuickTileAccent =
  | "primary"
  | "tertiary"
  | "container"
  | "forest"
  | "amber"
  | "rose"
  | "indigo";

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
   * Colour accent. See `QuickTileAccent`.
   */
  accent?: QuickTileAccent;
  /**
   * Layout — `row` is the original wide tile (icon left, text right, chevron).
   * `compact` is the launcher-style tile for the 2×2 grid on Quick Access:
   * a solid coloured background, big white icon and bold white title.
   * Description is consumed for the aria-label only.
   */
  layout?: "row" | "compact";
  onClick: () => void;
}

interface RowAccentTokens {
  iconBg: string;
  iconHoverBg: string;
  iconText: string;
  chevronHover: string;
  topGlow: string;
  hoverBorder: string;
}

/**
 * Subtle row-card accents — only the legacy three. The new solid accents
 * (forest/amber/rose/indigo) are only used by compact tiles and live in
 * `SOLID_TILE_MAP` below.
 */
const ROW_ACCENT_MAP: Record<"primary" | "tertiary" | "container", RowAccentTokens> = {
  primary: {
    iconBg: "bg-rhozly-primary/12",
    iconHoverBg: "group-hover:bg-rhozly-primary/18",
    iconText: "text-rhozly-primary",
    chevronHover: "group-hover:text-rhozly-primary",
    topGlow: "from-rhozly-primary/10 via-rhozly-primary/[0.03]",
    hoverBorder: "group-hover:border-rhozly-primary/40",
  },
  tertiary: {
    iconBg: "bg-rhozly-tertiary",
    iconHoverBg: "group-hover:brightness-95",
    iconText: "text-amber-800",
    chevronHover: "group-hover:text-amber-700",
    topGlow: "from-rhozly-tertiary/60 via-rhozly-tertiary/15",
    hoverBorder: "group-hover:border-amber-300",
  },
  container: {
    iconBg: "bg-rhozly-primary-container/15",
    iconHoverBg: "group-hover:bg-rhozly-primary-container/22",
    iconText: "text-rhozly-primary-container",
    chevronHover: "group-hover:text-rhozly-primary-container",
    topGlow: "from-rhozly-primary-container/12 via-rhozly-primary-container/[0.04]",
    hoverBorder: "group-hover:border-rhozly-primary-container/40",
  },
};

interface SolidTileTokens {
  /** Solid background — the launcher tile's signature colour. */
  bg: string;
  /** Subtle darker overlay used for the active / pressed state ring. */
  ring: string;
  /** Decorative "depth" gradient layered on top of the solid bg. */
  glow: string;
  /** Decorative corner blob colour (faint white-tinted highlight). */
  blob: string;
  /** Coloured shadow under the tile so it floats off the page. */
  shadow: string;
}

/**
 * Solid launcher-tile palette. Four distinct signature colours so the four
 * tiles read clearly even at a glance:
 *   - forest → Rhozly brand green (Visual Lens — camera + AI).
 *   - amber  → warm sun           (Today — daily plan + rain forecast).
 *   - rose   → notebook accent    (Quick Capture — journal entries).
 *   - indigo → knowledge          (The Library — plant database).
 */
const SOLID_TILE_MAP: Record<"forest" | "amber" | "rose" | "indigo" | "primary" | "tertiary" | "container", SolidTileTokens> = {
  forest: {
    bg: "bg-rhozly-primary",
    ring: "ring-rhozly-primary/40",
    glow: "from-white/20 to-transparent",
    blob: "bg-white/10",
    shadow: "shadow-[0_8px_22px_-8px_rgba(7,87,55,0.55)]",
  },
  amber: {
    bg: "bg-amber-500",
    ring: "ring-amber-400/50",
    glow: "from-white/25 to-transparent",
    blob: "bg-white/15",
    shadow: "shadow-[0_8px_22px_-8px_rgba(245,158,11,0.50)]",
  },
  rose: {
    bg: "bg-rose-500",
    ring: "ring-rose-400/50",
    glow: "from-white/25 to-transparent",
    blob: "bg-white/15",
    shadow: "shadow-[0_8px_22px_-8px_rgba(244,63,94,0.50)]",
  },
  indigo: {
    bg: "bg-indigo-600",
    ring: "ring-indigo-400/50",
    glow: "from-white/25 to-transparent",
    blob: "bg-white/12",
    shadow: "shadow-[0_8px_22px_-8px_rgba(79,70,229,0.55)]",
  },
  // Legacy accents — map them onto the closest solid tone so older call sites
  // that pass `accent="primary"` still render a coloured launcher tile.
  primary:   { bg: "bg-rhozly-primary",            ring: "ring-rhozly-primary/40",            glow: "from-white/20 to-transparent", blob: "bg-white/10",  shadow: "shadow-[0_8px_22px_-8px_rgba(7,87,55,0.55)]" },
  tertiary:  { bg: "bg-amber-500",                 ring: "ring-amber-400/50",                 glow: "from-white/25 to-transparent", blob: "bg-white/15",  shadow: "shadow-[0_8px_22px_-8px_rgba(245,158,11,0.50)]" },
  container: { bg: "bg-rhozly-primary-container",  ring: "ring-rhozly-primary-container/40",  glow: "from-white/20 to-transparent", blob: "bg-white/12",  shadow: "shadow-[0_8px_22px_-8px_rgba(42,112,77,0.50)]" },
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

  // ────────────────────────────────────────────────────────────────────────
  // COMPACT (launcher) tile — solid coloured background, big white icon,
  // bold white title. Used only on the Quick Access 2×2 grid.
  // ────────────────────────────────────────────────────────────────────────
  if (isCompact) {
    const solid = SOLID_TILE_MAP[accent] ?? SOLID_TILE_MAP.forest;
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        data-accent={isLive ? accent : "disabled"}
        data-layout={layout}
        aria-label={`${title} — ${description}`}
        className={`group relative w-full h-full rounded-3xl text-left overflow-hidden transition-all duration-200 active:scale-[0.97] ${
          isLive
            ? `${solid.bg} ${solid.shadow} hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 ${solid.ring}`
            : "bg-rhozly-surface-low/70 opacity-70"
        }`}
      >
        {/* Soft top-edge highlight — gives the solid tile a hint of depth. */}
        {isLive && (
          <span
            aria-hidden
            data-testid={`${testId}-glow`}
            className={`pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b ${solid.glow}`}
          />
        )}

        {/* Decorative corner blob — a faint white circle drifting off the
            top-right edge. Adds visual interest without being noisy. */}
        {isLive && (
          <span
            aria-hidden
            className={`pointer-events-none absolute -top-8 -right-8 w-28 h-28 rounded-full ${solid.blob} blur-md`}
          />
        )}

        {/* Inner content — icon top, title bottom. h-full flex column with
            justify-between so the title pins to the bottom regardless of
            tile aspect ratio. */}
        <div className="relative h-full flex flex-col p-4 sm:p-5">
          <div
            className={`shrink-0 ${
              isLive ? "text-white" : "text-rhozly-on-surface/40"
            }`}
            aria-hidden
          >
            {/* The caller passes the icon at a moderate size; scale it up
                here for the launcher look — keeps each call site simple. */}
            <div className="[&>svg]:w-9 [&>svg]:h-9 sm:[&>svg]:w-10 sm:[&>svg]:h-10">
              {icon}
            </div>
          </div>

          <div className="mt-auto flex items-center gap-1.5 flex-wrap">
            <h2
              className={`font-display font-black tracking-tight text-base sm:text-lg leading-tight ${
                isLive ? "text-white" : "text-rhozly-on-surface/60"
              }`}
            >
              {title}
            </h2>
            {!isLive && (
              <span
                data-testid={`${testId}-coming-soon`}
                className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest"
              >
                <Clock size={9} />
                Soon
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // ROW (wide white card) — original layout, untouched. Kept for any future
  // surface that wants the icon+text+chevron look.
  // ────────────────────────────────────────────────────────────────────────
  // Row layout only supports the three legacy accents — fall back to primary
  // if the caller passes a launcher accent here.
  const rowAccentKey: "primary" | "tertiary" | "container" =
    accent === "tertiary" || accent === "container" ? accent : "primary";
  const a = ROW_ACCENT_MAP[rowAccentKey];

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-accent={isLive ? rowAccentKey : "disabled"}
      data-layout={layout}
      className={`group relative w-full flex items-center gap-4 p-5 min-h-[120px] rounded-3xl border text-left overflow-hidden transition-all duration-200 active:scale-[0.99] ${
        isLive
          ? `bg-white border-rhozly-primary/15 shadow-[0_2px_8px_-2px_rgba(7,87,55,0.08),0_8px_24px_-12px_rgba(7,87,55,0.06)] hover:shadow-[0_4px_12px_-2px_rgba(7,87,55,0.12),0_16px_32px_-16px_rgba(7,87,55,0.10)] ${a.hoverBorder} hover:-translate-y-0.5`
          : "bg-rhozly-surface-low/60 border-rhozly-primary/10 opacity-70 hover:opacity-90"
      }`}
    >
      {isLive && (
        <span
          aria-hidden
          data-testid={`${testId}-glow`}
          className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${a.topGlow} to-transparent`}
        />
      )}

      <div
        className={`relative shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center transition-colors duration-200 ${
          isLive
            ? `${a.iconBg} ${a.iconText} ${a.iconHoverBg}`
            : "bg-rhozly-on-surface/5 text-rhozly-on-surface/40"
        }`}
      >
        {icon}
      </div>

      <div className="relative flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h2
            className={`font-display font-black text-base sm:text-lg tracking-tight ${
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
          className={`text-sm leading-snug ${
            isLive ? "text-rhozly-on-surface/65" : "text-rhozly-on-surface/45"
          }`}
        >
          {description}
        </p>
      </div>

      {isLive && (
        <ChevronRight
          size={20}
          className={`relative shrink-0 text-rhozly-on-surface/25 transition-colors ${a.chevronHover}`}
        />
      )}
    </button>
  );
}
