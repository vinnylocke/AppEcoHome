import { assert, assertEquals } from "@std/assert";
import { modelsForTier, CHAT_MODELS_PRO, CHAT_MODELS_FLASH } from "../functions/agent-chat/chatModels.ts";

// Round-7 production decision: paid AI-chat tiers get the Pro cascade
// (usability 3.74→4.33 on the frozen eval), lower tiers ride flash.

Deno.test("chatModels — sage & evergreen get the Pro cascade", () => {
  assertEquals(modelsForTier("sage"), CHAT_MODELS_PRO);
  assertEquals(modelsForTier("evergreen"), CHAT_MODELS_PRO);
  assert(CHAT_MODELS_PRO[0].includes("pro"), "Pro cascade must lead with a pro model");
});

Deno.test("chatModels — lower/unknown tiers get the flash cascade", () => {
  assertEquals(modelsForTier("sprout"), CHAT_MODELS_FLASH);
  assertEquals(modelsForTier("botanist"), CHAT_MODELS_FLASH);
  assertEquals(modelsForTier(""), CHAT_MODELS_FLASH);
  assert(CHAT_MODELS_FLASH.every((m) => !m.includes("pro")), "flash cascade must not contain pro models");
});

Deno.test("chatModels — Pro cascade keeps flash fallbacks for availability", () => {
  assert(CHAT_MODELS_PRO.some((m) => m.includes("flash")), "Pro cascade needs flash rungs");
});
