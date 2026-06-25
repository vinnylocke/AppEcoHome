import { assertEquals } from "@std/assert";
import { ensureStripeCustomer } from "@shared/stripeCustomer.ts";

// Minimal db mock: captures the update payload; .eq() resolves { error: null }.
function mockDb(cap: { payload?: unknown }) {
  return {
    from() {
      return {
        update(payload: unknown) {
          cap.payload = payload;
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
}

Deno.test("ensureStripeCustomer — returns existing id, no Stripe call", async () => {
  let created = false;
  const stripe = { customers: { create() { created = true; return Promise.resolve({ id: "cus_new" }); } } };
  const cap: { payload?: unknown } = {};
  const id = await ensureStripeCustomer(mockDb(cap), stripe, {
    uid: "u1", email: "a@b.com", stripe_customer_id: "cus_existing",
  });
  assertEquals(id, "cus_existing");
  assertEquals(created, false);
  assertEquals(cap.payload, undefined); // nothing persisted
});

Deno.test("ensureStripeCustomer — creates with email + metadata.uid and persists", async () => {
  const cap: { payload?: unknown } = {};
  let createArgs: Record<string, unknown> = {};
  const stripe = { customers: { create(args: Record<string, unknown>) { createArgs = args; return Promise.resolve({ id: "cus_new" }); } } };
  const id = await ensureStripeCustomer(mockDb(cap), stripe, {
    uid: "u2", email: "c@d.com", stripe_customer_id: null,
  });
  assertEquals(id, "cus_new");
  assertEquals(createArgs.email, "c@d.com");
  assertEquals((createArgs.metadata as { uid: string }).uid, "u2");
  assertEquals(cap.payload, { stripe_customer_id: "cus_new" });
});

Deno.test("ensureStripeCustomer — null email becomes undefined for Stripe", async () => {
  let createArgs: Record<string, unknown> = {};
  const stripe = { customers: { create(args: Record<string, unknown>) { createArgs = args; return Promise.resolve({ id: "cus_x" }); } } };
  await ensureStripeCustomer(mockDb({}), stripe, { uid: "u3", email: null, stripe_customer_id: null });
  assertEquals(createArgs.email, undefined);
});
