import { assert, assertEquals } from "@std/assert";
import { normaliseReplyMarkers, buildCheckedLine, buildActionLine } from "../functions/agent-chat/replyMarkers.ts";

// Round 6 — deterministic template markers. The 🔎 line hit 2/60 read turns
// when left to the model; these guarantee the server now makes it (and the 🔧
// line) truthful and canonical on every turn.

Deno.test("replyMarkers — 🔎 line is appended from the read tools that ran", () => {
  const { reply } = normaliseReplyMarkers("Your tomatoes need water.", {
    readTools: ["list_plants", "get_weather_now"],
    pendingPreviews: [],
  });
  assert(reply.includes("🔎 Checked: your plants · weather"), reply);
  assert(reply.startsWith("Your tomatoes need water."), "body must stay first");
});

Deno.test("replyMarkers — model-written 🔎 lines are replaced by the canonical one", () => {
  const { reply } = normaliseReplyMarkers("Answer.\n🔎 Checked: something wrong\nMore.", {
    readTools: ["list_devices"],
    pendingPreviews: [],
  });
  assertEquals(reply.match(/🔎/g)?.length, 1, "exactly one 🔎 line");
  assert(reply.includes("🔎 Checked: your devices & sensors"), reply);
  assert(!reply.includes("something wrong"), "model's 🔎 content must be dropped");
});

Deno.test("replyMarkers — no reads → no 🔎 line", () => {
  const { reply } = normaliseReplyMarkers("Blueberries like pH 4.5–5.5.", { readTools: [], pendingPreviews: [] });
  assert(!reply.includes("🔎"), reply);
});

Deno.test("replyMarkers — staged with model's own 🔧 keeps the model's wording", () => {
  const { reply, phantomStripped } = normaliseReplyMarkers(
    "Done thinking.\n🔧 Ready to confirm: water beds every 3 days (edit the cadence on the card)",
    { readTools: [], pendingPreviews: ["Create schedule 'Water beds' every 3 days"] },
  );
  assert(reply.includes("edit the cadence on the card"), "model wording kept");
  assertEquals(phantomStripped, false);
});

Deno.test("replyMarkers — staged but model omitted 🔧 → composed from previews", () => {
  const { reply } = normaliseReplyMarkers("I'll set that up.", {
    readTools: ["list_areas"],
    pendingPreviews: ["Create schedule 'Water Raised Bed A' every 3 days"],
  });
  assert(reply.includes("🔧 Ready to confirm: Create schedule 'Water Raised Bed A' every 3 days"), reply);
  // canonical order: 🔎 before 🔧
  assert(reply.indexOf("🔎") < reply.indexOf("🔧"), "🔎 must precede 🔧");
});

Deno.test("replyMarkers — phantom 🔧 with nothing pending is stripped and flagged", () => {
  const { reply, phantomStripped } = normaliseReplyMarkers(
    "All sorted!\n🔧 Ready to confirm: a schedule I never actually staged",
    { readTools: [], pendingPreviews: [] },
  );
  assertEquals(phantomStripped, true);
  assert(!reply.includes("🔧"), reply);
  assertEquals(reply, "All sorted!");
});

Deno.test("replyMarkers — a trailing → offer stays the very last line", () => {
  const { reply } = normaliseReplyMarkers("Prune in late summer.\n\n→ Want a reminder for late August?", {
    readTools: ["list_plants"],
    pendingPreviews: [],
  });
  const lines = reply.split("\n").filter((l) => l.trim());
  assert(lines[lines.length - 1].startsWith("→"), "→ must be last");
  assert(reply.indexOf("🔎") < reply.indexOf("→ Want"), "🔎 before →");
});

Deno.test("replyMarkers — helpers: dedupe labels, unknown tools skipped, long previews truncated", () => {
  assertEquals(buildCheckedLine(["list_plants", "list_plants", "show_plant_images"]), "🔎 Checked: your plants");
  assertEquals(buildCheckedLine([]), null);
  const long = buildActionLine(["x".repeat(200)]);
  assert(long !== null && long.length < 200, "preview must be truncated");
});
