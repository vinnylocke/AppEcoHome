import { assertEquals } from "@std/assert";
import {
  isValidTier,
  tierToFlags,
  PAID_TIERS,
  priceIdForTier,
  tierFromPriceId,
  tierFromMetadata,
  statusGrantsAccess,
} from "@shared/stripeTiers.ts";

Deno.test("isValidTier accepts the four tiers and rejects others", () => {
  for (const t of ["sprout", "botanist", "sage", "evergreen"]) {
    assertEquals(isValidTier(t), true);
  }
  assertEquals(isValidTier("gold"), false);
  assertEquals(isValidTier(null), false);
  assertEquals(isValidTier(undefined), false);
  assertEquals(isValidTier(42), false);
});

Deno.test("tierToFlags mirrors src/constants/tiers.ts flag mapping", () => {
  assertEquals(tierToFlags("sprout"), {
    subscription_tier: "sprout", ai_enabled: false, enable_perenual: false,
  });
  assertEquals(tierToFlags("botanist"), {
    subscription_tier: "botanist", ai_enabled: false, enable_perenual: true,
  });
  assertEquals(tierToFlags("sage"), {
    subscription_tier: "sage", ai_enabled: true, enable_perenual: false,
  });
  assertEquals(tierToFlags("evergreen"), {
    subscription_tier: "evergreen", ai_enabled: true, enable_perenual: true,
  });
});

Deno.test("PAID_TIERS excludes the free Sprout tier", () => {
  assertEquals([...PAID_TIERS], ["botanist", "sage", "evergreen"]);
});

Deno.test("priceIdForTier reads per-tier env and returns null for sprout", () => {
  Deno.env.set("STRIPE_PRICE_BOTANIST", "price_botanist");
  Deno.env.set("STRIPE_PRICE_SAGE", "price_sage");
  Deno.env.set("STRIPE_PRICE_EVERGREEN", "price_evergreen");

  assertEquals(priceIdForTier("botanist"), "price_botanist");
  assertEquals(priceIdForTier("sage"), "price_sage");
  assertEquals(priceIdForTier("evergreen"), "price_evergreen");
  assertEquals(priceIdForTier("sprout"), null);
});

Deno.test("tierFromPriceId reverse-maps via env, null for unknown", () => {
  Deno.env.set("STRIPE_PRICE_BOTANIST", "price_botanist");
  Deno.env.set("STRIPE_PRICE_SAGE", "price_sage");
  Deno.env.set("STRIPE_PRICE_EVERGREEN", "price_evergreen");

  assertEquals(tierFromPriceId("price_sage"), "sage");
  assertEquals(tierFromPriceId("price_evergreen"), "evergreen");
  assertEquals(tierFromPriceId("price_unknown"), null);
  assertEquals(tierFromPriceId(null), null);
});

Deno.test("tierFromMetadata reads the tier tag set on Stripe objects", () => {
  assertEquals(tierFromMetadata({ tier: "evergreen" }), "evergreen");
  assertEquals(tierFromMetadata({ tier: "gold" }), null);
  assertEquals(tierFromMetadata({}), null);
  assertEquals(tierFromMetadata(null), null);
});

Deno.test("statusGrantsAccess keeps access during grace, revokes when cancelled", () => {
  for (const s of ["active", "trialing", "past_due"]) {
    assertEquals(statusGrantsAccess(s), true);
  }
  for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired"]) {
    assertEquals(statusGrantsAccess(s), false);
  }
});
