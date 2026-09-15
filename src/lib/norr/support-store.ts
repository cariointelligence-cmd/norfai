import { randomBytes } from "node:crypto";
import type { Sql } from "../db.ts";
import { isoTime } from "../format.ts";
import { nid } from "../utils.ts";
import { boundedString } from "./security.ts";
import { ensureMailSchema, publicMailOrigin, validEmail, SUPPORT_INBOX, processMailOutbox } from "./mailer.ts";
import { queueCampaign } from "./mail-automations.ts";

export type TicketStatus = "open" | "pending" | "closed";
export type TicketPriority = "low" | "normal" | "high";

export type TicketRow = {
  id: string;
  public_token: string;
  user_id: string | null;
  email: string;
  name: string;
  subject: string;
  status: string;
  priority: string;
  origin: string | null;
  kind: string | null;
  opened_by: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  last_customer_at: string | Date | null;
  last_admin_at: string | Date | null;
};

export type MessageRow = {
  id: string;
  ticket_id: string;
  author_kind: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string | Date | null;
};

export function publicTicket(row: TicketRow) {
  return {
    id: row.id,
    publicToken: row.public_token,
    email: row.email,
    name: row.name,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    origin: row.origin || "customer",
    kind: row.kind || "support",
    openedBy: row.opened_by,
    createdAt: isoTime(row.created_at),
    updatedAt: isoTime(row.updated_at),
    lastCustomerAt: isoTime(row.last_customer_at),
    lastAdminAt: isoTime(row.last_admin_at),
  };
}

export function publicMessage(row: MessageRow) {
  return {
    id: row.id,
    authorKind: row.author_kind,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: isoTime(row.created_at),
  };
}

function token(): string {
  return randomBytes(18).toString("base64url");
}

export async function createTicket(
  sql: Sql,
  input: {
    email: string;
    name?: string;
    subject: string;
    body: string;
    userId?: string | null;
    locale?: string | null;
    origin?: "customer" | "admin";
    kind?: "support" | "request";
    priority?: TicketPriority;
    openedBy?: string | null;
    firstAuthor?: "customer" | "admin";
    adminEmail?: string | null;
  },
): Promise<{ ok: true; ticket: ReturnType<typeof publicTicket> } | { ok: false; error: string }> {
  await ensureMailSchema(sql);
  const email = validEmail(input.email);
  if (!email) return { ok: false, error: "A valid email is required." };
  const subject = boundedString(input.subject, 160).trim();
  const body = boundedString(input.body, 8000).replace(/\u0000/g, "").trim();
  const name = boundedString(input.name ?? "", 80).trim();
  if (subject.length < 4) return { ok: false, error: "Subject is too short." };
  if (body.length < 8) return { ok: false, error: "Message is too short." };
  const origin = input.origin === "admin" ? "admin" : "customer";
  const kind = input.kind === "request" ? "request" : "support";
  const priority = input.priority === "high" || input.priority === "low" ? input.priority : "normal";
  const firstAuthor = input.firstAuthor ?? (origin === "admin" ? "admin" : "customer");
  const id = nid();
  const publicToken = token();
  const now = new Date().toISOString();
  const status = origin === "admin" ? "pending" : "open";
  await sql`
    insert into support_tickets (
      id, public_token, user_id, email, name, subject, status, priority, origin, kind, opened_by,
      created_at, updated_at, last_customer_at, last_admin_at
    ) values (
      ${id}, ${publicToken}, ${input.userId ?? null}, ${email}, ${name}, ${subject}, ${status}, ${priority},
      ${origin}, ${kind}, ${input.openedBy ?? null}, ${now}, ${now},
      ${firstAuthor === "customer" ? now : null}, ${firstAuthor === "admin" ? now : null}
    )`;
  const mid = nid();
  const authorEmail = firstAuthor === "admin" ? (input.adminEmail ?? null) : email;
  await sql`
    insert into support_messages (id, ticket_id, author_kind, author_id, author_email, body)
    values (${mid}, ${id}, ${firstAuthor}, ${firstAuthor === "admin" ? input.openedBy ?? null : input.userId ?? null}, ${authorEmail}, ${body})`;
  const originUrl = publicMailOrigin();
  const customerUrl = `${originUrl}/support/t/${publicToken}`;
  const adminUrl = `${originUrl}/admin/support?ticket=${id}`;
  if (origin === "admin") {
    await queueCampaign(sql, {
      campaign: "ticket_opened",
      email,
      userId: input.userId,
      name,
      locale: input.locale,
      ticketUrl: customerUrl,
      items: [body.slice(0, 4000)],
      meta: { ticketId: id, origin: "admin", kind },
    });
  } else {
    await queueCampaign(sql, {
      campaign: "ticket_received",
      email,
      userId: input.userId,
      name,
      locale: input.locale,
      ticketUrl: customerUrl,
      meta: { ticketId: id },
    });
    for (const inbox of SUPPORT_INBOX) {
      await queueCampaign(sql, {
        campaign: "ticket_admin",
        email: inbox,
        name: "Norf admin",
        locale: "en",
        ticketUrl: adminUrl,
        meta: { ticketId: id, inbox: true, to: inbox },
      });
    }
  }
  try {
    await processMailOutbox(sql, 12);
  } catch (err) {
    console.error("[norf] ticket mail flush", err);
  }
  const row = (await sql<TicketRow>`select * from support_tickets where id = ${id} limit 1`)[0];
  return { ok: true, ticket: publicTicket(row!) };
}

export async function createTicketFromAdmin(
  sql: Sql,
  input: {
    email: string;
    name?: string;
    subject: string;
    body: string;
    kind?: "support" | "request";
    priority?: TicketPriority;
    adminId: string;
    adminEmail?: string | null;
    locale?: string | null;
  },
): Promise<{ ok: true; ticket: ReturnType<typeof publicTicket> } | { ok: false; error: string }> {
  const email = validEmail(input.email);
  if (!email) return { ok: false, error: "A valid customer email is required." };
  let userId: string | null = null;
  let name = boundedString(input.name ?? "", 80).trim();
  try {
    const user = (await sql<{ id: string; name: string | null }>`
      select id, name from "user" where lower(email) = ${email} limit 1`)[0];
    if (user) {
      userId = user.id;
      if (!name) name = (user.name ?? "").trim();
    }
  } catch {
    /* optional */
  }
  return createTicket(sql, {
    email,
    name,
    subject: input.subject,
    body: input.body,
    userId,
    locale: input.locale ?? "fi",
    origin: "admin",
    kind: input.kind,
    priority: input.priority,
    openedBy: input.adminId,
    firstAuthor: "admin",
    adminEmail: input.adminEmail,
  });
}

export async function addMessage(
  sql: Sql,
  opts: {
    ticketId: string;
    body: string;
    kind: "customer" | "admin";
    authorId?: string | null;
    authorEmail?: string | null;
    locale?: string | null;
  },
): Promise<{ ok: true; mailed: number; mailError?: string } | { ok: false; error: string }> {
  await ensureMailSchema(sql);
  const body = boundedString(opts.body, 8000).replace(/\u0000/g, "").trim();
  if (body.length < 2) return { ok: false, error: "Message is too short." };
  const ticket = (await sql<TicketRow>`select * from support_tickets where id = ${opts.ticketId} limit 1`)[0];
  if (!ticket) return { ok: false, error: "Not found" };
  const id = nid();
  await sql`
    insert into support_messages (id, ticket_id, author_kind, author_id, author_email, body)
    values (${id}, ${ticket.id}, ${opts.kind}, ${opts.authorId ?? null}, ${opts.authorEmail ?? null}, ${body})`;
  const status = opts.kind === "admin" ? "pending" : "open";
  if (opts.kind === "admin") {
    await sql`update support_tickets set status = ${status}, updated_at = now(), last_admin_at = now() where id = ${ticket.id}`;
    const origin = publicMailOrigin();
    await queueCampaign(sql, {
      campaign: "ticket_reply",
      email: ticket.email,
      userId: ticket.user_id,
      name: ticket.name,
      locale: opts.locale,
      ticketUrl: `${origin}/support/t/${ticket.public_token}`,
      items: [body.slice(0, 4000)],
      meta: { ticketId: ticket.id, messageId: id },
    });
  } else {
    await sql`update support_tickets set status = ${"open"}, updated_at = now(), last_customer_at = now() where id = ${ticket.id}`;
    const origin = publicMailOrigin();
    for (const inbox of SUPPORT_INBOX) {
      await queueCampaign(sql, {
        campaign: "ticket_admin",
        email: inbox,
        locale: "en",
        ticketUrl: `${origin}/admin/support?ticket=${ticket.id}`,
        meta: { ticketId: ticket.id, reply: true, to: inbox },
      });
    }
  }
  let mailed = 0;
  let mailError: string | undefined;
  try {
    const flush = await processMailOutbox(sql, 12);
    mailed = flush.sent;
    if (flush.failed > 0 && flush.sent === 0) mailError = "Mail provider rejected the message.";
    if (flush.sent === 0 && flush.failed === 0 && flush.skipped > 0) mailError = "Mail is not configured.";
  } catch (err) {
    console.error("[norf] ticket reply mail flush", err);
    mailError = "Mail flush failed.";
  }
  return { ok: true, mailed, mailError };
}

export async function setTicketStatus(sql: Sql, id: string, status: TicketStatus, priority?: TicketPriority) {
  const prev = (await sql<TicketRow>`select * from support_tickets where id = ${id} limit 1`)[0];
  if (priority) {
    await sql`update support_tickets set status = ${status}, priority = ${priority}, updated_at = now() where id = ${id}`;
  } else {
    await sql`update support_tickets set status = ${status}, updated_at = now() where id = ${id}`;
  }
  if (status === "closed" && prev && prev.status !== "closed") {
    try {
      const origin = publicMailOrigin();
      const { queueTicketClosed } = await import("./mail-automations.ts");
      await queueTicketClosed(sql, {
        email: prev.email,
        name: prev.name,
        userId: prev.user_id,
        ticketUrl: `${origin}/support/t/${prev.public_token}`,
      });
    } catch (err) {
      console.error("[norf] ticket closed mail", err);
    }
  }
}

export async function loadTicketByToken(sql: Sql, publicToken: string) {
  const ticket = (await sql<TicketRow>`select * from support_tickets where public_token = ${publicToken} limit 1`)[0];
  if (!ticket) return null;
  const messages = await sql<MessageRow>`select * from support_messages where ticket_id = ${ticket.id} order by created_at asc`;
  return { ticket: publicTicket(ticket), messages: messages.map(publicMessage) };
}

export async function loadTicket(sql: Sql, id: string) {
  const ticket = (await sql<TicketRow>`select * from support_tickets where id = ${id} limit 1`)[0];
  if (!ticket) return null;
  const messages = await sql<MessageRow>`select * from support_messages where ticket_id = ${ticket.id} order by created_at asc`;
  return { ticket: publicTicket(ticket), messages: messages.map(publicMessage) };
}

export async function listTicketsForUser(sql: Sql, userId: string, email?: string | null) {
  const rows = email
    ? await sql<TicketRow>`
        select * from support_tickets
        where user_id = ${userId} or lower(email) = ${email.toLowerCase()}
        order by updated_at desc limit 50`
    : await sql<TicketRow>`
        select * from support_tickets where user_id = ${userId} order by updated_at desc limit 50`;
  return rows.map(publicTicket);
}

export async function listTicketsAdmin(sql: Sql, status?: string) {
  const rows = status && status !== "all"
    ? await sql<TicketRow>`select * from support_tickets where status = ${status} order by updated_at desc limit 120`
    : await sql<TicketRow>`select * from support_tickets order by updated_at desc limit 120`;
  return rows.map(publicTicket);
}
