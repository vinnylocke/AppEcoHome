import React from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds the press/elevation language for cards that act as tap targets. */
  interactive?: boolean;
}

/**
 * The house card (brand book p.6: white on cream, hairline border,
 * green-tinted shadow).
 *
 * The `interactive` variant carries the press/elevation language generalized
 * from the HomeDashboard hero — hover lift (`can-hover`-gated so touch never
 * sticks) plus the scale-down press. It styles only: consumers add
 * `role`, `tabIndex`, and `onClick` themselves when the card acts as a
 * button. The keyboard focus ring comes from the global `:focus-visible`
 * rule in src/index.css.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-rhozly-surface-lowest border border-rhozly-outline/10 rounded-card shadow-card",
        interactive &&
          "cursor-pointer touch-manipulation transition-[transform,box-shadow] duration-200 ease-spring can-hover:hover:shadow-raised can-hover:hover:-translate-y-0.5 active:scale-[0.98] active:duration-100 active:ease-out",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
