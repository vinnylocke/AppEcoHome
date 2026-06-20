import { assertEquals } from "@std/assert";
import {
  isValidTier,
  tierToFlags,
  PAID_TIERS,
  priceIdForTier,
  tierFromPriceId,
  tierFromMetadata,
  resolveSubscriptionTier,
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

Deno.test("resolveSubscriptionTier prefers the live price over stale sub metadata", () => {
  Deno.env.set("STRIPE_PRICE_EVERGREEN", "price_evergreen");

  // Portal upgrade Sage→Evergreen: the price is now evergreen, but the
  // subscription's metadata.tier is still the checkout-time "sage". Price wins.
  assertEquals(
    resolveSubscriptionTier({
      priceMetadata: { tier: "evergreen" },
      priceId: "price_evergreen",
      subscriptionMetadata: { tier: "sage", uid: "u1" },
    }),
    "evergreen",
  );

  // No price metadata → fall back to the env price-id map (still beats sub metadata).
  assertEquals(
    resolveSubscriptionTier({
      priceMetadata: {},
      priceId: "price_evergreen",
      subscriptionMetadata: { tier: "sage" },
    }),
    "evergreen",
  );

  // Only when the price yields nothing do we trust the subscription metadata.
  assertEquals(
    resolveSubscriptionTier({
      priceMetadata: null,
      priceId: "price_unknown",
      subscriptionMetadata: { tier: "botanist" },
    }),
    "botanist",
  );

  assertEquals(resolveSubscriptionTier({}), null);
});

Deno.test("statusGrantsAccess keeps access during grace, revokes when cancelled", () => {
  for (const s of ["active", "trialing", "past_due"]) {
    assertEquals(statusGrantsAccess(s), true);
  }
  for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired"]) {
    assertEquals(statusGrantsAccess(s), false);
  }
});
