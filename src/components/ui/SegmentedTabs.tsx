import React from "react";
import { cn } from "../../lib/cn";

/** A single option in a {@link SegmentedTabs} group. */
export interface SegmentedTab {
  id: string;
  label: string;
  /** Optional leading icon (lucide-react, sized by the caller). */
  icon?: React.ReactNode;
  /** Optional trailing adornment, e.g. a count chip. */
  badge?: React.ReactNode;
  /** Optional per-tab data-testid — lets adopters keep load-bearing e2e
   *  selectors (e.g. the Shed's `shed-scope-home`) through a migration. */
  testId?: string;
}

export interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  /** The id of the currently selected tab. Controlled — pair with `onChange`. */
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist — required, there is no visible label. */
  "aria-label": string;
  size?: "sm" | "md";
  /** Stretch to fill the parent, tabs sharing the width equally. */
  fullWidth?: boolean;
  className?: string;
  "data-testid"?: string;
}

const SIZE_CLASSES: Record<NonNullable<SegmentedTabsProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-2xs",
  md: "px-4 py-2 text-xs",
};

/**
 * The house segmented control: a pill tablist with a sliding indicator behind
 * the active tab. Replaces the ad-hoc `bg-rhozly-surface-low p-1.5 rounded-2xl`
 * + white-pill-button dialect scattered through feature components with real
 * tab semantics.
 *
 * Use it wherever one-of-N views swap in place (list/history toggles, scope
 * switches, modal step tabs). Keyboard follows the WAI-ARIA tabs pattern with
 * roving focus: ArrowLeft/ArrowRight wrap, Home/End jump, and moving focus
 * also selects (selection follows focus). The keyboard focus ring comes from
 * the global `:focus-visible` rule in src/index.css.
 */
export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({
  tabs,
  value,
  onChange,
  size = "md",
  fullWidth = false,
  className,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}) => {
  const baseId = React.useId();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = React.useState<{ width: number; x: number } | null>(null);

  const measure = React.useCallback(() => {
    const btn = tabRefs.current.get(value);
    // A zero-size rect means a display:none ancestor — keep the indicator
    // hidden until the ResizeObserver fires with a real measurement.
    if (!btn || btn.offsetWidth === 0) {
      setIndicator((prev) => (prev === null ? prev : null));
      return;
    }
    // Bail out when nothing moved — setting a NEW object with identical values
    // every run turns any parent re-render storm (or an unstable `tabs` array
    // identity re-firing the layout effect) into a "Maximum update depth
    // exceeded" crash. Returning the previous state lets React skip the update.
    const width = btn.offsetWidth;
    const x = btn.offsetLeft;
    setIndicator((prev) =>
      prev && prev.width === width && prev.x === x ? prev : { width, x },
    );
  }, [value]);

  React.useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure, tabs, size, fullWidth]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "ArrowRight":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = tabs[nextIndex];
    // Selection follows focus — moving the roving tabindex also activates.
    onChange(next.id);
    tabRefs.current.get(next.id)?.focus();
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      data-testid={dataTestId}
      className={cn(
        "relative inline-flex items-center gap-0.5 bg-rhozly-surface-low p-1 rounded-full border border-rhozly-outline/10",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {/* Position slides via transform (compositor-only), but width SNAPS:
          width is a layout property, so transitioning it would reflow every
          frame — we deliberately trade a smooth resize for a cheap slide. */}
      {indicator && (
        <div
          aria-hidden
          className="absolute top-1 bottom-1 left-0 rounded-full bg-rhozly-surface-lowest shadow-card border border-rhozly-primary/10 transition-transform duration-200 ease-spring"
          style={{ width: indicator.width, transform: `translateX(${indicator.x}px)` }}
        />
      )}
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
              else tabRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            data-testid={tab.testId}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "relative z-[1] inline-flex items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap touch-manipulation transition-colors duration-150 pointer-coarse:min-h-11",
              SIZE_CLASSES[size],
              selected
                ? "text-rhozly-primary"
                : "text-rhozly-on-surface-variant can-hover:hover:text-rhozly-on-surface",
              fullWidth && "flex-1",
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
};
