import React from "react";

interface CtaConfig {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  "data-testid"?: string;
}

interface Props {
  /** Lucide icon (or any React node) shown in the soft circular badge. */
  icon: React.ReactNode;
  /** Single-line headline. font-black. */
  title: string;
  /** 1–2 sentences explaining the empty state + next step. */
  body?: React.ReactNode;
  /** Primary action — solid green button. */
  primaryCta?: CtaConfig;
  /** Secondary action — text link below the primary. */
  secondaryCta?: CtaConfig;
  /** Visual size. sm = inline tab/section. md = card-sized (default). lg = full-page hero. */
  size?: "sm" | "md" | "lg";
  /** When "none", drops the dashed border + low-saturation bg so the
   *  parent surface can own its own chrome. Default "card". */
  chrome?: "card" | "none";
  /** Optional className appended to the root. */
  className?: string;
  /** Optional test id passed through to the root. */
  "data-testid"?: string;
}

/**
 * Shared empty-state hero. Replaces the dozen one-off "no items here"
 * snippets sprinkled across the app with a consistent layout.
 *
 * Use:
 *
 *   <EmptyState
 *     icon={<Leaf size={40} />}
 *     title="No plants yet"
 *     body="Your Shed is empty — start by searching for a plant."
 *     primaryCta={{ label: "Add a plant", onClick: handleAdd }}
 *   />
 *
 * Sizes:
 *   • sm — compact, for inline empty states inside a tab.
 *   • md — card-sized hero (most common).
 *   • lg — full-page hero, large illustration.
 *
 * Chrome:
 *   • "card" — dashed border + low-saturation bg (default).
 *   • "none" — bare content, for surfaces that own their own container.
 */
export default function EmptyState({
  icon,
  title,
  body,
  primaryCta,
  secondaryCta,
  size = "md",
  chrome = "card",
  className = "",
  "data-testid": testId,
}: Props) {
  const isSm = size === "sm";
  const isLg = size === "lg";

  const containerPad = isSm
    ? "p-6"
    : isLg
      ? "p-10 sm:p-16"
      : "p-8 sm:p-12";

  const chromeClass = chrome === "card"
    ? "rounded-3xl border-2 border-dashed border-rhozly-outline/15 bg-rhozly-surface-low/40"
    : "";

  const iconBadgeSize = isSm ? "w-12 h-12" : isLg ? "w-20 h-20" : "w-14 h-14";
  const titleClass = isSm
    ? "text-sm font-black"
    : isLg
      ? "text-2xl font-black font-display"
      : "text-lg font-black";
  const bodyClass = isSm
    ? "text-xs text-rhozly-on-surface/55"
    : "text-sm text-rhozly-on-surface/60";
  const maxBodyWidth = isLg ? "max-w-md" : "max-w-sm";

  return (
    <div
      data-testid={testId ?? "empty-state"}
      className={`flex flex-col items-center justify-center text-center gap-3 ${containerPad} ${chromeClass} ${className}`}
    >
      <div
        className={`${iconBadgeSize} rounded-3xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center`}
      >
        {icon}
      </div>
      <h3 className={`${titleClass} text-rhozly-on-surface`}>{title}</h3>
      {body && (
        <div className={`${bodyClass} ${maxBodyWidth} leading-relaxed`}>{body}</div>
      )}

      {(primaryCta || secondaryCta) && (
        <div className="flex flex-col sm:flex-row items-center gap-2 mt-2">
          {primaryCta && (
            <button
              type="button"
              onClick={primaryCta.onClick}
              data-testid={primaryCta["data-testid"]}
              className={`inline-flex items-center gap-2 ${isSm ? "px-4 py-2 text-xs" : "px-6 py-3 text-sm"} min-h-[44px] rounded-2xl bg-rhozly-primary text-white font-black shadow-sm hover:bg-rhozly-primary/90 transition-colors active:scale-95`}
            >
              {primaryCta.icon}
              {primaryCta.label}
            </button>
          )}
          {secondaryCta && (
            <button
              type="button"
              onClick={secondaryCta.onClick}
              data-testid={secondaryCta["data-testid"]}
              className={`inline-flex items-center gap-2 ${isSm ? "px-4 py-2 text-xs" : "px-6 py-3 text-sm"} min-h-[44px] rounded-2xl bg-white border border-rhozly-outline/20 text-rhozly-primary font-black hover:bg-rhozly-primary/5 transition-colors`}
            >
              {secondaryCta.icon}
              {secondaryCta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
