import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  FIELD_CONTROL_CLASSES,
  FIELD_CONTROL_ERROR_CLASSES,
  FIELD_ERROR_TEXT_CLASSES,
  FIELD_HELP_TEXT_CLASSES,
  FIELD_LABEL_CLASSES,
} from "./TextField";

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Uppercase micro-label rendered above the control, wired via htmlFor. */
  label?: string;
  /** Muted guidance below the control. Hidden while `error` is showing. */
  help?: string;
  /** Error message below the control; also tints the control danger-red. */
  error?: string;
}

/**
 * The house dropdown: a native `<select>` wearing the shared field chrome
 * (see TextField), with the platform arrow replaced by a lucide chevron so
 * it matches the design language on every OS. Children are plain
 * `<option>` elements. Same label/help/error wiring as TextField — the
 * `focus:` tints fire on every focus while the global `:focus-visible`
 * outline in src/index.css additionally fires for keyboard users; that
 * stacking is deliberate.
 */
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField({ label, help, error, id, className, children, ...rest }, ref) {
    const autoId = React.useId();
    const fieldId = id ?? autoId;
    const errorId = `${fieldId}-error`;
    const helpId = `${fieldId}-help`;

    return (
      <div>
        {label && (
          <label htmlFor={fieldId} className={FIELD_LABEL_CLASSES}>
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : help ? helpId : undefined}
            className={cn(
              FIELD_CONTROL_CLASSES,
              "appearance-none pr-10",
              error && FIELD_CONTROL_ERROR_CLASSES,
              className,
            )}
            {...rest}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-rhozly-on-surface-variant"
          />
        </div>
        {error ? (
          <p role="alert" id={errorId} className={FIELD_ERROR_TEXT_CLASSES}>
            {error}
          </p>
        ) : (
          help && (
            <p id={helpId} className={FIELD_HELP_TEXT_CLASSES}>
              {help}
            </p>
          )
        )}
      </div>
    );
  },
);
