import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner before the label and disables the button while true. */
  busy?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-rhozly-primary text-white can-hover:hover:bg-rhozly-primary-container shadow-card",
  secondary:
    "bg-rhozly-surface text-rhozly-on-surface can-hover:hover:bg-rhozly-surface-low",
  outline:
    "bg-transparent border border-rhozly-outline/30 text-rhozly-primary can-hover:hover:bg-rhozly-primary/5",
  ghost:
    "bg-transparent text-rhozly-on-surface-variant can-hover:hover:bg-rhozly-surface-low can-hover:hover:text-rhozly-on-surface",
  destructive: "bg-rhozly-error text-white can-hover:hover:bg-status-danger-ink-strong",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-4 text-xs gap-1.5",
  md: "min-h-11 px-5 text-sm gap-2",
  lg: "min-h-12 px-7 text-base gap-2",
};

/**
 * The house button (brand book p.6: pill, weight 700, one green).
 *
 * One hover language (background shift, `can-hover`-gated so touch never
 * sticks), one press language (scale 0.97 in fast, spring back out), one
 * disabled treatment. The keyboard focus ring comes from the global
 * `:focus-visible` rule in src/index.css — never add `focus:outline-none`.
 * `size="sm"` is for dense desktop contexts; coarse pointers are always
 * bumped to the 44px minimum touch target.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", busy = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold select-none touch-manipulation",
        "transition-[background-color,color,border-color,transform] duration-200 ease-spring",
        "active:scale-[0.97] active:duration-100 active:ease-out",
        "disabled:opacity-50 disabled:pointer-events-none",
        "pointer-coarse:min-h-11",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {busy && <Loader2 aria-hidden className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
});
