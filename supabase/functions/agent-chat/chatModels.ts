/**
 * Per-tier model cascade for the Garden AI chat (round 7 production decision —
 * docs/plans/garden-ai-eval-round7-pro-model.md; per-tier split 2026-07-08 —
 * docs/plans/evergreen-top-model-and-overdue-nudge.md).
 *
 * The eval (docs/ai-chat-eval/, run 35.0016) showed Pro transforms the chat:
 * usability 3.74→4.33, missed tool-use 9→2 on the same frozen exam. Pro costs
 * ~10–20× flash per token. The 2026-07-08 product decision splits the paid
 * tiers: the TOP model (gemini-3.1-pro-preview) is EVERGREEN-exclusive; Sage
 * keeps Pro-class quality via gemini-2.5-pro (the Pro-class uplift, minus the
 * newest rung). Flash rungs remain in both cascades as availability fallbacks
 * so chat survives Pro overload.
 */

export const CHAT_MODELS_EVERGREEN = [
  "gemini-3.1-pro-preview",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

export const CHAT_MODELS_SAGE = [
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

/**
 * Evergreen → the full cascade led by the newest Pro model (exclusive).
 * Sage → Pro-class cascade led by gemini-2.5-pro.
 * Everything else (quota-capped anyway) → quality-ordered flash cascade.
 */
export function modelsForTier(tier: string): string[] {
  if (tier === "evergreen") return CHAT_MODELS_EVERGREEN;
  if (tier === "sage") return CHAT_MODELS_SAGE;
  return CHAT_MODELS_FLASH;
}
