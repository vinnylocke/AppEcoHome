/**
 * Logic-less `{{var}}` template renderer for user-defined outbound
 * control requests (custom_http valve control).
 *
 * SECURITY: pure string substitution from a fixed variable map — NO
 * expression evaluation, NO helpers, NO `eval`. A user-supplied template
 * therefore cannot execute code. Unknown `{{placeholders}}` throw so a
 * typo surfaces at validation time instead of POSTing a literal
 * "{{durtion}}" to the device.
 *
 * The same logic is mirrored (separate runtime) in
 * `src/lib/payloadTemplate.ts` for the wizard's live preview — keep the
 * two in lockstep (both are covered by parity tests).
 */

export type TemplateVars = Record<string, string | number>;

/** Matches `{{ name }}` — names are `[A-Za-z0-9_]+`, optional inner whitespace. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * Render `template`, replacing every `{{name}}` with `vars[name]`.
 * Throws `unknown_template_variable: <name>` if a placeholder has no
 * matching variable.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) {
      throw new Error(`unknown_template_variable: ${name}`);
    }
    return String(vars[name]);
  });
}

/** The distinct placeholder names referenced by `template`. */
export function templateVarsUsed(template: string): string[] {
  const seen = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) seen.add(m[1]);
  return [...seen];
}
