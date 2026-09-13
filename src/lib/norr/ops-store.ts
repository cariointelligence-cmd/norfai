import type { Sql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { createHash } from "node:crypto";
import { diffSnapshots, type Snapshot } from "./changes.ts";

function asText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export async function takeCompanySnapshot(sql: Sql, userId: string, companyId: string): Promise<void> {
  const co = (await sql`
    select website, phone, general_email, revenue, profit, business_status, decision_maker, intel
    from companies where id = ${companyId} and user_id = ${userId} limit 1`)[0];
  if (!co) return;
  const page = (await sql`select content_hash from crawl_pages where user_id = ${userId} and company_id = ${companyId} and content_hash is not null order by fetched_at desc limit 1`)[0];
  const people = await sql<{ full_name: string; title: string | null }>`
    select full_name, title from people where user_id = ${userId} and company_id = ${companyId} and deleted_at is null order by full_name`;
  const peopleHash = people.length
    ? createHash("sha256").update(people.map((p) => `${p.full_name}|${p.title ?? ""}`).join(";")).digest("hex").slice(0, 16)
    : null;
  const intel = co.intel && typeof co.intel === "object" ? co.intel as { website?: { adPlatforms?: Record<string, string> } } : null;
  const ads = intel?.website?.adPlatforms ? JSON.stringify(intel.website.adPlatforms).slice(0, 200) : null;
  const next: Snapshot = {
    website: asText(co.website),
    content_hash: asText(page?.content_hash),
    decision_maker: asText(co.decision_maker) ?? asText(people[0]?.full_name),
    revenue: co.revenue != null ? String(co.revenue) : null,
    profit: co.profit != null ? String(co.profit) : null,
    ads,
    people_hash: peopleHash,
    phone: asText(co.phone),
    email: asText(co.general_email),
    business_status: asText(co.business_status),
  };
  let prev: Snapshot | null = null;
  try {
    const last = (await sql`
      select website, content_hash, decision_maker, revenue, profit, ads, people_hash, phone, email, business_status
      from company_snapshots where user_id = ${userId} and company_id = ${companyId} order by taken_at desc limit 1`)[0];
    if (last) prev = last as Snapshot;
  } catch {
    return;
  }
  const changes = diffSnapshots(prev, next);
  try {
    await sql`insert into company_snapshots (id, user_id, company_id, website, content_hash, decision_maker, revenue, profit, ads, people_hash, phone, email, business_status)
      values (${nid()}, ${userId}, ${companyId}, ${next.website}, ${next.content_hash}, ${next.decision_maker}, ${next.revenue}, ${next.profit}, ${next.ads}, ${next.people_hash}, ${next.phone}, ${next.email}, ${next.business_status})`;
  } catch {
    return;
  }
  for (const ch of changes) {
    await sql`insert into company_changes (id, user_id, company_id, field, old_value, new_value, summary, severity)
      values (${nid()}, ${userId}, ${companyId}, ${ch.field}, ${ch.oldValue}, ${ch.newValue}, ${ch.summary}, ${ch.severity})`;
  }
}

export async function buildWeeklyDigest(sql: Sql, userId: string): Promise<{ id: string; headline: string; count: number } | null> {
  const rows = await sql<{ company_id: string; summary: string; severity: string; name: string }>`
    select ch.company_id, ch.summary, ch.severity, c.name
    from company_changes ch join companies c on c.id = ch.company_id
    where ch.user_id = ${userId} and ch.detected_at > now() - interval '7 days' and c.deleted_at is null
    order by ch.detected_at desc
    limit 80`;
  const count = rows.length;
  const high = rows.filter((r) => r.severity === "high").length;
  const headline = count === 0
    ? "No changes this week"
    : `${count} changes · ${high} need a look`;
  const id = nid();
  const payload = {
    headline,
    count,
    high,
    items: rows.slice(0, 40).map((r) => ({ companyId: r.company_id, name: r.name, summary: r.summary, severity: r.severity })),
  };
  await sql`insert into digests (id, user_id, period_start, period_end, payload)
    values (${id}, ${userId}, now() - interval '7 days', now(), ${JSON.stringify(payload)}::jsonb)`;
  if (count > 0) {
    try {
      const { queueWeeklyDigestMail } = await import("./mail-automations.ts");
      await queueWeeklyDigestMail(sql, userId, {
        headline,
        count,
        items: payload.items.map((r) => ({ name: r.name, summary: r.summary })),
      });
    } catch (err) {
      console.error("[norf] digest mail", err);
    }
  }
  return { id, headline, count };
}
