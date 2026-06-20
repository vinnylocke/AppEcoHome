/**
 * Shared gardener persona (user_profiles.persona) + the dual-voice instruction
 * woven into every AI insight / tip / summary prompt, so the tone is consistent
 * across surfaces:
 *   new         → warm, plain, reassuring, always ends with "what to do now"
 *   experienced → concise, technical, numbers-forward, no hand-holding
 *   null        → balanced middle ground
 *
 * See docs/plans/ai-insights-overhaul.md.
 */
export type Persona = "new" | "experienced" | null;

export function personaInstruction(persona: Persona): string {
  if (persona === "new") {
    return [
      "AUDIENCE: a beginner gardener.",
      "- Warm, encouraging, plain English; avoid jargon (or define it in one short clause).",
      "- Reassure rather than alarm; frame problems as easy, specific fixes.",
      "- Always finish with a clear one-line 'what to do now'.",
    ].join("\n");
  }
  if (persona === "experienced") {
    return [
      "AUDIENCE: an experienced gardener.",
      "- Concise and specific; lead with the numbers and the action.",
      "- Use correct horticultural terms and exact figures; no hand-holding.",
    ].join("\n");
  }
  return [
    "AUDIENCE: a general gardener — balance plain explanation with useful specifics.",
    "- One or two sentences; concrete, with the key number and the action.",
  ].join("\n");
}
