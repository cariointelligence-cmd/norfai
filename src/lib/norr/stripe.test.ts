import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStripeCheckoutForm,
  createStripeCheckout,
  createStripePortal,
  planFromStripePriceId,
  resolveStripePlan,
  stripeCheckoutReady,
} from "./platform.ts";
import {
  interpretStripeEvent,
  signStripePayload,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeUserId,
  verifyStripeSignature,
} from "./stripe-webhook.ts";

const SECRET = "whsec_test_secret";
const USER = "user_abc";

async function withPrices<T>(fn: () => T | Promise<T>): Promise<T> {
  const prev = {
    key: process.env.STRIPE_SECRET_KEY,
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    unlimited: process.env.STRIPE_PRICE_UNLIMITED,
  };
  process.env.STRIPE_SECRET_KEY = "sk_test_norf";
  process.env.STRIPE_PRICE_STARTER = "price_starter_test";
  process.env.STRIPE_PRICE_PRO = "price_pro_test";
  process.env.STRIPE_PRICE_UNLIMITED = "price_unlimited_test";
  try {
    return await fn();
  } finally {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore("STRIPE_SECRET_KEY", prev.key);
    restore("STRIPE_PRICE_STARTER", prev.starter);
    restore("STRIPE_PRICE_PRO", prev.pro);
    restore("STRIPE_PRICE_UNLIMITED", prev.unlimited);
  }
}

describe("Stripe signature", () => {
  it("accepts a fresh valid v1 and rejects tampering", () => {
    const raw = '{"id":"evt_1"}';
    const header = signStripePayload(raw, SECRET);
    assert.equal(verifyStripeSignature(raw, header, SECRET), true);
    assert.equal(verifyStripeSignature(raw + "x", header, SECRET), false);
    assert.equal(verifyStripeSignature(raw, header, "whsec_other"), false);
    assert.equal(verifyStripeSignature(raw, "", SECRET), false);
  });
  it("accepts any of multiple v1 signatures (key rotation)", () => {
    const raw = '{"id":"evt_2"}';
    const t = Math.floor(Date.now() / 1000);
    const good = signStripePayload(raw, SECRET, t).split("v1=")[1];
    const header = `t=${t},v1=deadbeef,v1=${good}`;
    assert.equal(verifyStripeSignature(raw, header, SECRET), true);
  });
  it("rejects expired signatures", () => {
    const raw = '{"id":"evt_old"}';
    const old = Math.floor(Date.now() / 1000) - 400;
    const header = signStripePayload(raw, SECRET, old);
    assert.equal(verifyStripeSignature(raw, header, SECRET), false);
  });
});

describe("Stripe checkout form", () => {
  it("rejects free and incomplete keys", () => {
    const free = buildStripeCheckoutForm({
      userId: USER,
      email: "a@b.fi",
      plan: "free",
      origin: "https://app.grok.me",
    });
    assert.equal(free.ok, false);
    const missing = buildStripeCheckoutForm({
      userId: USER,
      email: "a@b.fi",
      plan: "pro",
      origin: "https://app.grok.me",
    });
    assert.equal(missing.ok, false);
  });
  it("builds a subscription session with price, metadata and xor customer", async () => {
    await withPrices(() => {
      const form = buildStripeCheckoutForm({
        userId: USER,
        email: "ana@norf.fi",
        plan: "pro",
        origin: "https://app.grok.me",
      });
      assert.equal(form.ok, true);
      if (!form.ok) return;
      assert.equal(form.body.get("mode"), "subscription");
      assert.equal(form.body.get("locale"), "fi");
      assert.equal(form.body.get("line_items[0][price]"), "price_pro_test");
      assert.equal(form.body.get("metadata[plan]"), "pro");
      assert.equal(form.body.get("metadata[userId]"), USER);
      assert.equal(form.body.get("subscription_data[metadata][plan]"), "pro");
      assert.equal(form.body.get("client_reference_id"), USER);
      assert.equal(form.body.get("success_url"), "https://app.grok.me/overview?billing=success");
      assert.equal(form.body.get("cancel_url"), "https://app.grok.me/pricing?billing=cancel");
      assert.equal(form.body.get("customer_email"), "ana@norf.fi");
      assert.equal(form.body.get("customer"), null);
      const returning = buildStripeCheckoutForm({
        userId: USER,
        email: "ana@norf.fi",
        plan: "starter",
        origin: "https://app.grok.me",
        customerId: "cus_123",
      });
      assert.equal(returning.ok, true);
      if (!returning.ok) return;
      assert.equal(returning.body.get("customer"), "cus_123");
      assert.equal(returning.body.get("customer_email"), null);
      assert.equal(returning.body.get("line_items[0][price]"), "price_starter_test");
    });
  });
  it("rejects a price value that is not a Stripe price id", async () => {
    await withPrices(() => {
      process.env.STRIPE_PRICE_PRO = "prod_not_a_price";
      const form = buildStripeCheckoutForm({
        userId: USER,
        email: null,
        plan: "pro",
        origin: "https://app.grok.me",
      });
      assert.equal(form.ok, false);
    });
  });
  it("reports checkout ready only when secret and all three prices exist", async () => {
    assert.equal(stripeCheckoutReady(), false);
    await withPrices(() => {
      assert.equal(stripeCheckoutReady(), true);
    });
    assert.equal(stripeCheckoutReady(), false);
  });
});

describe("Stripe checkout HTTP", () => {
  it("posts to Checkout Sessions and returns the url", async () => {
    await withPrices(async () => {
      const orig = globalThis.fetch;
      let url = "";
      let auth = "";
      let body = "";
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
        body = String(init?.body ?? "");
        return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;
      try {
        const r = await createStripeCheckout({
          userId: USER,
          email: "ana@norf.fi",
          plan: "unlimited",
          origin: "https://app.grok.me",
        });
        assert.equal(r.ok, true);
        if (r.ok) assert.equal(r.url, "https://checkout.stripe.com/c/pay/cs_test_1");
        assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
        assert.equal(auth, "Bearer sk_test_norf");
        assert.match(body, /price_unlimited_test/);
        assert.match(body, /metadata%5Bplan%5D=unlimited/);
      } finally {
        globalThis.fetch = orig;
      }
    });
  });
  it("surfaces Stripe API errors instead of inventing a session", async () => {
    await withPrices(async () => {
      const orig = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: { message: "No such price" } }), { status: 400 })) as typeof fetch;
      try {
        const r = await createStripeCheckout({
          userId: USER,
          email: null,
          plan: "pro",
          origin: "https://app.grok.me",
        });
        assert.equal(r.ok, false);
        if (!r.ok) assert.equal(r.error, "No such price");
      } finally {
        globalThis.fetch = orig;
      }
    });
  });
  it("opens a billing portal for an existing customer", async () => {
    await withPrices(async () => {
      const orig = globalThis.fetch;
      let url = "";
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        url = String(input);
        return new Response(JSON.stringify({ url: "https://billing.stripe.com/p/session/test" }), { status: 200 });
      }) as typeof fetch;
      try {
        const r = await createStripePortal({ customerId: "cus_1", origin: "https://app.grok.me" });
        assert.equal(r.ok, true);
        if (r.ok) assert.equal(r.url, "https://billing.stripe.com/p/session/test");
        assert.equal(url, "https://api.stripe.com/v1/billing_portal/sessions");
      } finally {
        globalThis.fetch = orig;
      }
    });
  });
});

describe("Stripe webhook event interpretation", () => {
  it("upgrades from checkout.session.completed metadata", () => {
    const action = interpretStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          payment_status: "paid",
          client_reference_id: USER,
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { userId: USER, plan: "starter" },
        },
      },
    });
    assert.deepEqual(action, {
      userId: USER,
      plan: "starter",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      email: null,
      resetQuota: true,
      mail: "thanks",
    });
  });
  it("prefers the live price id over stale metadata on subscription.updated", async () => {
    await withPrices(() => {
      const action = interpretStripeEvent({
        type: "customer.subscription.updated",
        data: {
          object: {
            object: "subscription",
            id: "sub_2",
            customer: { id: "cus_2" },
            metadata: { userId: USER, plan: "starter" },
            items: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      });
      assert.equal(action?.plan, "pro");
      assert.equal(action?.customerId, "cus_2");
      assert.equal(action?.subscriptionId, "sub_2");
      assert.equal(action?.resetQuota, false);
    });
  });
  it("drops unpaid checkout and unknown events", () => {
    assert.equal(
      interpretStripeEvent({
        type: "checkout.session.completed",
        data: { object: { payment_status: "unpaid", metadata: { userId: USER, plan: "pro" } } },
      }),
      null,
    );
    assert.equal(interpretStripeEvent({ type: "ping", data: { object: { metadata: { userId: USER } } } }), null);
    assert.equal(
      interpretStripeEvent({
        type: "checkout.session.completed",
        data: { object: { payment_status: "paid", metadata: { plan: "pro" } } },
      }),
      null,
    );
  });
  it("moves cancelled subscriptions to free", () => {
    const action = interpretStripeEvent({
      type: "customer.subscription.deleted",
      data: { object: { object: "subscription", id: "sub_x", metadata: { userId: USER }, customer: "cus_x" } },
    });
    assert.equal(action?.plan, "free");
    assert.equal(action?.userId, USER);
    assert.equal(action?.mail, "ended");
  });
  it("flags invoice.payment_failed without changing the plan apply", () => {
    const action = interpretStripeEvent({
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_x", metadata: { userId: USER } } },
    });
    assert.equal(action?.mail, "failed");
    assert.equal(action?.userId, USER);
    assert.equal(action?.resetQuota, false);
  });
  it("never maps a missing plan to Pro", () => {
    assert.equal(planFromStripePriceId("price_unknown"), null);
    assert.equal(resolveStripePlan({ metadata: {} }), null);
    assert.equal(
      interpretStripeEvent({
        type: "customer.subscription.updated",
        data: { object: { metadata: { userId: USER }, items: { data: [] } } },
      }),
      null,
    );
  });
  it("reads expanded customer and subscription objects", () => {
    assert.equal(stripeCustomerId({ customer: { id: "cus_exp" } }), "cus_exp");
    assert.equal(stripeSubscriptionId({ subscription: { id: "sub_exp" } }), "sub_exp");
    assert.equal(stripeUserId({ metadata: {}, client_reference_id: USER }), USER);
  });
  it("upgrades from invoice.paid via customer, email and price", async () => {
    await withPrices(() => {
      const action = interpretStripeEvent({
        type: "invoice.paid",
        data: {
          object: {
            customer: "cus_inv",
            customer_email: "payer@norf.fi",
            subscription: "sub_inv",
            lines: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      });
      assert.equal(action?.plan, "pro");
      assert.equal(action?.userId, null);
      assert.equal(action?.customerId, "cus_inv");
      assert.equal(action?.subscriptionId, "sub_inv");
      assert.equal(action?.email, "payer@norf.fi");
    });
  });
  it("upgrades from checkout.session.async_payment_succeeded", () => {
    const action = interpretStripeEvent({
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          payment_status: "paid",
          customer: "cus_async",
          customer_email: "async@norf.fi",
          metadata: { plan: "starter", userId: USER },
          subscription: "sub_async",
        },
      },
    });
    assert.equal(action?.plan, "starter");
    assert.equal(action?.userId, USER);
    assert.equal(action?.email, "async@norf.fi");
  });
  it("keeps a paid invoice matchable by email when metadata.userId is missing", async () => {
    await withPrices(() => {
      const action = interpretStripeEvent({
        type: "invoice.payment_succeeded",
        data: {
          object: {
            customer: "cus_no_meta",
            customer_details: { email: "sanna.leppanen@tjkoul.fi" },
            lines: { data: [{ price: { id: "price_starter_test" } }] },
          },
        },
      });
      assert.equal(action?.plan, "starter");
      assert.equal(action?.userId, null);
      assert.equal(action?.email, "sanna.leppanen@tjkoul.fi");
    });
  });
});
