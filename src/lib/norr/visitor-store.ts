import type { Sql } from "@/lib/db";
import { nid } from "../utils.ts";
import {
  classifyIdentity,
  deviceEngine,
  geoEngine,
  mintVisitorId,
  parseVisitorId,
  readCookie,
  sanitizePath,
  shouldSkipPath,
  VISITOR_COOKIE,
  visitorCookieHeader,
} from "./visitor-track.ts";
import { clientIp } from "./api-shield.ts";

export async function ensureVisitorSchema(sql: Sql): Promise<void> {
  await sql.query(`create table if not exists visitor_hits (
    id text primary key,
    vid text not null,
    ip text not null,
    path text not null,
    referrer text,
    ua text,
    country text,
    region text,
    city text,
    device text,
    os text,
    user_id text,
    email text,
    name text,
    identity_class text not null default 'unknown',
    created_at timestamptz not null default now()
  )`);
  await sql.query("create index if not exists visitor_hits_created_idx on visitor_hits (created_at desc)");
  await sql.query("create index if not exists visitor_hits_vid_idx on visitor_hits (vid, created_at desc)");
  await sql.query("create index if not exists visitor_hits_ip_idx on visitor_hits (ip, created_at desc)");
}

export async function recordVisitorHit(opts: {
  sql: Sql;
  request: Request;
  path?: unknown;
  referrer?: unknown;
  userId?: string | null;
}): Promise<{ vid: string; setCookie: string | null }> {
  const incoming = parseVisitorId(readCookie(opts.request.headers.get("cookie"), VISITOR_COOKIE));
  const vid = incoming ?? mintVisitorId();
  const path = sanitizePath(opts.path ?? new URL(opts.request.url).pathname);
  if (shouldSkipPath(path)) return { vid, setCookie: incoming ? null : visitorCookieHeader(vid) };
  const ip = clientIp(opts.request);
  const ua = (opts.request.headers.get("user-agent") ?? "").slice(0, 400);
  const device = deviceEngine(ua);
  if (device.bot) return { vid, setCookie: incoming ? null : visitorCookieHeader(vid) };
  const geo = geoEngine(opts.request.headers);
  let sessionEmail: string | null = null;
  let sessionName: string | null = null;
  if (opts.userId) {
    try {
      const row = await opts.sql<{ email: string | null; name: string | null }>`
        select email, name from "user" where id = ${opts.userId} limit 1`;
      sessionEmail = row[0]?.email?.toLowerCase().trim() ?? null;
      sessionName = row[0]?.name?.trim() || null;
    } catch { /* */ }
  }
  let cookieEmail: string | null = null;
  let ipEmail: string | null = null;
  try {
    if (!sessionEmail) {
      const linked = await opts.sql<{ email: string }>`
        select email from visitor_hits
        where vid = ${vid} and email is not null and created_at > now() - interval '30 days'
        order by created_at desc limit 1`;
      cookieEmail = linked[0]?.email ?? null;
    }
    if (!sessionEmail && !cookieEmail) {
      const byIp = await opts.sql<{ email: string }>`
        select email from visitor_hits
        where ip = ${ip} and email is not null and created_at > now() - interval '7 days'
        order by created_at desc limit 1`;
      ipEmail = byIp[0]?.email ?? null;
    }
  } catch { /* first hit before table */ }
  const ident = classifyIdentity({ sessionEmail, sessionName, cookieEmail, ipEmail });
  const ref = String(opts.referrer ?? opts.request.headers.get("referer") ?? "").slice(0, 400) || null;
  try {
    await ensureVisitorSchema(opts.sql);
    await opts.sql`insert into visitor_hits (
      id, vid, ip, path, referrer, ua, country, region, city, device, os, user_id, email, name, identity_class
    ) values (
      ${nid()}, ${vid}, ${ip}, ${path}, ${ref}, ${ua},
      ${geo.country}, ${geo.region}, ${geo.city}, ${device.family}, ${device.os},
      ${opts.userId ?? null}, ${ident.email}, ${ident.name}, ${ident.class}
    )`;
  } catch (err) {
    console.error("[norf] visitor hit", err instanceof Error ? err.message : err);
  }
  return { vid, setCookie: incoming ? null : visitorCookieHeader(vid) };
}

export async function listVisitorFeed(sql: Sql, limit = 200) {
  await ensureVisitorSchema(sql);
  const cap = Math.min(400, Math.max(20, limit));
  const sessions = await sql<Record<string, unknown>>`
    select vid,
      max(created_at) as last_seen,
      min(created_at) as first_seen,
      count(*)::int as hits,
      (array_agg(ip order by created_at desc))[1] as ip,
      (array_agg(path order by created_at desc))[1] as path,
      (array_agg(country order by created_at desc))[1] as country,
      (array_agg(city order by created_at desc))[1] as city,
      (array_agg(device order by created_at desc))[1] as device,
      (array_agg(os order by created_at desc))[1] as os,
      (array_agg(email order by created_at desc) filter (where email is not null))[1] as email,
      (array_agg(name order by created_at desc) filter (where name is not null))[1] as name,
      (array_agg(identity_class order by created_at desc))[1] as identity_class,
      (array_agg(user_id order by created_at desc) filter (where user_id is not null))[1] as user_id,
      (array_agg(referrer order by created_at desc) filter (where referrer is not null))[1] as referrer
    from visitor_hits
    where created_at > now() - interval '30 days'
    group by vid
    order by max(created_at) desc
    limit ${cap}`;
  const hits = await sql<Record<string, unknown>>`
    select id, vid, ip, path, referrer, country, city, device, os, email, name, identity_class, user_id, created_at
    from visitor_hits
    where created_at > now() - interval '2 days'
    order by created_at desc
    limit 80`;
  const [totals] = await sql<{ n: number; identified: number }>`
    select count(*)::int as n,
      count(*) filter (where email is not null)::int as identified
    from visitor_hits where created_at > now() - interval '24 hours'`;
  return {
    sessions,
    hits,
    last24h: Number(totals?.n ?? 0),
    identified24h: Number(totals?.identified ?? 0),
  };
}
