import type { Sql } from "../db.ts";
import { nid } from "../utils.ts";
import { auditPublicSite } from "./audit.ts";
import { ensureGscSchema } from "./gsc.ts";

export async function ensureSeoSchema(sql: Sql): Promise<void> {
  await sql.query(`create table if not exists seo_changelog (
    id text primary key,
    path text not null,
    action text not null,
    reason text,
    previous text,
    next text,
    created_at timestamptz not null default now()
  )`);
  await sql.query("create index if not exists seo_changelog_created_idx on seo_changelog (created_at desc)");
  await sql.query(`create table if not exists seo_snapshots (
    id text primary key,
    health integer not null,
    geo integer not null,
    issues jsonb not null default '[]',
    pages integer not null default 0,
    created_at timestamptz not null default now()
  )`);
  await ensureGscSchema(sql);
}

export async function logSeoChange(
  sql: Sql,
  row: { path: string; action: string; reason?: string; previous?: string; next?: string },
): Promise<void> {
  await ensureSeoSchema(sql);
  await sql`
    insert into seo_changelog (id, path, action, reason, previous, next)
    values (${nid()}, ${row.path}, ${row.action}, ${row.reason ?? null}, ${row.previous ?? null}, ${row.next ?? null})`;
}

export async function snapshotSeo(sql: Sql): Promise<{ health: number; geo: number; issues: number }> {
  await ensureSeoSchema(sql);
  let newsCount = 0;
  try {
    const n = await sql<{ n: number }>`select count(*)::int as n from blog_posts where status = ${"published"}`;
    newsCount = n[0]?.n ?? 0;
  } catch {
    newsCount = 0;
  }
  const audit = auditPublicSite({ newsCount });
  await sql`
    insert into seo_snapshots (id, health, geo, issues, pages)
    values (${nid()}, ${audit.health}, ${audit.geo}, ${JSON.stringify(audit.issues)}::jsonb, ${audit.pages})`;
  return { health: audit.health, geo: audit.geo, issues: audit.issues.length };
}

export async function recentSeoLog(sql: Sql, limit = 40) {
  await ensureSeoSchema(sql);
  return sql<{
    id: string; path: string; action: string; reason: string | null; previous: string | null; next: string | null; created_at: string;
  }>`select id, path, action, reason, previous, next, created_at from seo_changelog order by created_at desc limit ${limit}`;
}
