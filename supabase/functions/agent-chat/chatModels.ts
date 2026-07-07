/**
 * Per-tier model cascade for the Garden AI chat (round 7 production decision —
 * docs/plans/garden-ai-eval-round7-pro-model.md).
 *
 * The eval (docs/ai-chat-eval/, run 35.0016) showed Pro transforms the chat:
 * usability 3.74→4.33, missed tool-use 9→2 on the same frozen exam. Pro costs
 * ~10–20× flash per token, so the paid AI tiers get the Pro cascade while any
 * lower-tier access (quota-capped anyway) rides a quality-ordered flash
 * cascade. Flash rungs remain in the Pro cascade as availability fallbacks so
 * chat survives Pro overload.
 */

export const CHAT_MODELS_PRO = [
  "gemini-3.1-pro-preview",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

export const CHAT_MODELS_FLASH = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

export type ChatTier = "sprout" | "botanist" | "sage" | "evergreen";

/** Sage & Evergreen (the paid AI-chat tiers) get Pro; everything else flash. */
export function modelsForTier(tier: string): string[] {
  return tier === "sage" || tier === "evergreen" ? CHAT_MODELS_PRO : CHAT_MODELS_FLASH;
}
