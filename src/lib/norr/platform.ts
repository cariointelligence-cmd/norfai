import type { Sql } from "@/lib/db";
import { nid } from "../utils.ts";
import { remainingCompanySlots } from "./quota.ts";

export const SEED_ADMIN_EMAILS = ["cariointelligence@gmail.com", "tajubusiness@gmail.com"] as const;

/** One-run safety ceiling. Unlimited / admin have no product cap; this keeps a single search finite. */
export const ENGINE_SEARCH_CEILING = 10_000;

export const PLANS = {
  free: {
    id: "free" as const,
    label: "Free",
    searchesPerMonth: 50,
    priceEur: 0,
    companies: 400,
    companiesPerMonth: 50,
    perSearch: 50,
    unlimited: false,
    stripePriceEnv: null as string | null,
  },
  starter: {
    id: "starter" as const,
    label: "Starter",
    searchesPerMonth: 1000,
    priceEur: 149,
    companies: 15000,
    companiesPerMonth: 1500,
    perSearch: 200,
    unlimited: false,
    stripePriceEnv: "STRIPE_PRICE_STARTER" as string | null,
  },
  pro: {
    id: "pro" as const,
    label: "Pro",
    searchesPerMonth: 5000,
    priceEur: 449,
    companies: 60000,
    companiesPerMonth: 5000,
    perSearch: 300,
    unlimited: false,
    stripePriceEnv: "STRIPE_PRICE_PRO",
  },
  unlimited: {
    id: "unlimited" as const,
    label: "Unlimited",
    searchesPerMonth: -1,
    priceEur: 990,
    companies: -1,
    companiesPerMonth: -1,
    perSearch: -1,
    unlimited: true,
    stripePriceEnv: "STRIPE_PRICE_UNLIMITED",
  },
};

export type PlanId = keyof typeof PLANS;
export type PaidPlanId = Exclude<PlanId, "free">;

export function teamSeatCap(plan: PlanId, isAdmin: boolean): number {
  if (isAdmin) return 50;
  if (plan === "unlimited") return 25;
  if (plan === "pro") return 10;
  if (plan === "starter") return 3;
  return 1;
}

const LEGACY_PLANS: Record<string, PlanId> = {
  free: "free",
  scale: "unlimited",
  starter: "starter",
  pro: "pro",
  unlimited: "unlimited",
};

export function normalizePlanId(raw: string | null | undefined): PlanId {
  const key = (raw ?? "free").toLowerCase().trim();
  return LEGACY_PLANS[key] ?? "free";
}

export function isUnlimitedQuota(limit: number): boolean {
  return !Number.isFinite(limit) || limit < 0;
}

export function formatSearchQuota(limit: number): string {
  return isUnlimitedQuota(limit) ? "Unlimited" : String(limit);
}

export function clampRequestedLeads(requested: number | undefined, planCap: number, fallback = 100): number {
  const raw = Number(requested);
  const n = Number.isFinite(raw) ? Math.trunc(raw) : fallback;
  const floor = Math.max(1, n);
  if (isUnlimitedQuota(planCap)) return Math.min(floor, ENGINE_SEARCH_CEILING);
  return Math.min(floor, Math.max(1, planCap));
}

export function searchesLimitFor(plan: PlanId, isAdmin: boolean): number {
  if (isAdmin) return -1;
  const spec = PLANS[plan];
  if (!spec || spec.unlimited) return -1;
  return spec.searchesPerMonth;
}

export function companiesLimitFor(plan: PlanId, isAdmin: boolean): number {
  if (isAdmin) return -1;
  const spec = PLANS[plan];
  if (!spec || spec.unlimited || spec.companies < 0) return -1;
  return spec.companies;
}

export function companiesPerMonthFor(plan: PlanId, isAdmin: boolean): number {
  if (isAdmin) return -1;
  const spec = PLANS[plan];
  if (!spec || spec.unlimited || spec.companiesPerMonth < 0) return -1;
  return spec.companiesPerMonth;
}

export function perSearchLimitFor(plan: PlanId, isAdmin: boolean): number {
  if (isAdmin) return -1;
  const spec = PLANS[plan];
  if (!spec || spec.unlimited) return -1;
  return spec.perSearch;
}

/** Face helper: never treat admin / unlimited as Free's 50-company chip. */
export function perSearchFromBoot(boot: { perSearch?: number; isAdmin?: boolean; plan?: string } | null | undefined): number {
  if (typeof boot?.perSearch === "number" && Number.isFinite(boot.perSearch)) return boot.perSearch;
  return perSearchLimitFor(normalizePlanId(boot?.plan), Boolean(boot?.isAdmin));
}

export function quotaError(plan: PlanId, kind: "search" | "total" | "monthly", cap: number): string {
  const label = PLANS[plan]?.label ?? plan;
  if (kind === "search") {
    return `Search quota reached for the ${label} plan (${cap}/month). Existing companies are kept. Upgrade to continue.`;
  }
  if (kind === "monthly") {
    return `Monthly company quota reached for the ${label} plan (${cap} new companies this period). Existing companies are kept. Upgrade to continue.`;
  }
  return `Company storage reached for the ${label} plan (${cap}). Existing companies are kept. Upgrade to continue.`;
}

export async function lookupUserEmail(sql: Sql, userId: string): Promise<string | null> {
  try {
    const rows = await sql<{ email: string }>`select email from "user" where id = ${userId} limit 1`;
    return rows[0]?.email?.toLowerCase().trim() ?? null;
  } catch {
    return null;
  }
}

/** Idempotent. Makes login work even if 0004 did not apply on the hosted database. */
export async function ensurePlatformSchema(sql: Sql): Promise<void> {
  try {
    await sql.query("alter table workspaces add column if not exists plan text not null default 'free'");
    await sql.query("alter table workspaces add column if not exists plan_period_start timestamptz not null default now()");
    await sql.query("alter table workspaces add column if not exists searches_used integer not null default 0");
    await sql.query("alter table workspaces add column if not exists stripe_customer_id text");
    await sql.query("alter table workspaces add column if not exists stripe_subscription_id text");
    await sql.query("alter table workspaces add column if not exists locale text not null default 'fi'");
    await sql.query("alter table workspaces add column if not exists plan_source text not null default 'self'");
    await sql.query("alter table workspaces add column if not exists gifted_by text");
    await sql.query("alter table workspaces add column if not exists gifted_at timestamptz");
    await sql.query(`create table if not exists platform_admins (
      user_id text primary key,
      email text not null unique,
      role text not null default 'admin',
      granted_by text,
      created_at timestamptz not null default now()
    )`);
    await sql.query("create index if not exists platform_admins_email_idx on platform_admins (email)");
    await sql.query(`create table if not exists admin_invites (
      email text primary key,
      granted_by text not null,
      created_at timestamptz not null default now()
    )`);
    await sql.query(`create table if not exists blog_posts (
      id text primary key,
      slug text not null unique,
      locale text not null default 'fi',
      title text not null,
      excerpt text not null default '',
      body text not null,
      seo_title text,
      seo_description text,
      status text not null default 'draft',
      author_id text,
      source text not null default 'human',
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
    await sql.query("create index if not exists blog_posts_pub_idx on blog_posts (status, published_at desc)");
    await sql.query("create index if not exists blog_posts_locale_idx on blog_posts (locale, status)");
    await sql.query(`create table if not exists blog_auto_state (
      id text primary key default 'default',
      day date,
      published_today integer not null default 0,
      last_run_at timestamptz
    )`);
    await sql.query(`insert into blog_auto_state (id, day, published_today) values ('default', null, 0) on conflict (id) do nothing`);
    await sql.query(`create table if not exists stripe_events (
      id text primary key,
      type text not null,
      payload jsonb not null default '{}',
      created_at timestamptz not null default now()
    )`);
    const { ensureSeoSchema } = await import("../seo/store.ts");
    await ensureSeoSchema(sql);
  } catch (err) {
    console.error("[norf] platform schema", err);
  }
}

export async function seedAdminsRegistered(sql: Sql): Promise<number> {
  try {
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from platform_admins
      where lower(email) in (${SEED_ADMIN_EMAILS[0]}, ${SEED_ADMIN_EMAILS[1]})`;
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function seedSignupOpen(sql: Sql): Promise<boolean> {
  return (await seedAdminsRegistered(sql)) < 2;
}

export async function isPlatformAdmin(sql: Sql, userId: string): Promise<boolean> {
  try {
    const rows = await sql`select user_id from platform_admins where user_id = ${userId} limit 1`;
    if (rows[0]) return true;
    const email = await lookupUserEmail(sql, userId);
    return Boolean(email && (SEED_ADMIN_EMAILS as readonly string[]).includes(email));
  } catch {
    return false;
  }
}

const FALLBACK_IDENTITY = {
  isAdmin: false,
  email: null as string | null,
  seedOpen: true,
  plan: "free" as PlanId,
  searchesUsed: 0,
  searchesLimit: PLANS.free.searchesPerMonth,
};

/** Hot-path identity: no schema DDL. Admin seed emails are unlimited. */
export async function readPlatformIdentity(sql: Sql, userId: string) {
  try {
    const email = await lookupUserEmail(sql, userId);
    const seeded = Boolean(email && (SEED_ADMIN_EMAILS as readonly string[]).includes(email));
    let isAdmin = seeded;
    if (!isAdmin) {
      try {
        isAdmin = Boolean((await sql`select user_id from platform_admins where user_id = ${userId} limit 1`)[0]);
      } catch {
        isAdmin = false;
      }
    }
    let plan: PlanId = isAdmin ? "unlimited" : "free";
    let used = 0;
    try {
      const ws = await sql<{ plan: string; searches_used: number }>`
        select plan, searches_used from workspaces where user_id = ${userId} limit 1`;
      if (!isAdmin) plan = normalizePlanId(ws[0]?.plan);
      used = Number(ws[0]?.searches_used ?? 0);
    } catch { /* defaults */ }
    return {
      isAdmin,
      email,
      seedOpen: true,
      plan,
      searchesUsed: used,
      searchesLimit: searchesLimitFor(plan, isAdmin),
    };
  } catch {
    return { ...FALLBACK_IDENTITY };
  }
}

export async function ensurePlatformIdentity(sql: Sql, userId: string) {
  try {
    await ensurePlatformSchema(sql);
    const email = await lookupUserEmail(sql, userId);
    if (email && (SEED_ADMIN_EMAILS as readonly string[]).includes(email)) {
      await sql`
        insert into platform_admins (user_id, email, role, granted_by)
        values (${userId}, ${email}, ${"owner"}, ${"seed"})
        on conflict (user_id) do nothing`;
    }
    if (email) {
      try {
        if ((await sql`select email from admin_invites where lower(email) = ${email} limit 1`)[0]) {
          await sql`
            insert into platform_admins (user_id, email, role, granted_by)
            values (${userId}, ${email}, ${"admin"}, ${"invite"})
            on conflict (user_id) do nothing`;
        }
      } catch {
        /* invite table may be missing on first boot */
      }
    }
    const isAdmin = await isPlatformAdmin(sql, userId);
    let plan: PlanId = "free";
    let used = 0;
    try {
      const ws = await sql<{ plan: string; plan_period_start: string; searches_used: number }>`
        select plan, plan_period_start, searches_used from workspaces where user_id = ${userId} limit 1`;
      plan = normalizePlanId(ws[0]?.plan);
      const period = ws[0]?.plan_period_start ? new Date(ws[0].plan_period_start) : new Date();
      const monthAgo = Date.now() - 32 * 24 * 3600 * 1000;
      used = ws[0]?.searches_used ?? 0;
      if (period.getTime() < monthAgo) {
        used = 0;
        await sql`update workspaces set searches_used = 0, plan_period_start = now(), updated_at = now() where user_id = ${userId}`;
      }
    } catch {
      plan = "free";
      used = 0;
    }
    if (isAdmin && plan !== "unlimited") {
      try {
        await sql`update workspaces set plan = ${"unlimited"}, updated_at = now() where user_id = ${userId}`;
      } catch {
        /* keep current plan if the column is missing */
      }
      plan = "unlimited";
    }
    return {
      isAdmin,
      email,
      seedOpen: await seedSignupOpen(sql),
      plan,
      searchesUsed: used,
      searchesLimit: searchesLimitFor(plan, isAdmin),
    };
  } catch (err) {
    console.error("[norf] identity", err);
    return { ...FALLBACK_IDENTITY };
  }
}

export async function assertSearchQuota(sql: Sql, userId: string, cost = 1): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await ensurePlatformIdentity(sql, userId);
  if (id.isAdmin || isUnlimitedQuota(id.searchesLimit)) return { ok: true };
  const units = Math.max(1, Math.min(10, Math.floor(cost)));
  try {
    const row = await sql`
      update workspaces
      set searches_used = searches_used + ${units}, updated_at = now()
      where user_id = ${userId} and searches_used + ${units} <= ${id.searchesLimit}
      returning searches_used`;
    if (!row[0]) {
      try {
        const { queueQuotaMail } = await import("./mail-automations.ts");
        await queueQuotaMail(sql, userId, "search");
      } catch {
        /* mail is best-effort */
      }
      return { ok: false, error: quotaError(id.plan, "search", id.searchesLimit) };
    }
    const used = Number((row[0] as { searches_used?: number }).searches_used ?? 0);
    if (id.searchesLimit > 0) {
      try {
        const { queueQuotaMail } = await import("./mail-automations.ts");
        if (used >= id.searchesLimit) await queueQuotaMail(sql, userId, "search");
        else if (used >= Math.ceil(id.searchesLimit * 0.8)) await queueQuotaMail(sql, userId, "nudge80");
      } catch {
        /* mail is best-effort */
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/column|does not exist|undefined/i.test(msg)) return { ok: true };
    console.error("[norf] quota", msg);
    return { ok: false, error: "Quota service unavailable. Try again shortly." };
  }
  return { ok: true };
}

export async function refundSearchQuota(sql: Sql, userId: string, cost = 1): Promise<void> {
  const units = Math.max(1, Math.min(10, Math.floor(cost)));
  try {
    await sql`
      update workspaces
      set searches_used = greatest(0, searches_used - ${units}), updated_at = now()
      where user_id = ${userId}`;
  } catch {
    /* preview schema */
  }
}

export async function companyUsage(sql: Sql, userId: string): Promise<{
  stored: number;
  storedThisPeriod: number;
  periodStart: string | null;
  counted: boolean;
}> {
  try {
    const ws = await sql<{ plan_period_start: string | null }>`
      select plan_period_start from workspaces where user_id = ${userId} limit 1`;
    const periodStart = ws[0]?.plan_period_start ?? null;
    const stored = (await sql<{ n: number }>`
      select count(*)::int as n from companies where user_id = ${userId} and deleted_at is null`)[0]?.n ?? 0;
    let storedThisPeriod = stored;
    if (periodStart) {
      storedThisPeriod = (await sql<{ n: number }>`
        select count(*)::int as n from companies
        where user_id = ${userId} and deleted_at is null and created_at >= ${periodStart}`)[0]?.n ?? stored;
    }
    return { stored, storedThisPeriod, periodStart, counted: true };
  } catch {
    return { stored: 0, storedThisPeriod: 0, periodStart: null, counted: false };
  }
}

export async function assertCompanyQuota(sql: Sql, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await ensurePlatformIdentity(sql, userId);
  const totalCap = companiesLimitFor(id.plan, id.isAdmin);
  const monthlyCap = companiesPerMonthFor(id.plan, id.isAdmin);
  if (isUnlimitedQuota(totalCap) && isUnlimitedQuota(monthlyCap)) return { ok: true };
  const usage = await companyUsage(sql, userId);
  const slots = remainingCompanySlots({
    totalCap,
    monthlyCap,
    perSearch: perSearchLimitFor(id.plan, id.isAdmin),
    stored: usage.stored,
    storedThisPeriod: usage.storedThisPeriod,
  });
  if (slots.blocked === "monthly") return { ok: false, error: quotaError(id.plan, "monthly", monthlyCap) };
  if (slots.blocked === "total") return { ok: false, error: quotaError(id.plan, "total", totalCap) };
  return { ok: true };
}

export function stripeEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function stripePriceIdForPlan(plan: PlanId): string | undefined {
  const key = PLANS[plan].stripePriceEnv;
  if (!key) return undefined;
  return stripeEnv(key) || (plan === "unlimited" ? stripeEnv("STRIPE_PRICE_SCALE") : undefined);
}

export function stripeCheckoutReady(): boolean {
  return Boolean(
    stripeEnv("STRIPE_SECRET_KEY")
      && stripePriceIdForPlan("starter")
      && stripePriceIdForPlan("pro")
      && stripePriceIdForPlan("unlimited"),
  );
}

export function planFromStripePriceId(priceId: string | null | undefined): PlanId | null {
  const raw = priceId?.trim();
  if (!raw) return null;
  for (const plan of ["starter", "pro", "unlimited"] as const) {
    const id = stripePriceIdForPlan(plan);
    if (id && id === raw) return plan;
  }
  return null;
}

export function stripePlanFromMetadata(meta: Record<string, unknown> | null | undefined): PlanId | null {
  const raw = typeof meta?.plan === "string" ? meta.plan.toLowerCase().trim() : "";
  if (raw === "starter" || raw === "pro" || raw === "unlimited" || raw === "free") return raw;
  if (raw === "scale") return "unlimited";
  return null;
}

function priceIdFromStripeObject(obj: Record<string, any>): string | null {
  const price = obj.items?.data?.[0]?.price;
  if (typeof price === "string" && price) return price;
  if (price && typeof price === "object" && typeof price.id === "string") return price.id;
  const linePrice = obj.lines?.data?.[0]?.price;
  if (typeof linePrice === "string" && linePrice) return linePrice;
  if (linePrice && typeof linePrice === "object" && typeof linePrice.id === "string") return linePrice.id;
  return null;
}

/** Price id wins (portal upgrades). Metadata is the checkout fallback. Never default to Pro. */
export function resolveStripePlan(obj: Record<string, any>): PlanId | null {
  const fromPrice = planFromStripePriceId(priceIdFromStripeObject(obj));
  if (fromPrice) return fromPrice;
  return stripePlanFromMetadata(obj.metadata ?? {});
}

export function resolveCheckoutOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host) return null;
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (u.protocol === "http:") {
    if (!local) return null;
    return `http://${host}${u.port && u.port !== "80" ? `:${u.port}` : ""}`;
  }
  if (u.protocol !== "https:") return null;
  if (host.endsWith(".grok.me") || host.endsWith(".grok-sandbox.com")) return `https://${host}`;
  const allowed = new Set<string>();
  const consider = (raw: string | undefined) => {
    if (!raw) return;
    for (const part of raw.split(/[\s,]+/)) {
      try {
        const h = (part.includes("://") ? new URL(part) : new URL(`https://${part}`)).hostname.toLowerCase();
        if (!h || !h.includes(".")) continue;
        allowed.add(h);
        if (h.startsWith("www.")) allowed.add(h.slice(4));
        else allowed.add(`www.${h}`);
      } catch {
        /* skip */
      }
    }
  };
  for (const key of [
    "BETTER_AUTH_URL",
    "BETTER_AUTH_TRUSTED_ORIGINS",
    "VITE_PUBLIC_HOSTNAME",
    "VITE_APP_ORIGIN",
    "APP_URL",
    "SITE_URL",
    "AUTH_URL",
    "PUBLIC_APP_URL",
    "CUSTOM_DOMAIN",
    "APP_DOMAIN",
    "DOMAIN",
    "AUTH_DOMAIN",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ]) consider(process.env[key]);
  allowed.add("norfai.com");
  allowed.add("www.norfai.com");
  if (host === "norfai.com" || host === "www.norfai.com" || host.endsWith(".vercel.app")) {
    return "https://www.norfai.com";
  }
  if (allowed.has(host) || local) return `https://${host}`;
  return null;
}

export async function inviteAdmin(sql: Sql, granterId: string, emailRaw: string) {
  if (!(await isPlatformAdmin(sql, granterId))) return { ok: false as const, error: "Admin only" };
  const email = emailRaw.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "Invalid email" };
  await sql`
    insert into admin_invites (email, granted_by) values (${email}, ${granterId})
    on conflict (email) do update set granted_by = ${granterId}`;
  const existing = await sql`select id from "user" where lower(email) = ${email} limit 1`;
  if (existing[0]) {
    await sql`
      insert into platform_admins (user_id, email, role, granted_by)
      values (${existing[0].id}, ${email}, ${"admin"}, ${granterId})
      on conflict (user_id) do nothing`;
  }
  return { ok: true as const };
}

export async function revokeAdmin(sql: Sql, granterId: string, targetUserId: string) {
  if (!(await isPlatformAdmin(sql, granterId))) return { ok: false as const, error: "Admin only" };
  if (granterId === targetUserId) return { ok: false as const, error: "Cannot revoke yourself" };
  const target = await sql`select email, role from platform_admins where user_id = ${targetUserId}`;
  if (target[0]?.role === "owner") return { ok: false as const, error: "Cannot revoke an owner" };
  await sql`delete from platform_admins where user_id = ${targetUserId}`;
  if (target[0]?.email) await sql`delete from admin_invites where email = ${target[0].email}`;
  return { ok: true as const };
}

export async function requireAdmin(sql: Sql, userId: string): Promise<boolean> {
  return isPlatformAdmin(sql, userId);
}

function slugify(title: string): string {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || nid().slice(0, 8);
}

const BLOG_TOPICS = [
  "Finnish Y-tunnus and how B2B teams verify a company before outreach",
  "Finding the toimitusjohtaja without buying a stale contact database",
  "Why e-invoicing addresses are not sales emails in Finland",
  "Nordic company registers: YTJ, Bronnoysund, CVR compared",
  "How to tell a branch office from a separate legal entity",
  "Published vs inferred vs not found in B2B company data",
  "Construction-sector decision makers in Finland: roles that actually buy",
  "GDPR-safe company research for Nordic sales teams",
  "When a company website is parked or closed, and what that means for outreach",
  "How to find companies with weak websites and enough money to fix them",
];

export async function upsertBlogPost(sql: Sql, input: {
  id?: string;
  slug?: string;
  locale?: string;
  title: string;
  excerpt?: string;
  body: string;
  seoTitle?: string;
  seoDescription?: string;
  status: string;
  authorId?: string | null;
  source?: string;
}) {
  const id = input.id ?? nid();
  let slug = (input.slug || slugify(input.title)).slice(0, 80);
  if ((await sql`select id from blog_posts where slug = ${slug} and id <> ${id} limit 1`)[0]) {
    slug = `${slug}-${id.slice(0, 6)}`;
  }
  const publishedAt = input.status === "published" ? new Date().toISOString() : null;
  await sql`
    insert into blog_posts (
      id, slug, locale, title, excerpt, body, seo_title, seo_description, status, author_id, source, published_at, updated_at
    ) values (
      ${id}, ${slug}, ${input.locale ?? "fi"}, ${input.title}, ${input.excerpt ?? ""}, ${input.body},
      ${input.seoTitle ?? input.title}, ${input.seoDescription ?? input.excerpt ?? ""}, ${input.status},
      ${input.authorId ?? null}, ${input.source ?? "human"}, ${publishedAt}, now()
    )
    on conflict (id) do update set
      slug = excluded.slug,
      locale = excluded.locale,
      title = excluded.title,
      excerpt = excluded.excerpt,
      body = excluded.body,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description,
      status = excluded.status,
      source = excluded.source,
      published_at = coalesce(blog_posts.published_at, excluded.published_at),
      updated_at = now()`;
  return { id, slug };
}

export async function generateBlogPost(sql: Sql, opts: {
  locale?: string;
  topic?: string;
  publish?: boolean;
  authorId?: string | null;
}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "AI is not available" };
  const locale = opts.locale ?? "fi";
  const lang = locale === "sv" ? "Swedish" : locale === "en" ? "English" : "Finnish";
  const used = await sql<{ title: string }>`select title from blog_posts order by created_at desc limit 12`;
  const skip = new Set(used.map((r) => r.title.toLowerCase()));
  const prompt = `Write a factual article for Norf, a Finnish B2B company search product.
Language: ${lang}. Audience: Finnish and Nordic B2B sales.
Topic: ${opts.topic?.trim() || BLOG_TOPICS.find((t) => !skip.has(t.toLowerCase())) || BLOG_TOPICS[Math.floor(Math.random() * BLOG_TOPICS.length)]}
Return ONLY JSON: {"title","excerpt","slug","seoTitle","seoDescription","bodyMarkdown"}
Rules:
- Answer the question in the first paragraph
- Original, factual, no invented statistics, no fake case studies, no guaranteed rankings
- No em dashes. No hype words (revolutionary, unlock, supercharge, seamlessly, cutting-edge)
- Short sentences. Headings with ##. 700 to 1100 words
- slug lowercase ascii hyphens
- Never claim Norf has private data it does not
- Never mention Super SEO or Hyper GEO`;
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "grok-4.5",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 2200,
    }),
  });
  if (!res.ok) return { ok: false as const, error: `xAI API error ${res.status}` };
  const text = (await res.json()).choices?.[0]?.message?.content ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false as const, error: "AI returned no article" };
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false as const, error: "AI JSON parse failed" };
  }
  if (!parsed.title || !parsed.bodyMarkdown) return { ok: false as const, error: "Incomplete article" };
  const { gateContent } = await import("../seo/quality-gate.ts");
  const gate = gateContent({
    title: parsed.title,
    body: parsed.bodyMarkdown,
    excerpt: parsed.excerpt,
    existingTitles: used.map((r) => r.title),
  });
  const publish = Boolean(opts.publish) && gate.ok;
  if (!gate.ok && opts.publish) console.warn("[norf] content gate blocked publish", gate.reasons);
  return {
    ok: true as const,
    ...(await upsertBlogPost(sql, {
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt,
      body: parsed.bodyMarkdown,
      seoTitle: parsed.seoTitle,
      seoDescription: parsed.seoDescription,
      status: publish ? "published" : "draft",
      authorId: opts.authorId ?? null,
      source: "grok",
      locale,
    })),
    title: parsed.title,
    published: publish,
    gate,
  };
}

export async function maybeAutoPublishBlogs(sql: Sql): Promise<number> {
  if (!process.env.XAI_API_KEY) return 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const st = await sql<{ day: string; published_today: number }>`select day, published_today from blog_auto_state where id = ${"default"}`;
    let count = st[0]?.published_today ?? 0;
    if (String(st[0]?.day ?? "") !== today) {
      count = 0;
      await sql`update blog_auto_state set day = ${today}::date, published_today = 0 where id = ${"default"}`;
    }
    if (Math.max(0, 1 - count) <= 0) return 0;
    const last = await sql<{ last_run_at: string | null }>`select last_run_at from blog_auto_state where id = ${"default"}`;
    const lastAt = last[0]?.last_run_at ? new Date(last[0].last_run_at).getTime() : 0;
    if (lastAt && Date.now() - lastAt < 12 * 3600 * 1000) return 0;
    await sql`update blog_auto_state set last_run_at = now() where id = ${"default"}`;
    const loc = ["fi", "en"][count % 2];
    if (!(await generateBlogPost(sql, { locale: loc, publish: false, authorId: null })).ok) return 0;
    await sql`update blog_auto_state set published_today = published_today + 1 where id = ${"default"}`;
    return 1;
  } catch (err) {
    console.error("[norf] auto-blog", err);
    return 0;
  }
}

export function buildStripeCheckoutForm(opts: {
  userId: string;
  email?: string | null;
  plan: string;
  origin: string;
  customerId?: string | null;
}): { ok: true; secret: string; body: URLSearchParams; plan: PlanId } | { ok: false; error: string } {
  const plan = normalizePlanId(opts.plan);
  if (plan === "free" || !PLANS[plan].stripePriceEnv) {
    return { ok: false, error: "Free plan does not use checkout." };
  }
  const secret = stripeEnv("STRIPE_SECRET_KEY");
  const price = stripePriceIdForPlan(plan);
  if (!secret) return { ok: false, error: "Stripe is not connected yet. Add STRIPE_SECRET_KEY to go live." };
  if (!secret.startsWith("sk_")) return { ok: false, error: "STRIPE_SECRET_KEY must be a Stripe secret key (sk_test_ or sk_live_)." };
  if (!price) return { ok: false, error: `Missing Stripe price for ${plan}. Set ${PLANS[plan].stripePriceEnv}.` };
  if (!price.startsWith("price_")) return { ok: false, error: `${PLANS[plan].stripePriceEnv} must be a Stripe Price id (price_…).` };
  const body = new URLSearchParams({
    mode: "subscription",
    locale: "fi",
    success_url: `${opts.origin}/overview?billing=success`,
    cancel_url: `${opts.origin}/pricing?billing=cancel`,
    client_reference_id: opts.userId,
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][userId]": opts.userId,
    "subscription_data[metadata][plan]": plan,
    "metadata[userId]": opts.userId,
    "metadata[plan]": plan,
  });
  if (opts.customerId) body.set("customer", opts.customerId);
  else if (opts.email) body.set("customer_email", opts.email);
  return { ok: true, secret, body, plan };
}

export async function createStripeCheckout(opts: {
  userId: string;
  email?: string | null;
  plan: string;
  origin: string;
  customerId?: string | null;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const built = buildStripeCheckoutForm(opts);
  if (!built.ok) return built;
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${built.secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: built.body,
  });
  const json = await res.json();
  if (!res.ok || !json.url) return { ok: false, error: json.error?.message ?? "Stripe checkout failed" };
  return { ok: true, url: json.url };
}

export async function createStripePortal(opts: {
  customerId: string;
  origin: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const secret = stripeEnv("STRIPE_SECRET_KEY");
  if (!secret) return { ok: false, error: "Stripe is not connected yet." };
  if (!opts.customerId) return { ok: false, error: "No Stripe customer on this workspace yet." };
  const body = new URLSearchParams({ customer: opts.customerId, return_url: `${opts.origin}/billing` });
  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.url) return { ok: false, error: json.error?.message ?? "Stripe portal failed" };
  return { ok: true, url: json.url };
}

export async function applyStripeSubscription(
  sql: Sql,
  userId: string,
  plan: PlanId | string,
  customerId: string | null,
  subId: string | null,
  resetQuota = true,
): Promise<void> {
  const next = normalizePlanId(plan);
  let previous: PlanId = "free";
  try {
    const row = await sql<{ plan: string | null }>`select plan from workspaces where user_id = ${userId} limit 1`;
    previous = normalizePlanId(row[0]?.plan);
  } catch {
    previous = "free";
  }
  if (resetQuota) {
    await sql`update workspaces set
      plan = ${next},
      stripe_customer_id = coalesce(${customerId ?? null}, stripe_customer_id),
      stripe_subscription_id = coalesce(${subId ?? null}, stripe_subscription_id),
      plan_source = ${"stripe"},
      plan_period_start = now(),
      searches_used = 0,
      updated_at = now()
      where user_id = ${userId}`;
  } else {
    await sql`update workspaces set
      plan = ${next},
      stripe_customer_id = coalesce(${customerId ?? null}, stripe_customer_id),
      stripe_subscription_id = coalesce(${subId ?? null}, stripe_subscription_id),
      plan_source = ${"stripe"},
      updated_at = now()
      where user_id = ${userId}`;
  }
  if (next !== "free") {
    try {
      const { queueBillingThanks } = await import("./mail-automations.ts");
      await queueBillingThanks(sql, userId, next);
    } catch (err) {
      console.error("[norf] billing mail", err);
    }
  } else if (previous !== "free") {
    try {
      const { queuePlanEnded } = await import("./mail-automations.ts");
      await queuePlanEnded(sql, userId);
    } catch (err) {
      console.error("[norf] plan ended mail", err);
    }
  }
}

export async function pullStripePlanForUser(
  sql: Sql,
  userId: string,
  apply: boolean,
): Promise<{ ok: boolean; plan: PlanId }> {
  const secret = stripeEnv("STRIPE_SECRET_KEY");
  if (!secret) return { ok: false, plan: "free" };
  let customerId: string | null = null;
  try {
    customerId = (await sql<{ stripe_customer_id: string | null }>`
      select stripe_customer_id from workspaces where user_id = ${userId} limit 1`)[0]?.stripe_customer_id ?? null;
  } catch {
    return { ok: false, plan: "free" };
  }
  if (!customerId) return { ok: false, plan: "free" };
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=active&limit=5`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    if (!res.ok) return { ok: false, plan: "free" };
    const json = await res.json();
    const sub = json.data?.[0];
    if (!sub) return { ok: true, plan: "free" };
    const plan = resolveStripePlan(sub) ?? "free";
    if (apply && plan !== "free") {
      await applyStripeSubscription(sql, userId, plan, customerId, typeof sub.id === "string" ? sub.id : null, true);
    }
    return { ok: true, plan };
  } catch (err) {
    console.error("[norf] stripe pull", err);
    return { ok: false, plan: "free" };
  }
}
