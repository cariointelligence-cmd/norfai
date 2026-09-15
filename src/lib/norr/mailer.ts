/**
 * Outbound mail. Queues every message so admin can see who got what.
 * Sends through Resend HTTP or SMTP when configured. Never pretends a send succeeded.
 */
import { createHash, randomBytes } from "node:crypto";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import type { Sql } from "../db.ts";
import { nid } from "../utils.ts";
import { SITE_EMAIL, SITE_EMAIL_ALT, SITE_MAIL_FROM, SITE_MAIL_DOMAIN, SITE_NAME } from "../seo/site.ts";

export const CANONICAL_MAIL_ORIGIN = "https://norfai.com";
export const SUPPORT_INBOX = [SITE_EMAIL, SITE_EMAIL_ALT] as const;

export type MailCampaign =
  | "welcome"
  | "day3_checkin"
  | "no_search_day1"
  | "quota_search"
  | "quota_companies"
  | "quota_nudge_80"
  | "winback_1"
  | "winback_2"
  | "winback_3"
  | "first_search"
  | "search_complete"
  | "search_empty"
  | "weekly_digest"
  | "billing_thanks"
  | "billing_failed"
  | "plan_ended"
  | "plan_gifted"
  | "team_invite"
  | "account_ready"
  | "signup_admin"
  | "ticket_received"
  | "ticket_admin"
  | "ticket_reply"
  | "ticket_opened"
  | "ticket_closed"
  | "admin_test";

export type MailKind = "transactional" | "marketing";

export const CAMPAIGN_KIND: Record<MailCampaign, MailKind> = {
  welcome: "transactional",
  day3_checkin: "marketing",
  no_search_day1: "marketing",
  quota_search: "marketing",
  quota_companies: "marketing",
  quota_nudge_80: "marketing",
  winback_1: "marketing",
  winback_2: "marketing",
  winback_3: "marketing",
  first_search: "transactional",
  search_complete: "transactional",
  search_empty: "transactional",
  weekly_digest: "marketing",
  billing_thanks: "transactional",
  billing_failed: "transactional",
  plan_ended: "transactional",
  plan_gifted: "transactional",
  team_invite: "transactional",
  account_ready: "transactional",
  signup_admin: "transactional",
  ticket_received: "transactional",
  ticket_admin: "transactional",
  ticket_reply: "transactional",
  ticket_opened: "transactional",
  ticket_closed: "transactional",
  admin_test: "transactional",
};

export type OutboxRow = {
  id: string;
  campaign: string;
  user_id: string | null;
  email: string;
  to_name: string | null;
  subject: string;
  text_body: string;
  html_body: string;
  status: string;
  scheduled_at: string | Date | null;
  sent_at: string | Date | null;
  error: string | null;
  provider: string | null;
  meta: unknown;
  created_at: string | Date | null;
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (name === "RESEND_API_KEY") {
    return process.env.RESEND_KEY?.trim() || process.env.RESEND?.trim() || undefined;
  }
  return undefined;
}

export function publicMailOrigin(): string {
  const raw = (env("PUBLIC_SITE_URL") || env("SITE_URL") || "").replace(/\/$/, "");
  if (/^https:\/\/(www\.)?norfai\.com$/i.test(raw)) return raw;
  return CANONICAL_MAIL_ORIGIN;
}

export function isNorfMailHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === SITE_MAIL_DOMAIN || h.endsWith(`.${SITE_MAIL_DOMAIN}`);
}

/** Resend only delivers from a verified domain. Gmail/SMTP inboxes are reply-to, not From. */
export function resendSafeFrom(from?: string | null): string {
  const raw = (from || "").trim();
  if (!raw) return SITE_MAIL_FROM;
  const parsed = parseFrom(raw);
  const host = parsed.email.split("@")[1]?.toLowerCase() ?? "";
  if (parsed.email && isNorfMailHost(host)) {
    const name = parsed.name || SITE_NAME;
    return `${name} <${parsed.email}>`;
  }
  return SITE_MAIL_FROM;
}

export function mailFrom(override?: string | null, provider?: "resend" | "smtp" | "none"): string {
  const raw = (override || env("MAIL_FROM") || env("SMTP_FROM") || "").trim();
  if (provider === "resend") return resendSafeFrom(raw);
  if (raw) return raw;
  if (provider === "smtp") return `${SITE_NAME} <${SITE_EMAIL}>`;
  return SITE_MAIL_FROM;
}

export function isResendFromFailure(error: string | null | undefined): boolean {
  if (!error) return false;
  return /domain|not verified|invalid [`']?from|gmail\.com|unverified/i.test(error);
}

export function isStaleMarketingOutbox(row: { campaign: string; created_at?: string | Date | null }, now = Date.now()): boolean {
  const kind = CAMPAIGN_KIND[row.campaign as MailCampaign] ?? "marketing";
  if (kind !== "marketing") return false;
  const created = row.created_at ? new Date(row.created_at).getTime() : 0;
  return created > 0 && now - created > 10 * 24 * 3600 * 1000;
}

export type MailTransport = {
  provider: "resend" | "smtp" | "none";
  from: string;
  hint: string;
  resendKey?: string;
  smtp?: { host: string; port: number; user: string; pass: string; secure: boolean };
  source: "env" | "db" | "none";
};

export type MailSettingsPublic = {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassSet: boolean;
  smtpSecure: boolean;
  resendSet: boolean;
  mailFrom: string;
  source: "env" | "db" | "none";
  envLocked: boolean;
};

type MailSettingsRow = {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_secure: boolean | null;
  resend_api_key: string | null;
  mail_from: string | null;
};

function transportFromEnv(): MailTransport | null {
  const envKey = env("RESEND_API_KEY");
  if (envKey) {
    return {
      provider: "resend",
      from: mailFrom(undefined, "resend"),
      hint: "Resend is connected from environment. Mail leaves through api.resend.com as @norfai.com.",
      resendKey: envKey,
      source: "env",
    };
  }
  if (env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS")) {
    const port = Number(env("SMTP_PORT") || "587");
    const secure = env("SMTP_SECURE") === "1" || env("SMTP_SECURE") === "true" || port === 465;
    return {
      provider: "smtp",
      from: mailFrom(undefined, "smtp"),
      hint: `SMTP ${env("SMTP_HOST")}:${env("SMTP_PORT") || "587"} as ${env("SMTP_USER")} (environment).`,
      smtp: {
        host: env("SMTP_HOST")!,
        port: Number.isFinite(port) ? port : 587,
        user: env("SMTP_USER")!,
        pass: env("SMTP_PASS")!,
        secure,
      },
      source: "env",
    };
  }
  return null;
}

function transportFromRow(row: MailSettingsRow | null | undefined): MailTransport | null {
  if (!row) return null;
  const resend = row.resend_api_key?.trim();
  if (resend) {
    return {
      provider: "resend",
      from: mailFrom(row.mail_from, "resend"),
      hint: "Resend is connected from admin mail settings. Mail leaves through api.resend.com as @norfai.com.",
      resendKey: resend,
      source: "db",
    };
  }
  const host = row.smtp_host?.trim();
  const user = row.smtp_user?.trim();
  const pass = row.smtp_pass ?? "";
  if (host && user && pass) {
    const port = Number(row.smtp_port || 587);
    const secure = Boolean(row.smtp_secure) || port === 465;
    return {
      provider: "smtp",
      from: mailFrom(row.mail_from, "smtp"),
      hint: `SMTP ${host}:${Number.isFinite(port) ? port : 587} as ${user}.`,
      smtp: {
        host,
        port: Number.isFinite(port) ? port : 587,
        user,
        pass,
        secure,
      },
      source: "db",
    };
  }
  return null;
}

const noneTransport = (): MailTransport => ({
  provider: "none",
  from: mailFrom(),
  hint: "No mail provider yet. Save a Resend API key in Admin → Mail, or set RESEND_API_KEY. From must be @norfai.com.",
  source: "none",
});

export function composeMailTransport(input: {
  envResendKey?: string | null;
  envFrom?: string | null;
  envSmtp?: { host: string; port: number; user: string; pass: string; secure: boolean } | null;
  db?: MailSettingsRow | null;
}): MailTransport {
  const envKey = input.envResendKey?.trim();
  const dbKey = input.db?.resend_api_key?.trim();
  const fromRaw = (input.envFrom || input.db?.mail_from || "").trim();
  if (envKey || dbKey) {
    return {
      provider: "resend",
      from: resendSafeFrom(fromRaw),
      hint: envKey
        ? "Resend is connected from environment. Mail leaves through api.resend.com as @norfai.com."
        : "Resend is connected from admin mail settings. Mail leaves through api.resend.com as @norfai.com.",
      resendKey: envKey || dbKey,
      source: envKey ? "env" : "db",
    };
  }
  if (input.envSmtp?.host && input.envSmtp.user && input.envSmtp.pass) {
    return {
      provider: "smtp",
      from: mailFrom(fromRaw, "smtp"),
      hint: `SMTP ${input.envSmtp.host}:${input.envSmtp.port} as ${input.envSmtp.user} (environment).`,
      smtp: input.envSmtp,
      source: "env",
    };
  }
  return transportFromRow(input.db) ?? noneTransport();
}

let cachedTransport: { at: number; value: MailTransport } | null = null;

export function invalidateMailerCache(): void {
  cachedTransport = null;
}

export async function resolveMailer(sql?: Sql): Promise<MailTransport> {
  const envKey = env("RESEND_API_KEY");
  const envFrom = env("MAIL_FROM") || env("SMTP_FROM");
  if (envKey && cachedTransport?.value.provider !== "resend") cachedTransport = null;
  if (envKey && envFrom) {
    return composeMailTransport({ envResendKey: envKey, envFrom });
  }
  if (cachedTransport && Date.now() - cachedTransport.at < 15_000) return cachedTransport.value;
  let row: MailSettingsRow | undefined;
  if (sql) {
    await ensureMailSchema(sql);
    try {
      const rows = await sql<MailSettingsRow>`
        select smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, resend_api_key, mail_from
        from mail_settings where id = ${"default"} limit 1`;
      row = rows[0];
    } catch {
      row = undefined;
    }
  } else if (!envKey) {
    return transportFromEnv() ?? noneTransport();
  }
  const envSmtp =
    env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS")
      ? {
          host: env("SMTP_HOST")!,
          port: Number(env("SMTP_PORT") || "587") || 587,
          user: env("SMTP_USER")!,
          pass: env("SMTP_PASS")!,
          secure: env("SMTP_SECURE") === "1" || env("SMTP_SECURE") === "true" || env("SMTP_PORT") === "465",
        }
      : null;
  const t = composeMailTransport({
    envResendKey: envKey,
    envFrom,
    envSmtp,
    db: row,
  });
  if (sql || t.provider !== "none") cachedTransport = { at: Date.now(), value: t };
  return t;
}

export function mailerStatus(): {
  configured: boolean;
  provider: "resend" | "smtp" | "none";
  from: string;
  hint: string;
} {
  const t = transportFromEnv() ?? noneTransport();
  return { configured: t.provider !== "none", provider: t.provider, from: t.from, hint: t.hint };
}

export async function mailerStatusFor(sql: Sql): Promise<{
  configured: boolean;
  provider: "resend" | "smtp" | "none";
  from: string;
  hint: string;
  source: "env" | "db" | "none";
}> {
  const t = await resolveMailer(sql);
  return { configured: t.provider !== "none", provider: t.provider, from: t.from, hint: t.hint, source: t.source };
}

export async function publicMailSettings(sql: Sql): Promise<MailSettingsPublic> {
  const envLocked = Boolean(transportFromEnv());
  let row: MailSettingsRow | undefined;
  try {
    row = (await sql<MailSettingsRow>`
      select smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, resend_api_key, mail_from
      from mail_settings where id = ${"default"} limit 1`)[0];
  } catch {
    row = undefined;
  }
  const t = await resolveMailer(sql);
  return {
    smtpHost: row?.smtp_host ?? (t.smtp?.host ?? ""),
    smtpPort: String(row?.smtp_port ?? t.smtp?.port ?? 587),
    smtpUser: row?.smtp_user ?? (t.smtp?.user ?? ""),
    smtpPassSet: Boolean(row?.smtp_pass) || Boolean(env("SMTP_PASS")),
    smtpSecure: Boolean(row?.smtp_secure) || t.smtp?.secure === true,
    resendSet: Boolean(row?.resend_api_key) || Boolean(env("RESEND_API_KEY")),
    mailFrom: row?.mail_from ? (t.provider === "resend" ? resendSafeFrom(row.mail_from) : row.mail_from) : t.from,
    source: t.source,
    envLocked,
  };
}

export async function saveMailSettings(
  sql: Sql,
  input: {
    smtpHost?: string;
    smtpPort?: string | number;
    smtpUser?: string;
    smtpPass?: string;
    smtpSecure?: boolean;
    resendApiKey?: string;
    mailFrom?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureMailSchema(sql);
  const host = boundedHost(input.smtpHost ?? "");
  const portRaw = Number(input.smtpPort ?? 587);
  const port = Number.isFinite(portRaw) && portRaw >= 1 && portRaw <= 65535 ? Math.floor(portRaw) : 587;
  const user = (input.smtpUser ?? "").trim().slice(0, 190);
  const passIn = (input.smtpPass ?? "").trim();
  const from = (input.mailFrom ?? "").trim().slice(0, 200);
  const resendIn = (input.resendApiKey ?? "").trim().slice(0, 200);
  const existing = (await sql<MailSettingsRow>`
    select smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, resend_api_key, mail_from
    from mail_settings where id = ${"default"} limit 1`)[0];
  const keepPass = !passIn && Boolean(existing?.smtp_pass);
  const keepResend = !resendIn && Boolean(existing?.resend_api_key);
  const pass = passIn || (keepPass ? existing!.smtp_pass : "") || "";
  const resend = resendIn || (keepResend ? existing!.resend_api_key : "") || "";
  if (host && !user) return { ok: false, error: "SMTP user is required when a host is set." };
  if (user && !host && !resend) return { ok: false, error: "SMTP host is required, or save a Resend key." };
  if (passIn && passIn.length < 8) return { ok: false, error: "SMTP password looks too short. Gmail needs an app password." };
  const storedFrom = resend ? resendSafeFrom(from || SITE_MAIL_FROM) : from || null;
  await sql`
    insert into mail_settings (
      id, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, resend_api_key, mail_from, updated_at
    ) values (
      ${"default"}, ${host || null}, ${port}, ${user || null}, ${pass || null}, ${Boolean(input.smtpSecure)},
      ${resend || null}, ${storedFrom}, now()
    )
    on conflict (id) do update set
      smtp_host = excluded.smtp_host,
      smtp_port = excluded.smtp_port,
      smtp_user = excluded.smtp_user,
      smtp_pass = excluded.smtp_pass,
      smtp_secure = excluded.smtp_secure,
      resend_api_key = excluded.resend_api_key,
      mail_from = excluded.mail_from,
      updated_at = now()`;
  invalidateMailerCache();
  return { ok: true };
}

function boundedHost(raw: string): string {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  if (!h || h.length > 180) return "";
  if (!/^[a-z0-9.-]+$/.test(h)) return "";
  return h;
}

export async function listAdminInboxes(sql: Sql): Promise<string[]> {
  const set = new Set<string>();
  for (const e of SUPPORT_INBOX) {
    const v = validEmail(e);
    if (v) set.add(v);
  }
  try {
    const rows = await sql<{ email: string }>`select email from platform_admins`;
    for (const r of rows) {
      const v = validEmail(r.email);
      if (v) set.add(v);
    }
  } catch {
    /* table catch-up */
  }
  return [...set];
}

export function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*)<([^>]+)>\s*$/);
  if (m) return { name: (m[1] ?? "").trim().replace(/^"|"$/g, ""), email: (m[2] ?? "").trim().toLowerCase() };
  return { name: SITE_NAME, email: from.trim().toLowerCase() };
}

export async function ensureMailSchema(sql: Sql): Promise<void> {
  try {
    await sql.query("alter table workspaces add column if not exists last_seen_at timestamptz");
    await sql.query(`create table if not exists support_tickets (
      id text primary key,
      public_token text not null unique,
      user_id text,
      email text not null,
      name text not null default '',
      subject text not null,
      status text not null default 'open',
      priority text not null default 'normal',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_customer_at timestamptz,
      last_admin_at timestamptz
    )`);
    await sql.query("create index if not exists support_tickets_user_idx on support_tickets (user_id, created_at desc)");
    await sql.query("create index if not exists support_tickets_status_idx on support_tickets (status, updated_at desc)");
    await sql.query(`create table if not exists support_messages (
      id text primary key,
      ticket_id text not null references support_tickets(id) on delete cascade,
      author_kind text not null,
      author_id text,
      author_email text,
      body text not null,
      created_at timestamptz not null default now()
    )`);
    await sql.query("create index if not exists support_messages_ticket_idx on support_messages (ticket_id, created_at)");
    await sql.query(`create table if not exists mail_unsubscribes (
      email text primary key,
      token text not null unique,
      created_at timestamptz not null default now(),
      reason text
    )`);
    await sql.query(`create table if not exists mail_outbox (
      id text primary key,
      campaign text not null,
      user_id text,
      email text not null,
      to_name text,
      subject text not null,
      text_body text not null,
      html_body text not null,
      status text not null default 'queued',
      scheduled_at timestamptz not null default now(),
      sent_at timestamptz,
      error text,
      provider text,
      meta jsonb not null default '{}',
      created_at timestamptz not null default now()
    )`);
    await sql.query("create index if not exists mail_outbox_status_idx on mail_outbox (status, scheduled_at)");
    await sql.query(`create unique index if not exists mail_outbox_once_idx
      on mail_outbox (campaign, lower(email))
      where campaign in ('welcome','day3_checkin','winback_1','winback_2','winback_3','first_search','billing_thanks')`);
    await sql.query(`create unique index if not exists mail_outbox_once_nsearch_idx
      on mail_outbox (campaign, lower(email))
      where campaign in ('no_search_day1')`);
    await sql.query(`create table if not exists mail_unsub_tokens (
      email text primary key,
      token text not null unique,
      created_at timestamptz not null default now()
    )`);
    await sql.query(`insert into mail_unsub_tokens (email, token, created_at)
      select email, token, created_at from mail_unsubscribes
      on conflict (email) do nothing`);
    await sql.query("delete from mail_unsubscribes where reason is null");
    await sql.query(`create table if not exists mail_settings (
      id text primary key,
      smtp_host text,
      smtp_port integer,
      smtp_user text,
      smtp_pass text,
      smtp_secure boolean not null default false,
      resend_api_key text,
      mail_from text,
      updated_at timestamptz not null default now()
    )`);
    await sql.query("alter table support_tickets add column if not exists origin text not null default 'customer'");
    await sql.query("alter table support_tickets add column if not exists kind text not null default 'support'");
    await sql.query("alter table support_tickets add column if not exists opened_by text");
  } catch (err) {
    console.error("[norf] mail schema", err);
  }
}

export function validEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 190) return null;
  return e;
}

export async function unsubscribeToken(sql: Sql, email: string): Promise<string> {
  const existing = await sql<{ token: string }>`select token from mail_unsub_tokens where email = ${email} limit 1`;
  if (existing[0]?.token) return existing[0].token;
  const token = randomBytes(18).toString("base64url");
  try {
    await sql`insert into mail_unsub_tokens (email, token) values (${email}, ${token}) on conflict (email) do nothing`;
  } catch {
    /* created elsewhere */
  }
  const row = await sql<{ token: string }>`select token from mail_unsub_tokens where email = ${email} limit 1`;
  return row[0]?.token ?? token;
}

export async function isUnsubscribed(sql: Sql, email: string): Promise<boolean> {
  try {
    const row = await sql<{ email: string }>`select email from mail_unsubscribes where email = ${email} limit 1`;
    return Boolean(row[0]);
  } catch {
    return false;
  }
}

export async function lookupUnsubEmail(sql: Sql, token: string): Promise<string | null> {
  const t = token.trim();
  if (!t) return null;
  const fromToken = await sql<{ email: string }>`select email from mail_unsub_tokens where token = ${t} limit 1`;
  if (fromToken[0]?.email) return fromToken[0].email;
  const fromUnsub = await sql<{ email: string }>`select email from mail_unsubscribes where token = ${t} limit 1`;
  return fromUnsub[0]?.email ?? null;
}

export async function applyUnsubscribe(sql: Sql, token: string, reason?: string): Promise<{ ok: boolean; email?: string }> {
  const t = token.trim();
  if (!t) return { ok: false };
  const email = await lookupUnsubEmail(sql, t);
  if (!email) return { ok: false };
  const why = (reason || "user").slice(0, 200);
  try {
    await sql`
      insert into mail_unsubscribes (email, token, reason)
      values (${email}, ${t}, ${why})
      on conflict (email) do update set token = excluded.token, reason = excluded.reason`;
  } catch (err) {
    console.error("[norf] unsubscribe", err);
    return { ok: false };
  }
  return { ok: true, email };
}

export type EnqueueMail = {
  campaign: MailCampaign;
  email: string;
  userId?: string | null;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
  scheduledAt?: Date;
  meta?: Record<string, unknown>;
};

const ONCE_CAMPAIGNS = new Set<MailCampaign>([
  "welcome",
  "day3_checkin",
  "no_search_day1",
  "winback_1",
  "winback_2",
  "winback_3",
  "first_search",
  "billing_thanks",
]);

export async function enqueueMail(sql: Sql, input: EnqueueMail): Promise<{ id: string; queued: boolean }> {
  const email = validEmail(input.email);
  if (!email) return { id: "", queued: false };
  const kind = CAMPAIGN_KIND[input.campaign];
  if (kind === "marketing" && (await isUnsubscribed(sql, email))) {
    return { id: "", queued: false };
  }
  if (ONCE_CAMPAIGNS.has(input.campaign)) {
    try {
      const existing = await sql<{ id: string }>`
        select id from mail_outbox where campaign = ${input.campaign} and lower(email) = ${email} limit 1`;
      if (existing[0]) return { id: existing[0].id, queued: false };
    } catch {
      /* table catch-up */
    }
  }
  const id = nid();
  const scheduled = (input.scheduledAt ?? new Date()).toISOString();
  const meta = JSON.stringify(input.meta ?? {});
  try {
    await sql`
      insert into mail_outbox (
        id, campaign, user_id, email, to_name, subject, text_body, html_body, status, scheduled_at, meta
      ) values (
        ${id}, ${input.campaign}, ${input.userId ?? null}, ${email}, ${input.toName ?? null},
        ${input.subject.slice(0, 180)}, ${input.text}, ${input.html}, ${"queued"}, ${scheduled}, ${meta}::jsonb
      )`;
    return { id, queued: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(msg)) return { id: "", queued: false };
    console.error("[norf] enqueue mail", err);
    return { id: "", queued: false };
  }
}

export async function processMailOutbox(sql: Sql, limit = 8): Promise<{ sent: number; failed: number; skipped: number }> {
  await ensureMailSchema(sql);
  const rows = await sql<OutboxRow>`
    select id, campaign, user_id, email, to_name, subject, text_body, html_body, status, scheduled_at, sent_at, error, provider, meta, created_at
    from mail_outbox
    where status = ${"queued"} and scheduled_at <= now()
    order by scheduled_at asc
    limit ${limit}`;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const transport = await resolveMailer(sql);
  for (const row of rows) {
    const kind = CAMPAIGN_KIND[row.campaign as MailCampaign] ?? "marketing";
    if (kind === "marketing" && (await isUnsubscribed(sql, row.email))) {
      await sql`update mail_outbox set status = ${"skipped"}, error = ${"unsubscribed"}, sent_at = now() where id = ${row.id}`;
      skipped += 1;
      continue;
    }
    if (isStaleMarketingOutbox(row)) {
      await sql`update mail_outbox set status = ${"skipped"}, error = ${"stale"}, sent_at = now() where id = ${row.id}`;
      skipped += 1;
      continue;
    }
    if (transport.provider === "none") {
      await sql`update mail_outbox set status = ${"failed"}, error = ${"Mail provider is not configured"}, sent_at = now() where id = ${row.id}`;
      failed += 1;
      continue;
    }
    const result = await deliverWith(transport, {
      to: row.email,
      toName: row.to_name,
      subject: row.subject,
      text: row.text_body,
      html: row.html_body,
    });
    if (result.ok) {
      await sql`update mail_outbox set status = ${"sent"}, sent_at = now(), provider = ${result.provider}, error = null where id = ${row.id}`;
      sent += 1;
    } else {
      await sql`update mail_outbox set status = ${"failed"}, error = ${result.error.slice(0, 400)}, provider = ${result.provider} where id = ${row.id}`;
      failed += 1;
    }
  }
  return { sent, failed, skipped };
}

export async function requeueResendFromFailures(sql: Sql): Promise<number> {
  await ensureMailSchema(sql);
  try {
    const rows = await sql<{ id: string }>`
      update mail_outbox
      set status = ${"queued"}, error = null, scheduled_at = now()
      where status = ${"failed"}
        and created_at > now() - interval '21 days'
        and (
          error ~* 'domain|not verified|invalid .from|gmail\\.com|unverified'
          or (provider = ${"resend"} and error ~* 'from')
        )
      returning id`;
    return rows.length;
  } catch (err) {
    console.error("[norf] requeue mail", err);
    return 0;
  }
}

export async function retryFailedMail(sql: Sql, id: string): Promise<{ ok: boolean; error?: string }> {
  await sql`update mail_outbox set status = ${"queued"}, error = null, scheduled_at = now() where id = ${id} and status = ${"failed"}`;
  const r = await processMailOutbox(sql, 4);
  if (r.sent > 0) return { ok: true };
  const row = await sql<{ status: string; error: string | null }>`select status, error from mail_outbox where id = ${id} limit 1`;
  if (row[0]?.status === "sent") return { ok: true };
  return { ok: false, error: row[0]?.error ?? "Still queued. Add a mail provider first." };
}

export async function markOutboxResult(
  sql: Sql,
  id: string,
  result: DeliverResult,
): Promise<void> {
  if (!id) return;
  if (result.ok) {
    await sql`update mail_outbox set status = ${"sent"}, sent_at = now(), provider = ${result.provider}, error = null where id = ${id}`;
  } else {
    await sql`update mail_outbox set status = ${"failed"}, error = ${result.error.slice(0, 400)}, provider = ${result.provider} where id = ${id}`;
  }
}

type DeliverResult = { ok: true; provider: string } | { ok: false; provider: string; error: string };

export async function deliverMail(
  opts: {
    to: string;
    toName?: string | null;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  },
  sql?: Sql,
): Promise<DeliverResult> {
  const transport = await resolveMailer(sql);
  return deliverWith(transport, opts);
}

async function deliverWith(
  transport: MailTransport,
  opts: {
    to: string;
    toName?: string | null;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  },
): Promise<DeliverResult> {
  if (transport.provider === "resend" && transport.resendKey) {
    return deliverResend({ ...opts, from: resendSafeFrom(transport.from), key: transport.resendKey });
  }
  if (transport.provider === "smtp" && transport.smtp) {
    return deliverSmtp({ ...opts, from: transport.from, smtp: transport.smtp });
  }
  return { ok: false, provider: "none", error: "Mail provider is not configured" };
}

async function deliverResend(opts: {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
  from: string;
  key: string;
  replyTo?: string;
}): Promise<DeliverResult> {
  const key = opts.key;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.toName ? `${opts.toName} <${opts.to}>` : opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo || SITE_EMAIL,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: { message?: string } };
    if (!res.ok) {
      return { ok: false, provider: "resend", error: json.error?.message || json.message || `Resend HTTP ${res.status}` };
    }
    return { ok: true, provider: "resend" };
  } catch (err) {
    return { ok: false, provider: "resend", error: err instanceof Error ? err.message : "Resend failed" };
  }
}

async function deliverSmtp(opts: {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
  from: string;
  smtp: { host: string; port: number; user: string; pass: string; secure: boolean };
  replyTo?: string;
}): Promise<DeliverResult> {
  const { host, port, user, pass, secure } = opts.smtp;
  const fromAddr = parseFrom(opts.from);
  const boundary = `norf_${createHash("sha1").update(opts.subject + opts.to).digest("hex").slice(0, 16)}`;
  const toHeader = opts.toName ? `"${escapeHeader(opts.toName)}" <${opts.to}>` : opts.to;
  const fromHeader = fromAddr.name ? `"${escapeHeader(fromAddr.name)}" <${fromAddr.email}>` : fromAddr.email;
  const messageId = `<${nid()}.${Date.now()}@norfai.com>`;
  const message = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Reply-To: ${opts.replyTo || SITE_EMAIL}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  try {
    await smtpTransaction({
      host,
      port,
      secure,
      user,
      pass,
      from: fromAddr.email,
      to: opts.to,
      data: message,
    });
    return { ok: true, provider: "smtp" };
  } catch (err) {
    return { ok: false, provider: "smtp", error: err instanceof Error ? err.message : "SMTP failed" };
  }
}

function escapeHeader(s: string): string {
  return s.replace(/[\r\n"]/g, " ").slice(0, 80);
}

function encodeSubject(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

type SmtpOpts = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  data: string;
};

async function smtpTransaction(opts: SmtpOpts): Promise<void> {
  const timeoutMs = 15000;
  let sock: Socket | TLSSocket = opts.secure
    ? tlsConnect({ host: opts.host, port: opts.port, servername: opts.host, timeout: timeoutMs })
    : netConnect({ host: opts.host, port: opts.port, timeout: timeoutMs });
  const io = makeSmtpIo(sock);
  try {
    await io.expect(220);
    await io.send(`EHLO norfai.com`);
    let ehlo = await io.expect(250);
    if (!opts.secure) {
      if (!/STARTTLS/i.test(ehlo.join("\n"))) throw new Error("SMTP server has no STARTTLS");
      await io.send("STARTTLS");
      await io.expect(220);
      sock = tlsConnect({ socket: sock, servername: opts.host, timeout: timeoutMs });
      const upgraded = makeSmtpIo(sock);
      io.send = upgraded.send;
      io.expect = upgraded.expect;
      io.end = upgraded.end;
      await io.send(`EHLO norfai.com`);
      ehlo = await io.expect(250);
    }
    const caps = ehlo.join("\n");
    if (/AUTH[^\n]*PLAIN/i.test(caps)) {
      const plain = Buffer.from(`\0${opts.user}\0${opts.pass}`, "utf8").toString("base64");
      await io.send(`AUTH PLAIN ${plain}`);
      await io.expect(235);
    } else {
      await io.send("AUTH LOGIN");
      await io.expect(334);
      await io.send(Buffer.from(opts.user, "utf8").toString("base64"));
      await io.expect(334);
      await io.send(Buffer.from(opts.pass, "utf8").toString("base64"));
      await io.expect(235);
    }
    await io.send(`MAIL FROM:<${opts.from}>`);
    await io.expect(250);
    await io.send(`RCPT TO:<${opts.to}>`);
    await io.expect(250);
    await io.send("DATA");
    await io.expect(354);
    const escaped = opts.data.replace(/^\./gm, "..");
    await io.sendRaw(`${escaped}\r\n.`);
    await io.expect(250);
    await io.send("QUIT").catch(() => undefined);
  } finally {
    io.end();
  }
}

function makeSmtpIo(sock: Socket | TLSSocket) {
  let buf = "";
  const queued: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  const pushLine = (line: string) => {
    const w = waiters.shift();
    if (w) w(line);
    else queued.push(line);
  };
  const onData = (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let idx = buf.indexOf("\n");
    while (idx >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      pushLine(line);
      idx = buf.indexOf("\n");
    }
  };
  sock.on("data", onData);
  const readLine = () =>
    new Promise<string>((resolve, reject) => {
      const next = queued.shift();
      if (next !== undefined) {
        resolve(next);
        return;
      }
      const t = setTimeout(() => reject(new Error("SMTP timeout")), 12000);
      waiters.push((line) => {
        clearTimeout(t);
        resolve(line);
      });
    });
  const expect = async (code: number) => {
    const lines: string[] = [];
    for (;;) {
      const line = await readLine();
      lines.push(line);
      const m = line.match(/^(\d{3})([ -])/);
      if (!m) throw new Error(`SMTP junk: ${line.slice(0, 80)}`);
      const c = Number(m[1]);
      const cont = m[2] === "-";
      if (!cont) {
        if (c !== code) throw new Error(`SMTP ${c}: ${lines.join(" ").slice(0, 180)}`);
        return lines;
      }
    }
  };
  const send = async (line: string) => {
    sock.write(`${line}\r\n`);
  };
  const sendRaw = async (block: string) => {
    sock.write(`${block}\r\n`);
  };
  const end = () => {
    sock.off("data", onData);
    try {
      sock.end();
    } catch {
      /* closed */
    }
  };
  return { expect, send, sendRaw, end };
}
