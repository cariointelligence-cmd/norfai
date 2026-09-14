import type { Sql } from "@/lib/db";

/** Paid add-on credits. 1 credit = €0.30 ≈ 2–5 extra leads. Minimum purchase €39. */

export const CREDIT_CENTS = 30;
export const CREDIT_MIN_EUR = 39;
export const CREDIT_MIN_CENTS = CREDIT_MIN_EUR * 100;
export const CREDIT_MIN_QTY = Math.ceil(CREDIT_MIN_CENTS / CREDIT_CENTS);
export const CREDIT_MAX_QTY = 20_000;
export const LEADS_PER_CREDIT_MIN = 2;
export const LEADS_PER_CREDIT_MAX = 5;
export const LEADS_PER_CREDIT = 3;

export function parseCreditQuantity(raw: unknown): { ok: true; credits: number; amountCents: number } | { ok: false; error: string } {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < CREDIT_MIN_QTY) {
    return { ok: false, error: `Minimum purchase is €${CREDIT_MIN_EUR} (${CREDIT_MIN_QTY} credits).` };
  }
  if (n > CREDIT_MAX_QTY) return { ok: false, error: `Maximum is ${CREDIT_MAX_QTY} credits per purchase.` };
  return { ok: true, credits: n, amountCents: n * CREDIT_CENTS };
}

export function leadsFromCredits(credits: number): number {
  return Math.max(0, Math.floor(credits)) * LEADS_PER_CREDIT;
}

export function searchesFromCredits(credits: number): number {
  const n = Math.max(0, Math.floor(credits));
  return Math.max(n > 0 ? 1 : 0, Math.ceil(n / LEADS_PER_CREDIT));
}

export function creditsFromPaidCents(amountCents: unknown): { ok: true; credits: number; amountCents: number } | { ok: false; error: string } {
  const paid = Math.floor(Number(amountCents));
  if (!Number.isFinite(paid) || paid < CREDIT_MIN_CENTS) return { ok: false, error: "Below minimum" };
  if (paid % CREDIT_CENTS !== 0) return { ok: false, error: "Amount is not a credit multiple" };
  const credits = paid / CREDIT_CENTS;
  if (credits < CREDIT_MIN_QTY || credits > CREDIT_MAX_QTY) return { ok: false, error: "Quantity out of range" };
  return { ok: true, credits, amountCents: paid };
}

export type CreditApply = {
  userId: string;
  credits: number;
  amountCents: number;
  sessionId: string;
  customerId: string | null;
};

export function interpretStripeCreditEvent(event: {
  type?: string;
  data?: { object?: Record<string, unknown> };
}): CreditApply | null {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return null;
  }
  const obj = event.data?.object ?? {};
  const meta = (obj.metadata ?? {}) as Record<string, unknown>;
  if (String(meta.kind ?? "") !== "credits") return null;
  if (obj.mode && obj.mode !== "payment") return null;
  const paid = obj.payment_status;
  const status = obj.status;
  if (paid && paid !== "paid" && paid !== "no_payment_required") return null;
  if (!paid && status && status !== "complete") return null;
  const parsed = creditsFromPaidCents(obj.amount_total);
  if (!parsed.ok) return null;
  const userId =
    (typeof meta.userId === "string" && meta.userId.trim()) ||
    (typeof obj.client_reference_id === "string" && obj.client_reference_id.trim()) ||
    "";
  if (!userId || userId.length > 128) return null;
  const sessionId = typeof obj.id === "string" ? obj.id.slice(0, 128) : "";
  if (!sessionId.startsWith("cs_")) return null;
  const customer = obj.customer;
  const customerId = typeof customer === "string" ? customer : null;
  return {
    userId,
    credits: parsed.credits,
    amountCents: parsed.amountCents,
    sessionId,
    customerId,
  };
}

export function buildStripeCreditCheckoutForm(opts: {
  userId: string;
  email?: string | null;
  origin: string;
  credits: unknown;
  customerId?: string | null;
}): { ok: true; secret: string; body: URLSearchParams; credits: number; amountCents: number } | { ok: false; error: string } {
  const qty = parseCreditQuantity(opts.credits);
  if (!qty.ok) return qty;
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "Stripe is not connected yet." };
  if (!secret.startsWith("sk_")) return { ok: false, error: "STRIPE_SECRET_KEY must be a Stripe secret key." };
  const body = new URLSearchParams({
    mode: "payment",
    locale: "fi",
    success_url: `${opts.origin}/billing?credits=success`,
    cancel_url: `${opts.origin}/billing?credits=cancel`,
    client_reference_id: opts.userId,
    "line_items[0][quantity]": String(qty.credits),
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(CREDIT_CENTS),
    "line_items[0][price_data][product_data][name]": "Norf credits",
    "line_items[0][price_data][product_data][description]": "Extra searches and leads. One credit is typically 2–5 leads.",
    "payment_intent_data[metadata][kind]": "credits",
    "payment_intent_data[metadata][userId]": opts.userId,
    "payment_intent_data[metadata][credits]": String(qty.credits),
    "metadata[kind]": "credits",
    "metadata[userId]": opts.userId,
    "metadata[credits]": String(qty.credits),
    "metadata[amount_cents]": String(qty.amountCents),
  });
  if (opts.customerId) body.set("customer", opts.customerId);
  else if (opts.email) body.set("customer_email", opts.email);
  return { ok: true, secret, body, credits: qty.credits, amountCents: qty.amountCents };
}

export async function createStripeCreditCheckout(opts: {
  userId: string;
  email?: string | null;
  origin: string;
  credits: unknown;
  customerId?: string | null;
}): Promise<{ ok: true; url: string; credits: number; amountCents: number } | { ok: false; error: string }> {
  const built = buildStripeCreditCheckoutForm(opts);
  if (!built.ok) return built;
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${built.secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: built.body,
  });
  const json = await res.json() as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) return { ok: false, error: json.error?.message ?? "Stripe checkout failed" };
  return { ok: true, url: json.url, credits: built.credits, amountCents: built.amountCents };
}

export async function applyPaidCredits(
  sql: Sql,
  grant: CreditApply,
): Promise<{ ok: true; duplicate: boolean; leads: number; searches: number } | { ok: false; error: string }> {
  const leads = leadsFromCredits(grant.credits);
  const searches = searchesFromCredits(grant.credits);
  try {
    await sql.query(`create table if not exists stripe_credit_grants (
      session_id text primary key,
      user_id text not null,
      credits integer not null,
      amount_cents integer not null,
      leads integer not null,
      searches integer not null,
      created_at timestamptz not null default now()
    )`);
  } catch { /* */ }
  try {
    const inserted = await sql<{ session_id: string }>`
      insert into stripe_credit_grants (session_id, user_id, credits, amount_cents, leads, searches)
      values (${grant.sessionId}, ${grant.userId}, ${grant.credits}, ${grant.amountCents}, ${leads}, ${searches})
      on conflict (session_id) do nothing
      returning session_id`;
    if (!inserted[0]) return { ok: true, duplicate: true, leads, searches };
  } catch {
    return { ok: false, error: "Could not record credit purchase" };
  }
  try {
    await sql`update workspaces set
      bonus_searches = coalesce(bonus_searches, 0) + ${searches},
      bonus_leads = coalesce(bonus_leads, 0) + ${leads},
      stripe_customer_id = coalesce(${grant.customerId}, stripe_customer_id),
      updated_at = now()
      where user_id = ${grant.userId}`;
  } catch {
    return { ok: false, error: "Could not apply credits" };
  }
  return { ok: true, duplicate: false, leads, searches };
}
