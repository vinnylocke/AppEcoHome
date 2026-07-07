import { assert } from "@std/assert";
import { APP_FACTS } from "../functions/agent-chat/appFacts.ts";

// Round 9 — the app-capability truth-table. Wave-3 of the eval caught the
// assistant denying real features (photo ID, shared homes, frost alerts) and
// inventing fake ones (Zigbee sensors, CSV export). These pin the load-bearing
// truths so a future edit can't silently drop them.

const FACTS = APP_FACTS.join("\n");

Deno.test("app facts — real features are affirmed", () => {
  assert(/identify from a PHOTO with Plant Lens/i.test(FACTS), "photo ID must be affirmed (RB06)");
  assert(/homes can be SHARED/i.test(FACTS) && /per-member permissions/i.test(FACTS), "shared homes must be affirmed (RB15)");
  assert(/FROST and HEATWAVE alerts built in natively/i.test(FACTS), "native frost alerts must be affirmed (RE15)");
  assert(/paste a whole plant list and AI parses it/i.test(FACTS), "bulk add must be affirmed (RE02)");
  assert(/EACH with its own weather/i.test(FACTS), "multi-location weather must be affirmed (RE19)");
  assert(/replace a paper journal/i.test(FACTS), "journal capability must be affirmed (RE01)");
  assert(/Sprout is FREE/i.test(FACTS), "free tier must be affirmed (RB04)");
});

Deno.test("app facts — the sensor integration list is closed", () => {
  assert(/Ecowitt, eWeLink, or a DIY HTTP webhook — THOSE THREE ONLY/i.test(FACTS), "sensor list must be exhaustive (RE09)");
  assert(/No Zigbee\/Matter\/HomeKit/i.test(FACTS), "other standards must be explicitly excluded");
});

Deno.test("app facts — non-features are honestly listed", () => {
  assert(/NOT AVAILABLE/i.test(FACTS), "missing the not-available section");
  assert(/CSV\/data export, a public API, and printing don'?t exist/i.test(FACTS), "export/API/printing must be denied (RE10/RE12/E34/E43)");
});

Deno.test("app facts — frost automation triggers vs native alerts distinction is kept", () => {
  assert(/rain-forecast and heatwave conditions but NOT frost/i.test(FACTS), "automation trigger limits must be stated (E37)");
});

Deno.test("app facts — never-guess instruction bookends the list", () => {
  assert(/never guess in either direction/i.test(FACTS), "must forbid guessing about capabilities");
});