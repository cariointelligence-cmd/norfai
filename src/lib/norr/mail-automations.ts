import type { Sql } from "../db.ts";
import { isoTime } from "../format.ts";
import { PLANS, lookupUserEmail, type PlanId, normalizePlanId, searchesLimitFor, isUnlimitedQuota } from "./platform.ts";
import {
  CAMPAIGN_KIND,
  deliverMail,
  enqueueMail,
  ensureMailSchema,
  listAdminInboxes,
  mailerStatusFor,
  markOutboxResult,
  processMailOutbox,
  publicMailOrigin,
  SUPPORT_INBOX,
  unsubscribeToken,
  validEmail,
  type MailCampaign,
} from "./mailer.ts";
import { renderCampaign, type MailLocale } from "./mail-copy.ts";

const DAY = 24 * 3600 * 1000;

export function automationGates(now: number, opts: { createdAt: number | null; lastSeenAt: number | null }) {
  const created = opts.createdAt;
  const seen = opts.lastSeenAt;
  return {
    welcome: Boolean(created && now - created < 2 * DAY),
    noSearchDay1: Boolean(created && now - created >= DAY && now - created < 3 * DAY),
    day3: Boolean(created && now - created < 6 * DAY),
    winback1: Boolean(seen && now - seen >= 14 * DAY),
    winback2: Boolean(seen && now - seen >= 21 * DAY),
    winback3: Boolean(seen && now - seen >= 28 * DAY),
  };
}

function localeOf(raw: string | null | undefined): MailLocale {
  return raw === "en" || raw === "en-GB" || raw === "en-US" ? "en" : "fi";
}

async function unsubUrl(sql: Sql, email: string, origin: string): Promise<string> {
  const token = await unsubscribeToken(sql, email);
  return `${origin}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function queueCampaign(
  sql: Sql,
  opts: {
    campaign: MailCampaign;
    email: string;
    userId?: string | null;
    name?: string | null;
    locale?: string | null;
    ticketUrl?: string;
    planLabel?: string;
    scheduledAt?: Date;
    meta?: Record<string, unknown>;
    runName?: string | null;
    count?: number;
    contacts?: number;
    headline?: string | null;
    items?: string[];
    inviterName?: string | null;
    customerEmail?: string | null;
    ctaUrl?: string;
  },
): Promise<{ queued: boolean; id: string }> {
  await ensureMailSchema(sql);
  const origin = publicMailOrigin();
  const loc = localeOf(opts.locale);
  const kind = CAMPAIGN_KIND[opts.campaign];
  const rendered = renderCampaign(opts.campaign, {
    locale: loc,
    name: opts.name,
    origin,
    unsubUrl: kind === "marketing" ? await unsubUrl(sql, opts.email, origin) : undefined,
    ticketUrl: opts.ticketUrl,
    planLabel: opts.planLabel,
    runName: opts.runName,
    count: opts.count,
    contacts: opts.contacts,
    headline: opts.headline,
    items: opts.items,
    inviterName: opts.inviterName,
    customerEmail: opts.customerEmail,
    ctaUrl: opts.ctaUrl,
  });
  const queued = await enqueueMail(sql, {
    campaign: opts.campaign,
    email: opts.email,
    userId: opts.userId,
    toName: opts.name,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    scheduledAt: opts.scheduledAt,
    meta: opts.meta,
  });
  if (queued.queued && (!opts.scheduledAt || opts.scheduledAt.getTime() <= Date.now())) {
    void processMailOutbox(sql, 6).catch((err) => {
      console.error("[norf] mail flush", err);
    });
  }
  return queued;
}

async function userMailProfile(sql: Sql, userId: string): Promise<{ email: string | null; name: string | null; locale: string }> {
  const email = await lookupUserEmail(sql, userId);
  let name: string | null = null;
  let locale = "fi";
  try {
    const u = await sql<{ name: string | null }>`select name from "user" where id = ${userId} limit 1`;
    name = u[0]?.name ?? null;
    const w = await sql<{ locale: string | null }>`select locale from workspaces where user_id = ${userId} limit 1`;
    locale = w[0]?.locale ?? "fi";
  } catch {
    /* optional */
  }
  return { email, name, locale };
}

async function recentCampaign(
  sql: Sql,
  opts: { userId?: string; email?: string; campaign: MailCampaign; days: number; runId?: string },
): Promise<boolean> {
  try {
    if (opts.runId) {
      const row = await sql<{ id: string }>`
        select id from mail_outbox
        where campaign = ${opts.campaign} and meta->>'runId' = ${opts.runId}
        limit 1`;
      return Boolean(row[0]);
    }
    const since = new Date(Date.now() - Math.max(1, opts.days) * DAY).toISOString();
    if (opts.userId) {
      const row = await sql<{ id: string }>`
        select id from mail_outbox
        where user_id = ${opts.userId} and campaign = ${opts.campaign} and created_at > ${since}
        limit 1`;
      return Boolean(row[0]);
    }
    if (opts.email) {
      const email = opts.email.toLowerCase();
      const row = await sql<{ id: string }>`
        select id from mail_outbox
        where lower(email) = ${email} and campaign = ${opts.campaign} and created_at > ${since}
        limit 1`;
      return Boolean(row[0]);
    }
  } catch {
    return false;
  }
  return false;
}

export type TestMailResult = {
  email: string;
  ok: boolean;
  id: string;
  error?: string;
  provider?: string;
};

export async function sendAdminTestMail(
  sql: Sql,
  extra?: string[],
): Promise<{
  configured: boolean;
  provider: string;
  from: string;
  hint: string;
  source: string;
  results: TestMailResult[];
}> {
  await ensureMailSchema(sql);
  const st = await mailerStatusFor(sql);
  const inboxes = await listAdminInboxes(sql);
  for (const raw of extra ?? []) {
    const v = validEmail(raw);
    if (v) inboxes.push(v);
  }
  const unique = [...new Set(inboxes)];
  const origin = publicMailOrigin();
  const now = new Date().toISOString();
  const results: TestMailResult[] = [];
  for (const email of unique) {
    const rendered = renderCampaign("admin_test", {
      locale: "fi",
      name: "admin",
      origin,
      ticketUrl: `${origin}/admin/mail`,
    });
    const subject = `Norf testiviesti ${now.slice(0, 19).replace("T", " ")} UTC`;
    const text = `${rendered.text}\n\nSent at ${now}\nProvider ${st.provider}\nFrom ${st.from}\n`;
    const queued = await enqueueMail(sql, {
      campaign: "admin_test",
      email,
      toName: "Norf admin",
      subject,
      text,
      html: rendered.html,
      meta: { test: true, at: now },
    });
    if (!st.configured) {
      const error = st.hint;
      if (queued.id) {
        await markOutboxResult(sql, queued.id, { ok: false, provider: "none", error });
      }
      results.push({ email, ok: false, id: queued.id, error, provider: "none" });
      continue;
    }
    const delivered = await deliverMail(
      { to: email, toName: "Norf admin", subject, text, html: rendered.html },
      sql,
    );
    if (queued.id) await markOutboxResult(sql, queued.id, delivered);
    results.push({
      email,
      ok: delivered.ok,
      id: queued.id,
      error: delivered.ok ? undefined : delivered.error,
      provider: delivered.provider,
    });
  }
  return {
    configured: st.configured,
    provider: st.provider,
    from: st.from,
    hint: st.hint,
    source: st.source,
    results,
  };
}

export async function queueQuotaMail(
  sql: Sql,
  userId: string,
  kind: "search" | "companies" | "nudge80",
): Promise<void> {
  try {
    await ensureMailSchema(sql);
    const campaign: MailCampaign = kind === "search" ? "quota_search" : kind === "companies" ? "quota_companies" : "quota_nudge_80";
    const recent = await sql<{ id: string }>`
      select id from mail_outbox
      where user_id = ${userId} and campaign = ${campaign} and created_at > now() - interval '7 days'
      limit 1`;
    if (recent[0]) return;
    const email = await lookupUserEmail(sql, userId);
    if (!email) return;
    let name: string | null = null;
    let locale: string | null = "fi";
    try {
      const u = await sql<{ name: string | null }>`select name from "user" where id = ${userId} limit 1`;
      name = u[0]?.name ?? null;
      const w = await sql<{ locale: string | null }>`select locale from workspaces where user_id = ${userId} limit 1`;
      locale = w[0]?.locale ?? "fi";
    } catch {
      /* optional */
    }
    await queueCampaign(sql, { campaign, email, userId, name, locale, meta: { kind } });
  } catch (err) {
    console.error("[norf] quota mail", err);
  }
}

export async function queueWelcome(sql: Sql, userId: string): Promise<void> {
  try {
    const email = await lookupUserEmail(sql, userId);
    if (!email) return;
    if ((SUPPORT_INBOX as readonly string[]).includes(email)) return;
    let name: string | null = null;
    let locale = "fi";
    try {
      const u = await sql<{ name: string | null }>`select name from "user" where id = ${userId} limit 1`;
      name = u[0]?.name ?? null;
      const w = await sql<{ locale: string | null }>`select locale from workspaces where user_id = ${userId} limit 1`;
      locale = w[0]?.locale ?? "fi";
    } catch {
      /* */
    }
    await queueCampaign(sql, { campaign: "welcome", email, userId, name, locale });
    await queueSignupAdmin(sql, userId, email, name);
  } catch (err) {
    console.error("[norf] welcome mail", err);
  }
}

export async function queueFirstSearch(sql: Sql, userId: string, email?: string | null): Promise<void> {
  try {
    const to = email || (await lookupUserEmail(sql, userId));
    if (!to) return;
    if ((SUPPORT_INBOX as readonly string[]).includes(to)) return;
    let name: string | null = null;
    let locale = "fi";
    try {
      const u = await sql<{ name: string | null }>`select name from "user" where id = ${userId} limit 1`;
      name = u[0]?.name ?? null;
      const w = await sql<{ locale: string | null }>`select locale from workspaces where user_id = ${userId} limit 1`;
      locale = w[0]?.locale ?? "fi";
    } catch {
      /* */
    }
    await queueCampaign(sql, { campaign: "first_search", email: to, userId, name, locale });
  } catch (err) {
    console.error("[norf] first search mail", err);
  }
}

export async function queueBillingThanks(sql: Sql, userId: string, plan: PlanId): Promise<void> {
  try {
    const email = await lookupUserEmail(sql, userId);
    if (!email) return;
    await queueCampaign(sql, {
      campaign: "billing_thanks",
      email,
      userId,
      planLabel: PLANS[plan]?.label ?? plan,
      locale: "fi",
      meta: { plan },
    });
  } catch (err) {
    console.error("[norf] billing mail", err);
  }
}

export async function queueBillingFailed(sql: Sql, userId: string): Promise<void> {
  try {
    if (await recentCampaign(sql, { userId, campaign: "billing_failed", days: 3 })) return;
    const u = await userMailProfile(sql, userId);
    if (!u.email) return;
    await queueCampaign(sql, { campaign: "billing_failed", email: u.email, userId, name: u.name, locale: u.locale });
  } catch (err) {
    console.error("[norf] billing failed mail", err);
  }
}

export async function queuePlanEnded(sql: Sql, userId: string): Promise<void> {
  try {
    if (await recentCampaign(sql, { userId, campaign: "plan_ended", days: 14 })) return;
    const u = await userMailProfile(sql, userId);
    if (!u.email) return;
    await queueCampaign(sql, { campaign: "plan_ended", email: u.email, userId, name: u.name, locale: u.locale });
  } catch (err) {
    console.error("[norf] plan ended mail", err);
  }
}

export async function queuePlanGifted(sql: Sql, userId: string, plan: PlanId): Promise<void> {
  try {
    const u = await userMailProfile(sql, userId);
    if (!u.email) return;
    if ((SUPPORT_INBOX as readonly string[]).includes(u.email)) return;
    await queueCampaign(sql, {
      campaign: "plan_gifted",
      email: u.email,
      userId,
      name: u.name,
      locale: u.locale,
      planLabel: PLANS[plan]?.label ?? plan,
      meta: { plan },
    });
  } catch (err) {
    console.error("[norf] plan gifted mail", err);
  }
}

export async function queueAccountReady(sql: Sql, userId: string, email: string): Promise<void> {
  try {
    const to = validEmail(email);
    if (!to) return;
    if ((SUPPORT_INBOX as readonly string[]).includes(to)) return;
    const u = await userMailProfile(sql, userId);
    await queueCampaign(sql, {
      campaign: "account_ready",
      email: to,
      userId,
      name: u.name,
      locale: u.locale,
    });
  } catch (err) {
    console.error("[norf] account ready mail", err);
  }
}

export async function queueSignupAdmin(sql: Sql, userId: string, email: string, name?: string | null): Promise<void> {
  try {
    if (await recentCampaign(sql, { userId, campaign: "signup_admin", days: 30 })) return;
    const inboxes = await listAdminInboxes(sql);
    for (const inbox of inboxes) {
      if (inbox === email.toLowerCase()) continue;
      await queueCampaign(sql, {
        campaign: "signup_admin",
        email: inbox,
        name: "Norf admin",
        locale: "en",
        customerEmail: email,
        meta: { userId, signup: email },
      });
    }
  } catch (err) {
    console.error("[norf] signup admin mail", err);
  }
}

export async function queueTeamInvite(
  sql: Sql,
  opts: { email: string; inviterUserId: string; inviterName?: string | null },
): Promise<void> {
  try {
    const to = validEmail(opts.email);
    if (!to) return;
    if (await recentCampaign(sql, { email: to, campaign: "team_invite", days: 1 })) return;
    let inviterName = opts.inviterName ?? null;
    if (!inviterName) {
      try {
        const u = await sql<{ name: string | null; email: string | null }>`
          select name, email from "user" where id = ${opts.inviterUserId} limit 1`;
        inviterName = u[0]?.name || u[0]?.email || null;
      } catch {
        inviterName = null;
      }
    }
    await queueCampaign(sql, {
      campaign: "team_invite",
      email: to,
      inviterName,
      locale: "fi",
      meta: { inviterUserId: opts.inviterUserId },
    });
  } catch (err) {
    console.error("[norf] team invite mail", err);
  }
}

export async function queueSearchFinished(
  sql: Sql,
  opts: { userId: string; runId: string; runName?: string | null; companies: number; contacts: number },
): Promise<void> {
  try {
    const campaign: MailCampaign = opts.companies > 0 ? "search_complete" : "search_empty";
    if (await recentCampaign(sql, { campaign, runId: opts.runId, days: 30 })) return;
    const u = await userMailProfile(sql, opts.userId);
    if (!u.email || (SUPPORT_INBOX as readonly string[]).includes(u.email)) return;
    const origin = publicMailOrigin();
    await queueCampaign(sql, {
      campaign,
      email: u.email,
      userId: opts.userId,
      name: u.name,
      locale: u.locale,
      runName: opts.runName,
      count: opts.companies,
      contacts: opts.contacts,
      ctaUrl: `${origin}/search/${opts.runId}`,
      meta: { runId: opts.runId, companies: opts.companies },
    });
  } catch (err) {
    console.error("[norf] search finished mail", err);
  }
}

export async function queueWeeklyDigestMail(
  sql: Sql,
  userId: string,
  digest: { headline: string; count: number; items?: Array<{ name: string; summary: string }> },
): Promise<void> {
  try {
    if (digest.count <= 0) return;
    if (await recentCampaign(sql, { userId, campaign: "weekly_digest", days: 6 })) return;
    const u = await userMailProfile(sql, userId);
    if (!u.email || (SUPPORT_INBOX as readonly string[]).includes(u.email)) return;
    await queueCampaign(sql, {
      campaign: "weekly_digest",
      email: u.email,
      userId,
      name: u.name,
      locale: u.locale,
      headline: digest.headline,
      count: digest.count,
      items: (digest.items ?? []).slice(0, 8).map((i) => `${i.name}: ${i.summary}`),
      meta: { count: digest.count },
    });
  } catch (err) {
    console.error("[norf] digest mail", err);
  }
}

export async function queueTicketClosed(
  sql: Sql,
  opts: { email: string; name?: string | null; userId?: string | null; ticketUrl: string; locale?: string | null },
): Promise<void> {
  try {
    const to = validEmail(opts.email);
    if (!to) return;
    await queueCampaign(sql, {
      campaign: "ticket_closed",
      email: to,
      userId: opts.userId,
      name: opts.name,
      locale: opts.locale ?? "fi",
      ticketUrl: opts.ticketUrl,
    });
  } catch (err) {
    console.error("[norf] ticket closed mail", err);
  }
}

export async function touchLastSeen(sql: Sql, userId: string): Promise<{ first: boolean }> {
  await ensureMailSchema(sql);
  try {
    const prev = await sql<{ last_seen_at: string | Date | null }>`
      select last_seen_at from workspaces where user_id = ${userId} limit 1`;
    const first = !prev[0]?.last_seen_at;
    await sql`update workspaces set last_seen_at = now(), updated_at = now() where user_id = ${userId}`;
    return { first };
  } catch {
    return { first: false };
  }
}

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string | Date | null;
  locale: string | null;
  plan: string | null;
  searches_used: number | null;
  last_seen_at: string | Date | null;
  is_admin: boolean;
};

export async function scheduleAutomations(sql: Sql): Promise<{ queued: number }> {
  await ensureMailSchema(sql);
  let queued = 0;
  let users: UserRow[] = [];
  try {
    users = await sql<UserRow>`
      select u.id, u.email, u.name, u."createdAt" as created_at,
        w.locale, w.plan, w.searches_used, w.last_seen_at,
        exists(select 1 from platform_admins a where a.user_id = u.id) as is_admin
      from "user" u
      left join workspaces w on w.user_id = u.id
      where u.email is not null
      order by u."createdAt" desc
      limit 400`;
  } catch (err) {
    console.error("[norf] automation users", err);
    return { queued: 0 };
  }
  const now = Date.now();
  for (const u of users) {
    if (!u.email || u.is_admin) continue;
    const created = u.created_at ? new Date(isoTime(u.created_at) ?? 0).getTime() : 0;
    const seen = u.last_seen_at ? new Date(isoTime(u.last_seen_at) ?? 0).getTime() : null;
    const locale = u.locale;
    const name = u.name;
    const plan = normalizePlanId(u.plan);
    const used = Number(u.searches_used ?? 0) || 0;
    const limit = searchesLimitFor(plan, false);
    const gates = automationGates(now, { createdAt: created || null, lastSeenAt: seen });
    let runCount = 0;
    let newestRun = 0;
    try {
      const runs = await sql<{ n: number; newest: string | Date | null }>`
        select count(*)::int as n, max(created_at) as newest
        from search_runs where user_id = ${u.id}`;
      runCount = runs[0]?.n ?? 0;
      newestRun = runs[0]?.newest ? new Date(isoTime(runs[0].newest) ?? 0).getTime() : 0;
    } catch {
      runCount = 0;
    }

    if (gates.welcome) {
      const r = await queueCampaign(sql, {
        campaign: "welcome",
        email: u.email,
        userId: u.id,
        name,
        locale,
      });
      if (r.queued) queued += 1;
    }

    if (gates.noSearchDay1 && runCount === 0) {
      const r = await queueCampaign(sql, {
        campaign: "no_search_day1",
        email: u.email,
        userId: u.id,
        name,
        locale,
      });
      if (r.queued) queued += 1;
    }

    if (gates.day3 && created && runCount > 0) {
      const r = await queueCampaign(sql, {
        campaign: "day3_checkin",
        email: u.email,
        userId: u.id,
        name,
        locale,
        scheduledAt: new Date(created + 3 * DAY),
      });
      if (r.queued) queued += 1;
    }

    if (gates.winback1) {
      const r = await queueCampaign(sql, {
        campaign: "winback_1",
        email: u.email,
        userId: u.id,
        name,
        locale,
      });
      if (r.queued) queued += 1;
    }
    if (gates.winback2) {
      const sent1 = await sql<{ id: string }>`select id from mail_outbox where user_id = ${u.id} and campaign = ${"winback_1"} and status in ('queued','sent') limit 1`;
      if (sent1[0]) {
        const r = await queueCampaign(sql, {
          campaign: "winback_2",
          email: u.email,
          userId: u.id,
          name,
          locale,
        });
        if (r.queued) queued += 1;
      }
    }
    if (gates.winback3) {
      const sent2 = await sql<{ id: string }>`select id from mail_outbox where user_id = ${u.id} and campaign = ${"winback_2"} and status in ('queued','sent') limit 1`;
      if (sent2[0]) {
        const r = await queueCampaign(sql, {
          campaign: "winback_3",
          email: u.email,
          userId: u.id,
          name,
          locale,
        });
        if (r.queued) queued += 1;
      }
    }

    if (!isUnlimitedQuota(limit) && limit > 0 && used >= Math.ceil(limit * 0.8) && used < limit) {
      await queueQuotaMail(sql, u.id, "nudge80");
    }

    if (runCount > 0 && newestRun && now - newestRun < 3 * DAY) {
      const r = await queueCampaign(sql, {
        campaign: "first_search",
        email: u.email,
        userId: u.id,
        name,
        locale,
      });
      if (r.queued) queued += 1;
    }
  }
  return { queued };
}

const globalMail = globalThis as typeof globalThis & { __norfMailTick__?: number };

export async function runMailTick(sql: Sql): Promise<{ sent: number; queued: number }> {
  const now = Date.now();
  const last = globalMail.__norfMailTick__ ?? 0;
  const out = await processMailOutbox(sql, 10);
  let queued = 0;
  if (now - last > 60_000) {
    globalMail.__norfMailTick__ = now;
    const r = await scheduleAutomations(sql);
    queued = r.queued;
  }
  return { sent: out.sent, queued };
}
