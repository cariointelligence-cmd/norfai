import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveStripePlan, type PlanId } from "./platform.ts";

export function verifyStripeSignature(raw: string, header: string, secret: string): boolean {
  const v1s: string[] = [];
  let t = "";
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    if (k === "v1" && v) v1s.push(v);
  }
  if (!t || !v1s.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 60 * 5) return false;
  const digest = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const a = Buffer.from(digest, "utf8");
  for (const v1 of v1s) {
    try {
      const b = Buffer.from(v1, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* skip malformed */
    }
  }
  return false;
}

export function stripeCustomerId(obj: Record<string, unknown>): string | null {
  const c = obj.customer;
  if (typeof c === "string" && c) return c;
  if (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string") {
    return (c as { id: string }).id;
  }
  return null;
}

export function stripeSubscriptionId(obj: Record<string, unknown>): string | null {
  const sub = obj.subscription;
  if (typeof sub === "string" && sub) return sub;
  if (sub && typeof sub === "object" && typeof (sub as { id?: unknown }).id === "string") {
    return (sub as { id: string }).id;
  }
  if (typeof obj.id === "string" && String(obj.object ?? "") === "subscription") return obj.id;
  const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  const nested = parent?.subscription_details?.subscription;
  if (typeof nested === "string" && nested) return nested;
  return null;
}

function metaUserId(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const u = (meta as { userId?: unknown }).userId;
  if (typeof u === "string" && u.trim()) return u.trim();
  return undefined;
}

export function stripeUserId(obj: Record<string, unknown>): string | undefined {
  const direct = metaUserId(obj.metadata);
  if (direct) return direct;
  if (typeof obj.client_reference_id === "string" && obj.client_reference_id.trim()) {
    return obj.client_reference_id.trim();
  }
  const sub = obj.subscription;
  if (sub && typeof sub === "object") {
    const u = metaUserId((sub as { metadata?: unknown }).metadata);
    if (u) return u;
  }
  const details = (obj.subscription_details ?? (obj.parent as { subscription_details?: unknown } | undefined)?.subscription_details) as { metadata?: unknown } | undefined;
  const fromDetails = metaUserId(details?.metadata);
  if (fromDetails) return fromDetails;
  const line = (obj.lines as { data?: Array<{ metadata?: unknown }> } | undefined)?.data?.[0];
  const fromLine = metaUserId(line?.metadata);
  if (fromLine) return fromLine;
  return undefined;
}

export function stripeEmail(obj: Record<string, unknown>): string | null {
  if (typeof obj.customer_email === "string" && obj.customer_email.includes("@")) {
    return obj.customer_email.toLowerCase().trim();
  }
  const details = obj.customer_details as { email?: unknown } | undefined;
  if (typeof details?.email === "string" && details.email.includes("@")) {
    return details.email.toLowerCase().trim();
  }
  if (typeof obj.receipt_email === "string" && obj.receipt_email.includes("@")) {
    return obj.receipt_email.toLowerCase().trim();
  }
  return null;
}

export type StripeApply = {
  userId: string | null;
  plan: PlanId;
  customerId: string | null;
  subscriptionId: string | null;
  email: string | null;
  resetQuota: boolean;
  mail?: "thanks" | "ended" | "failed";
};

const PAID_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "invoice.paid",
  "invoice.payment_succeeded",
]);

export function interpretStripeEvent(event: {
  type?: string;
  data?: { object?: Record<string, unknown> };
}): StripeApply | null {
  const obj = event.data?.object ?? {};
  const kind = (obj.metadata as { kind?: unknown } | undefined)?.kind;
  if (kind === "credits") return null;
  const userId = stripeUserId(obj) ?? null;
  const customerId = stripeCustomerId(obj);
  const subscriptionId = stripeSubscriptionId(obj);
  const email = stripeEmail(obj);
  if (event.type === "customer.subscription.deleted") {
    if (!userId && !customerId && !email) return null;
    return { userId, plan: "free", customerId, subscriptionId, email, resetQuota: false, mail: "ended" };
  }
  if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
    if (!userId && !customerId && !email) return null;
    return { userId, plan: "free", customerId, subscriptionId, email, resetQuota: false, mail: "failed" };
  }
  if (!event.type || !PAID_EVENTS.has(event.type)) return null;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const paid = obj.payment_status;
    const status = obj.status;
    if (paid && paid !== "paid" && paid !== "no_payment_required") return null;
    if (!paid && status && status !== "complete") return null;
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const status = typeof obj.status === "string" ? obj.status : "";
    if (status === "incomplete" || status === "incomplete_expired" || status === "canceled") {
      if (status === "canceled") {
        if (!userId && !customerId) return null;
        return { userId, plan: "free", customerId, subscriptionId, email, resetQuota: false, mail: "ended" };
      }
      return null;
    }
  }
  const plan = resolveStripePlan(obj);
  if (!plan || plan === "free") return null;
  if (!userId && !customerId && !email) return null;
  const resetQuota =
    event.type.startsWith("checkout.session.") ||
    event.type === "customer.subscription.created" ||
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_succeeded";
  return { userId, plan, customerId, subscriptionId, email, resetQuota, mail: "thanks" };
}

export function signStripePayload(raw: string, secret: string, ts = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return `t=${ts},v1=${digest}`;
}
