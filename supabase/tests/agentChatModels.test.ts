import { assert, assertEquals } from "@std/assert";
import {
  modelsForTier,
  CHAT_MODELS_EVERGREEN,
  CHAT_MODELS_SAGE,
  CHAT_MODELS_FLASH,
} from "../functions/agent-chat/chatModels.ts";

// Round-7 production decision: paid AI-chat tiers get Pro-class models
// (usability 3.74→4.33 on the frozen eval), lower tiers ride flash.
// 2026-07-08 split: the TOP model is Evergreen-exclusive; Sage keeps
// Pro-class via gemini-2.5-pro (docs/plans/evergreen-top-model-and-
// overdue-nudge.md).

Deno.test("chatModels — the top model is EVERGREEN-exclusive", () => {
  assertEquals(modelsForTier("evergreen"), CHAT_MODELS_EVERGREEN);
  assertEquals(CHAT_MODELS_EVERGREEN[0], "gemini-3.1-pro-preview", "evergreen leads with the newest Pro");
  assert(!CHAT_MODELS_SAGE.includes("gemini-3.1-pro-preview"), "sage must NOT get the top model");
  assert(!CHAT_MODELS_FLASH.includes("gemini-3.1-pro-preview"), "flash must NOT get the top model");
});

Deno.test("chatModels — sage keeps a Pro-class cascade", () => {
  assertEquals(modelsForTier("sage"), CHAT_MODELS_SAGE);
  assertEquals(CHAT_MODELS_SAGE[0], "gemini-2.5-pro", "sage still leads with a Pro model");
});

Deno.test("chatModels — lower/unknown tiers get the flash cascade", () => {
  assertEquals(modelsForTier("sprout"), CHAT_MODELS_FLASH);
  assertEquals(modelsForTier("botanist"), CHAT_MODELS_FLASH);
  assertEquals(modelsForTier(""), CHAT_MODELS_FLASH);
  assert(CHAT_MODELS_FLASH.every((m) => !m.includes("pro")), "flash cascade must not contain pro models");
});

Deno.test("chatModels — paid cascades keep flash fallbacks for availability", () => {
  assert(CHAT_MODELS_EVERGREEN.some((m) => m.includes("flash")), "evergreen cascade needs flash rungs");
  assert(CHAT_MODELS_SAGE.some((m) => m.includes("flash")), "sage cascade needs flash rungs");
});
