import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ensurePlatformIdentity, lookupUserEmail } from "./platform.ts";
import { rateLimit, rateLimitMessage, boundedString } from "./security.ts";
import { clientIp } from "./request-meta.server.ts";
import {
  addMessage,
  createTicket,
  createTicketFromAdmin,
  listTicketsAdmin,
  listTicketsForUser,
  loadTicket,
  loadTicketByToken,
  setTicketStatus,
  type TicketPriority,
  type TicketStatus,
} from "./support-store.ts";
import { ensureMailSchema } from "./mailer.ts";

function publicLimit(op: string, max: number) {
  const ip = clientIp() ?? "anon";
  return rateLimit(`support:${op}:${ip}`, max, 60 * 60 * 1000);
}

export const createPublicTicket = createServerFn({ method: "POST" })
  .validator((d: { email: string; name?: string; subject: string; body: string; website?: string; locale?: string }) => d)
  .handler(async ({ data }) => {
    if (boundedString(data.website ?? "", 80)) return { ok: false as const, error: "Not found" };
    const rl = publicLimit("create", 8);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    const sql = await getSql();
    return createTicket(sql, {
      email: data.email,
      name: data.name,
      subject: data.subject,
      body: data.body,
      locale: data.locale,
    });
  });

export const getPublicTicket = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const sql = await getSql();
    await ensureMailSchema(sql);
    const row = await loadTicketByToken(sql, boundedString(data.token, 64));
    if (!row) return { ok: false as const, error: "Not found" };
    return { ok: true as const, ...row };
  });

export const replyPublicTicket = createServerFn({ method: "POST" })
  .validator((d: { token: string; body: string; website?: string }) => d)
  .handler(async ({ data }) => {
    if (boundedString(data.website ?? "", 80)) return { ok: false as const, error: "Not found" };
    const rl = publicLimit("reply", 20);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    const sql = await getSql();
    const row = await loadTicketByToken(sql, boundedString(data.token, 64));
    if (!row) return { ok: false as const, error: "Not found" };
    const r = await addMessage(sql, {
      ticketId: row.ticket.id,
      body: data.body,
      kind: "customer",
      authorEmail: row.ticket.email,
    });
    if (!r.ok) return r;
    return { ok: true as const };
  });

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureMailSchema(sql);
    const email = await lookupUserEmail(sql, context.userId);
    const tickets = await listTicketsForUser(sql, context.userId, email);
    return { tickets };
  });

export const createMyTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { subject: string; body: string; locale?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rl = rateLimit(`support:user:${context.userId}`, 12, 60 * 60 * 1000);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    const email = await lookupUserEmail(sql, context.userId);
    if (!email) return { ok: false as const, error: "Account email is missing." };
    let name: string | null = null;
    try {
      name = (await sql<{ name: string | null }>`select name from "user" where id = ${context.userId} limit 1`)[0]?.name ?? null;
    } catch {
      name = null;
    }
    return createTicket(sql, {
      email,
      name: name ?? "",
      subject: data.subject,
      body: data.body,
      userId: context.userId,
      locale: data.locale,
    });
  });

export const replyMyTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { ticketId: string; body: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const ticket = await loadTicket(sql, boundedString(data.ticketId, 80));
    if (!ticket) return { ok: false as const, error: "Not found" };
    const email = await lookupUserEmail(sql, context.userId);
    if (ticket.ticket.email !== email && !(await ownsTicket(sql, context.userId, ticket.ticket.id))) {
      return { ok: false as const, error: "Not found" };
    }
    return addMessage(sql, {
      ticketId: ticket.ticket.id,
      body: data.body,
      kind: "customer",
      authorId: context.userId,
      authorEmail: email,
    });
  });

export const getMyTicket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { ticketId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const ticket = await loadTicket(sql, boundedString(data.ticketId, 80));
    if (!ticket) return { ok: false as const, error: "Not found" };
    const email = await lookupUserEmail(sql, context.userId);
    if (ticket.ticket.email !== email && !(await ownsTicket(sql, context.userId, ticket.ticket.id))) {
      return { ok: false as const, error: "Not found" };
    }
    return { ok: true as const, ...ticket };
  });

async function ownsTicket(sql: Awaited<ReturnType<typeof getSql>>, userId: string, ticketId: string) {
  const row = await sql<{ id: string }>`select id from support_tickets where id = ${ticketId} and user_id = ${userId} limit 1`;
  return Boolean(row[0]);
}

export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { status?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    await ensureMailSchema(sql);
    const tickets = await listTicketsAdmin(sql, data.status);
    return { ok: true as const, tickets };
  });

export const adminGetTicket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { ticketId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    const row = await loadTicket(sql, boundedString(data.ticketId, 80));
    if (!row) return { ok: false as const, error: "Not found" };
    return { ok: true as const, ...row };
  });

export const adminReplyTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { ticketId: string; body: string; status?: TicketStatus; priority?: TicketPriority }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    const r = await addMessage(sql, {
      ticketId: boundedString(data.ticketId, 80),
      body: data.body,
      kind: "admin",
      authorId: context.userId,
      authorEmail: id.email,
      locale: "fi",
    });
    if (!r.ok) return r;
    if (data.status || data.priority) {
      await setTicketStatus(sql, data.ticketId, data.status ?? "pending", data.priority);
    }
    return { ok: true as const };
  });

export const adminSetTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { ticketId: string; status: TicketStatus; priority?: TicketPriority }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    await setTicketStatus(sql, boundedString(data.ticketId, 80), data.status, data.priority);
    return { ok: true as const };
  });

export const adminOpenTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    email: string;
    name?: string;
    subject: string;
    body: string;
    kind?: "support" | "request";
    priority?: TicketPriority;
  }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await ensurePlatformIdentity(sql, context.userId);
    if (!id.isAdmin) return { ok: false as const, error: "Admin only" };
    const rl = rateLimit(`support:admin-open:${context.userId}`, 30, 60 * 60 * 1000);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    return createTicketFromAdmin(sql, {
      email: data.email,
      name: data.name,
      subject: data.subject,
      body: data.body,
      kind: data.kind,
      priority: data.priority,
      adminId: context.userId,
      adminEmail: id.email,
      locale: "fi",
    });
  });
