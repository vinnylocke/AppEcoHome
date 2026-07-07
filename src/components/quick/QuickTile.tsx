import React from "react";
import { ChevronRight } from "lucide-react";

/**
 * Accent keys.
 *
 * Legacy three (`primary | tertiary | container`) drive the wide
 * row-card look (still in use anywhere a thick white card is wanted).
 *
 * The four launcher accents (`green | amber | red | blue`) drive the
 * compact 2×2 launcher tiles on Quick Access. They map onto colours
 * already used elsewhere in the app — green = brand (also leaves /
 * growth / Verdantly), amber = warm states / sunlight, red = urgent /
 * notebook accent, blue = sky / lux / info.
 */
export type QuickTileAccent =
  | "primary"
  | "tertiary"
  | "container"
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "purple"
  | "teal"
  | "slate";

interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  testId: string;
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
  /**
   * Dense compact tiles hide the description text — used by the
   * Quick Access launcher when four tiles share one row on a phone.
   * Description is still passed to `aria-label` for screen readers.
   */
  dense?: boolean;
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

interface SoftTileTokens {
  /** Light tinted background (the visible tile surface). */
  bg: string;
  /** Soft tinted border so the tile reads as a card even on a light page. */
  border: string;
  /** Hover border — slightly stronger tint. */
  hoverBorder: string;
  /** Icon container background — a hair stronger than the tile bg. */
  iconBg: string;
  /** Icon glyph colour (the lucide stroke). */
  iconText: string;
  /** Title colour (bold). */
  titleText: string;
  /** Description colour (muted). */
  descText: string;
  /** Focus ring colour. */
  ring: string;
}

/**
 * Soft launcher-tile palette (Wave 13). Lighter, more see-through than
 * the saturated solid tiles of Wave 12 — readable at a glance but blends
 * with the app's existing chip palette instead of standing apart.
 *
 *   green  → Visual Lens   (Rhozly brand green — camera + AI).
 *   amber  → Today          (warm sun, daily plan).
 *   red    → Quick Capture (notebook accent, snap-and-capture).
 *   blue   → The Library    (sky / lookup / depth).
 */
const SOFT_TILE_MAP: Record<
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "purple"
  | "teal"
  | "slate"
  | "primary"
  | "tertiary"
  | "container",
  SoftTileTokens
> = {
  green: {
    bg: "bg-rhozly-primary/10",
    border: "border-rhozly-primary/20",
    hoverBorder: "hover:border-rhozly-primary/40",
    iconBg: "bg-rhozly-primary/15",
    iconText: "text-rhozly-primary",
    titleText: "text-rhozly-on-surface",
    descText: "text-rhozly-on-surface/55",
    ring: "ring-rhozly-primary/30",
  },
  amber: {
    bg: "bg-amber-100",
    border: "border-amber-200",
    hoverBorder: "hover:border-amber-300",
    iconBg: "bg-amber-200/70",
    iconText: "text-amber-700",
    titleText: "text-amber-950",
    descText: "text-amber-900/65",
    ring: "ring-amber-300",
  },
  red: {
    bg: "bg-rose-100",
    border: "border-rose-200",
    hoverBorder: "hover:border-rose-300",
    iconBg: "bg-rose-200/70",
    iconText: "text-rose-700",
    titleText: "text-rose-950",
    descText: "text-rose-900/65",
    ring: "ring-rose-300",
  },
  blue: {
    bg: "bg-sky-100",
    border: "border-sky-200",
    hoverBorder: "hover:border-sky-300",
    iconBg: "bg-sky-200/70",
    iconText: "text-sky-700",
    titleText: "text-sky-950",
    descText: "text-sky-900/65",
    ring: "ring-sky-300",
  },
  purple: {
    bg: "bg-violet-100",
    border: "border-violet-200",
    hoverBorder: "hover:border-violet-300",
    iconBg: "bg-violet-200/70",
    iconText: "text-violet-700",
    titleText: "text-violet-950",
    descText: "text-violet-900/65",
    ring: "ring-violet-300",
  },
  teal: {
    bg: "bg-teal-100",
    border: "border-teal-200",
    hoverBorder: "hover:border-teal-300",
    iconBg: "bg-teal-200/70",
    iconText: "text-teal-700",
    titleText: "text-teal-950",
    descText: "text-teal-900/65",
    ring: "ring-teal-300",
  },
  slate: {
    bg: "bg-slate-100",
    border: "border-slate-200",
    hoverBorder: "hover:border-slate-300",
    iconBg: "bg-slate-200/70",
    iconText: "text-slate-700",
    titleText: "text-slate-950",
    descText: "text-slate-900/65",
    ring: "ring-slate-300",
  },
  // Legacy accents — map onto the closest soft tone.
  primary:   { bg: "bg-rhozly-primary/10",          border: "border-rhozly-primary/20",          hoverBorder: "hover:border-rhozly-primary/40",          iconBg: "bg-rhozly-primary/15",          iconText: "text-rhozly-primary",          titleText: "text-rhozly-on-surface", descText: "text-rhozly-on-surface/55", ring: "ring-rhozly-primary/30" },
  tertiary:  { bg: "bg-amber-100",                   border: "border-amber-200",                   hoverBorder: "hover:border-amber-300",                   iconBg: "bg-amber-200/70",                iconText: "text-amber-700",                titleText: "text-amber-950",          descText: "text-amber-900/65",          ring: "ring-amber-300" },
  container: { bg: "bg-rhozly-primary-container/10", border: "border-rhozly-primary-container/20", hoverBorder: "hover:border-rhozly-primary-container/40", iconBg: "bg-rhozly-primary-container/15", iconText: "text-rhozly-primary-container", titleText: "text-rhozly-on-surface", descText: "text-rhozly-on-surface/55", ring: "ring-rhozly-primary-container/30" },
};

export default function QuickTile({
  icon,
  title,
  description,
  testId,
  accent = "primary",
  layout = "row",
  dense = false,
  onClick,
}: Props) {
  const isCompact = layout === "compact";

  // ────────────────────────────────────────────────────────────────────────
  // COMPACT (launcher) tile — light tinted background, coloured icon
  // medallion, bold title and short description. Used only on the Quick
  // Access 2×2 grid.
  // ────────────────────────────────────────────────────────────────────────
  if (isCompact) {
    const soft = SOFT_TILE_MAP[accent] ?? SOFT_TILE_MAP.green;
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        data-accent={accent}
        data-layout={layout}
        aria-label={`${title} — ${description}`}
        className={`group relative w-full h-full rounded-2xl text-left transition-all duration-200 active:scale-[0.98] border ${soft.bg} ${soft.border} ${soft.hoverBorder} hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 ${soft.ring}`}
      >
        <div className={`h-full flex flex-col ${dense ? "p-2 gap-1 items-center text-center" : "p-3 gap-1.5"}`}>
          {/* Icon medallion — small coloured square holding the lucide
              glyph. Cleaner than a "naked" icon on a tinted background. */}
          <div
            className={`shrink-0 inline-flex items-center justify-center rounded-xl ${
              dense ? "w-8 h-8" : "w-9 h-9"
            } ${soft.iconBg} ${soft.iconText}`}
            aria-hidden
          >
            <div className={dense ? "[&>svg]:w-4 [&>svg]:h-4" : "[&>svg]:w-5 [&>svg]:h-5"}>
              {icon}
            </div>
          </div>

          <div className={`flex items-center gap-1 flex-wrap ${dense ? "" : "mt-0.5"}`}>
            <h2
              className={`font-display font-black tracking-tight leading-tight ${
                dense ? "text-[11px]" : "text-sm"
              } ${soft.titleText}`}
            >
              {title}
            </h2>
          </div>

          {!dense && (
            <p className={`text-[11px] leading-snug line-clamp-2 ${soft.descText}`}>
              {description}
            </p>
          )}
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
      data-accent={rowAccentKey}
      data-layout={layout}
      className={`group relative w-full flex items-center gap-4 p-5 min-h-[120px] rounded-3xl border text-left overflow-hidden transition-all duration-200 active:scale-[0.99] bg-white border-rhozly-primary/15 shadow-[0_2px_8px_-2px_rgba(7,87,55,0.08),0_8px_24px_-12px_rgba(7,87,55,0.06)] hover:shadow-[0_4px_12px_-2px_rgba(7,87,55,0.12),0_16px_32px_-16px_rgba(7,87,55,0.10)] ${a.hoverBorder} hover:-translate-y-0.5`}
    >
      <span
        aria-hidden
        data-testid={`${testId}-glow`}
        className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${a.topGlow} to-transparent`}
      />

      <div
        className={`relative shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center transition-colors duration-200 ${a.iconBg} ${a.iconText} ${a.iconHoverBg}`}
      >
        {icon}
      </div>

      <div className="relative flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-display font-black text-base sm:text-lg tracking-tight text-rhozly-on-surface">
            {title}
          </h2>
        </div>
        <p className="text-sm leading-snug text-rhozly-on-surface/65">
          {description}
        </p>
      </div>

      <ChevronRight
        size={20}
        className={`relative shrink-0 text-rhozly-on-surface/25 transition-colors ${a.chevronHover}`}
      />
    </button>
  );
}
