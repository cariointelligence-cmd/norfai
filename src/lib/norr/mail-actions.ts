import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isoTime } from "@/lib/format";
import { ensurePlatformIdentity } from "./platform.ts";
import { boundedString, rateLimit, rateLimitMessage } from "./security.ts";
import {
  ensureMailSchema,
  lookupUnsubEmail,
  mailerStatusFor,
  processMailOutbox,
  publicMailSettings,
  retryFailedMail,
  requeueResendFromFailures,
  saveMailSettings,
  type OutboxRow,
} from "./mailer.ts";
import { applyUnsubscribe, publicMailOrigin } from "./mailer.ts";
import { campaignLabel } from "./mail-copy.ts";
import { runMailTick, sendAdminTestMail } from "./mail-automations.ts";

function viewRow(r: OutboxRow) {
  return {
    id: r.id,
    campaign: r.campaign,
    campaignLabel: campaignLabel(r.campaign),
    userId: r.user_id,
    email: r.email,
    toName: r.to_name,
    subject: r.subject,
    status: r.status,
    scheduledAt: isoTime(r.scheduled_at),
    sentAt: isoTime(r.sent_at),
    error: r.error,
    provider: r.provider,
    createdAt: isoTime(r.created_at),
  };
}

export const adminMailOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { status?: string; campaign?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    await ensureMailSchema(sql);
    const status = boundedString(data.status ?? "", 20);
    const campaign = boundedString(data.campaign ?? "", 40);
    const rows = status
      ? await sql<OutboxRow>`
          select * from mail_outbox
          where status = ${status} and (${campaign} = '' or campaign = ${campaign})
          order by created_at desc limit 150`
      : await sql<OutboxRow>`
          select * from mail_outbox
          where (${campaign} = '' or campaign = ${campaign})
          order by created_at desc limit 150`;
    const counts = await sql<{ status: string; n: number }>`
      select status, count(*)::int as n from mail_outbox group by status`;
    const campaigns = await sql<{ campaign: string; n: number }>`
      select campaign, count(*)::int as n from mail_outbox group by campaign order by n desc`;
    const mailer = await mailerStatusFor(sql);
    const settings = await publicMailSettings(sql);
    return {
      ok: true as const,
      mailer,
      settings,
      origin: publicMailOrigin(),
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      campaigns: campaigns.map((c) => ({ campaign: c.campaign, label: campaignLabel(c.campaign), n: c.n })),
      rows: rows.map(viewRow),
    };
  });

export const adminRetryMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    return retryFailedMail(sql, boundedString(data.id, 80));
  });

export const adminFlushMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    await requeueResendFromFailures(sql);
    const { flushStuckSupportMail } = await import("./support-store.ts");
    const recovered = await flushStuckSupportMail(sql);
    const sent = await processMailOutbox(sql, 24);
    const sched = await runMailTick(sql);
    return { ok: true as const, ...sent, recovered: recovered.recovered, queued: sched.queued };
  });

export const adminSaveMailSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    smtpHost?: string;
    smtpPort?: string;
    smtpUser?: string;
    smtpPass?: string;
    smtpSecure?: boolean;
    resendApiKey?: string;
    mailFrom?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    const saved = await saveMailSettings(sql, {
      smtpHost: boundedString(data.smtpHost ?? "", 200),
      smtpPort: boundedString(data.smtpPort ?? "587", 8),
      smtpUser: boundedString(data.smtpUser ?? "", 190),
      smtpPass: boundedString(data.smtpPass ?? "", 400),
      smtpSecure: Boolean(data.smtpSecure),
      resendApiKey: boundedString(data.resendApiKey ?? "", 200),
      mailFrom: boundedString(data.mailFrom ?? "", 200),
    });
    if (!saved.ok) return saved;
    await requeueResendFromFailures(sql);
    try {
      await processMailOutbox(sql, 20);
    } catch (err) {
      console.error("[norf] mail flush after save", err);
    }
    const mailer = await mailerStatusFor(sql);
    const settings = await publicMailSettings(sql);
    return { ok: true as const, mailer, settings };
  });

export const adminSendTestMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { extra?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    const rl = rateLimit(`mail:test:${context.userId}`, 6, 10 * 60 * 1000);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    const extra = boundedString(data.extra ?? "", 400)
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const r = await sendAdminTestMail(sql, extra);
    const delivered = r.results.filter((x) => x.ok).length;
    return { ok: true as const, ...r, delivered };
  });

export const publicUnsubscribe = createServerFn({ method: "POST" })
  .validator((d: { token: string; reason?: string }) => d)
  .handler(async ({ data }) => {
    const sql = await getSql();
    await ensureMailSchema(sql);
    const r = await applyUnsubscribe(sql, boundedString(data.token, 80), boundedString(data.reason ?? "", 200));
    if (!r.ok) return { ok: false as const, error: "Link is not valid." };
    return { ok: true as const, email: r.email };
  });

export const lookupUnsubscribe = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const sql = await getSql();
    await ensureMailSchema(sql);
    const email = await lookupUnsubEmail(sql, boundedString(data.token, 80));
    if (!email) return { ok: false as const, error: "Link is not valid." };
    return { ok: true as const, email };
  });
