import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_MIN_QTY,
  CREDIT_MIN_CENTS,
  CREDIT_CENTS,
  parseCreditQuantity,
  creditsFromPaidCents,
  interpretStripeCreditEvent,
  leadsFromCredits,
  searchesFromCredits,
  buildStripeCreditCheckoutForm,
} from "./credits.ts";
import { interpretStripeEvent } from "./stripe-webhook.ts";

const USER = "user_credits";

describe("credit purchase rules", () => {
  it("rejects below €39 and accepts 130 credits at €39.00", () => {
    assert.equal(CREDIT_MIN_QTY, 130);
    assert.equal(CREDIT_MIN_CENTS, 3900);
    assert.equal(parseCreditQuantity(129).ok, false);
    assert.equal(parseCreditQuantity(0).ok, false);
    assert.equal(parseCreditQuantity("abc").ok, false);
    const ok = parseCreditQuantity(130);
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.credits, 130);
      assert.equal(ok.amountCents, 3900);
    }
    assert.equal(leadsFromCredits(130), 390);
    assert.equal(searchesFromCredits(130), 44);
  });

  it("derives credits from Stripe amount_total, never from client claims", () => {
    assert.equal(creditsFromPaidCents(3899).ok, false);
    assert.equal(creditsFromPaidCents(3901).ok, false);
    const ok = creditsFromPaidCents(3900);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.credits, 130);
  });

  it("grants from a paid credit session and ignores unpaid or plan-shaped credit events", () => {
    const paid = interpretStripeCreditEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_paid",
          mode: "payment",
          payment_status: "paid",
          amount_total: 3900,
          client_reference_id: USER,
          customer: "cus_c",
          metadata: { kind: "credits", userId: USER, credits: "99999" },
        },
      },
    });
    assert.equal(paid?.credits, 130);
    assert.equal(paid?.userId, USER);
    assert.equal(
      interpretStripeCreditEvent({
        type: "checkout.session.completed",
        data: { object: { id: "cs_x", payment_status: "unpaid", amount_total: 3900, metadata: { kind: "credits", userId: USER } } },
      }),
      null,
    );
    assert.equal(
      interpretStripeEvent({
        type: "checkout.session.completed",
        data: {
          object: {
            payment_status: "paid",
            amount_total: 3900,
            metadata: { kind: "credits", userId: USER, plan: "unlimited" },
          },
        },
      }),
      null,
    );
  });

  it("builds a one-time payment session with server-side unit amount", () => {
    const prev = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_norf";
    try {
      const form = buildStripeCreditCheckoutForm({
        userId: USER,
        email: "a@b.fi",
        origin: "https://www.norfai.com",
        credits: 130,
      });
      assert.equal(form.ok, true);
      if (!form.ok) return;
      const body = form.body.toString();
      assert.match(body, /mode=payment/);
      assert.match(body, /unit_amount%5D=30/);
      assert.match(body, /quantity%5D=130/);
      assert.match(body, /kind%5D=credits/);
      assert.equal(body.includes("mode=subscription"), false);
    } finally {
      if (prev === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = prev;
    }
  });
});
