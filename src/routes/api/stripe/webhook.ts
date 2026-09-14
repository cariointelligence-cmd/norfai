import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { applyStripeSubscription, ensurePlatformSchema, stripeEnv } from "@/lib/norr/platform";
import { interpretStripeEvent, verifyStripeSignature } from "@/lib/norr/stripe-webhook";
import { applyPaidCredits, interpretStripeCreditEvent } from "@/lib/norr/credits";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = stripeEnv("STRIPE_WEBHOOK_SECRET");
        if (!secret) {
          return new Response("webhook not configured", { status: 503 });
        }
        const raw = await request.text();
        const sig = request.headers.get("stripe-signature") ?? "";
        if (!sig || !verifyStripeSignature(raw, sig, secret)) {
          return new Response("invalid signature", { status: 400 });
        }
        let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
        try {
          event = JSON.parse(raw) as typeof event;
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const sql = await getSql();
        await ensurePlatformSchema(sql);
        if (event.id) {
          try {
            const seen = await sql<{ id: string }>`select id from stripe_events where id = ${event.id} limit 1`;
            if (seen[0]) {
              return new Response(JSON.stringify({ received: true, duplicate: true }), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
            }
          } catch {
            /* table catch-up: still apply */
          }
        }
        const credit = interpretStripeCreditEvent(event);
        if (credit) {
          const applied = await applyPaidCredits(sql, credit);
          if (!applied.ok) console.error("[norf] stripe credits", applied.error);
        } else {
        const action = interpretStripeEvent(event);
        if (action) {
          let userId = action.userId;
          if (!userId && action.customerId) {
            try {
              const row = await sql<{ user_id: string }>`
                select user_id from workspaces where stripe_customer_id = ${action.customerId} limit 1`;
              userId = row[0]?.user_id ?? null;
            } catch {
              userId = null;
            }
          }
          if (!userId && action.email) {
            try {
              const row = await sql<{ id: string }>`
                select id from "user" where lower(email) = ${action.email} limit 1`;
              userId = row[0]?.id ?? null;
            } catch {
              userId = null;
            }
          }
          if (!userId) {
            console.error("[norf] stripe webhook unmatched", event.type, action.customerId, action.email);
            return new Response(JSON.stringify({ received: true, unmatched: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (action.mail === "failed") {
            try {
              const { queueBillingFailed } = await import("@/lib/norr/mail-automations.ts");
              await queueBillingFailed(sql, userId);
            } catch (err) {
              console.error("[norf] billing failed mail", err);
            }
          } else {
            await applyStripeSubscription(sql, userId, action.plan, action.customerId, action.subscriptionId, action.resetQuota);
          }
        }
        }
        if (event.id) {
          try {
            await sql`insert into stripe_events (id, type, payload) values (${event.id}, ${event.type ?? "unknown"}, ${raw}::jsonb) on conflict do nothing`;
          } catch {
            /* ack even if the log row fails; apply already happened */
          }
        }
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  },
});
