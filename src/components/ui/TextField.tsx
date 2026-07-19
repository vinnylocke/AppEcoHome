import React from "react";
import { cn } from "../../lib/cn";

/**
 * Shared field chrome for the ui/ form primitives (TextField, TextAreaField,
 * SelectField). One label voice, one control shape, one error language —
 * standardising the filled-field idiom used ad hoc across the app
 * (`bg-rhozly-surface-low` + transparent border that tints on focus).
 *
 * The `focus:` border/ring here fires on every focus (mouse, touch,
 * keyboard); the global `:focus-visible` outline in src/index.css
 * additionally fires for keyboard users. That stacking is deliberate —
 * never add `focus:outline-none`.
 */
export const FIELD_LABEL_CLASSES =
  "block text-2xs font-bold uppercase tracking-wide text-rhozly-on-surface-variant mb-1.5";

/** Base control chrome — filled surface, 16px radius, tinted focus border. */
export const FIELD_CONTROL_CLASSES =
  "w-full min-h-11 px-4 py-3 bg-rhozly-surface-low rounded-control text-sm font-semibold text-rhozly-on-surface placeholder:text-rhozly-on-surface/35 border border-transparent transition-colors duration-150 focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15";

/** Swaps the focus/border tints to the status-danger family while `error` is set. */
export const FIELD_CONTROL_ERROR_CLASSES =
  "border-status-danger-ink/40 focus:border-status-danger-ink/50 focus:ring-status-danger-ink/10";

export const FIELD_ERROR_TEXT_CLASSES = "mt-1.5 text-2xs font-bold text-status-danger-ink";

export const FIELD_HELP_TEXT_CLASSES = "mt-1.5 text-2xs text-rhozly-on-surface-variant";

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Uppercase micro-label rendered above the control, wired via htmlFor. */
  label?: string;
  /** Muted guidance below the control. Hidden while `error` is showing. */
  help?: string;
  /** Error message below the control; also tints the control danger-red. */
  error?: string;
}

/**
 * The house single-line text input: filled surface, micro-label above,
 * help/error line below. `id` is optional — a `useId` fallback keeps the
 * label and aria-describedby wiring intact without one. Pass `error` to
 * swap the focus tints to the danger family and announce the message
 * (`role="alert"` + `aria-invalid`).
 */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, help, error, id, className, ...rest },
  ref,
) {
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
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : help ? helpId : undefined}
        className={cn(FIELD_CONTROL_CLASSES, error && FIELD_CONTROL_ERROR_CLASSES, className)}
        {...rest}
      />
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
});

export interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Uppercase micro-label rendered above the control, wired via htmlFor. */
  label?: string;
  /** Muted guidance below the control. Hidden while `error` is showing. */
  help?: string;
  /** Error message below the control; also tints the control danger-red. */
  error?: string;
}

/**
 * Multi-line sibling of TextField — identical chrome and label/help/error
 * wiring over a `<textarea>` (3 rows by default). Use it wherever free
 * text outgrows a single line: notes, descriptions, journal entries.
 */
export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, help, error, id, className, rows = 3, ...rest }, ref) {
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
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : help ? helpId : undefined}
          className={cn(FIELD_CONTROL_CLASSES, error && FIELD_CONTROL_ERROR_CLASSES, className)}
          {...rest}
        />
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
