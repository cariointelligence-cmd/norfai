import type { Sql } from "@/lib/db";
import { nid } from "../utils.ts";
import { hashPassword } from "better-auth/crypto";
import { isoTime } from "../format.ts";
import { ensureWorkspace } from "./repo.ts";
import {
  ensurePlatformSchema,
  inviteAdmin,
  isPlatformAdmin,
  normalizePlanId,
  type PlanId,
} from "./platform.ts";
import {
  generateTempPassword,
  isPlanId,
  parseCreateUserInput,
  parseQuotaGrant,
} from "./admin-user-input.ts";

export {
  generateTempPassword,
  isPlanId,
  parseAdminEmail,
  parseCreateUserInput,
  parseQuotaGrant,
  type CreateUserInput,
} from "./admin-user-input.ts";


export type PlatformUserRow = {
  id: string;
  email: string;
  name: string;
  createdAt: string | null;
  plan: PlanId;
  planSource: string | null;
  searchesUsed: number;
  adminRole: string | null;
  companies: number;
  companiesThisPeriod: number;
  giftedAt: string | null;
  bonusSearches: number;
  bonusLeads: number;
};

export async function listPlatformUsers(sql: Sql, granterId: string, q = ""): Promise<{ ok: true; users: PlatformUserRow[] } | { ok: false; error: string }> {
  if (!(await isPlatformAdmin(sql, granterId))) return { ok: false, error: "Admin only" };
  await ensurePlatformSchema(sql);
  const needle = q.trim().toLowerCase().slice(0, 80);
  const like = needle ? `%${needle}%` : "";
  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = await sql`
      select u.id, u.email, u.name, u."createdAt" as created_at,
        coalesce(w.plan, 'free') as plan, w.plan_source, coalesce(w.searches_used, 0) as searches_used,
        coalesce(w.bonus_searches, 0) as bonus_searches, coalesce(w.bonus_leads, 0) as bonus_leads,
        w.gifted_at, pa.role as admin_role,
        (select count(*)::int from companies c where c.user_id = u.id and c.deleted_at is null) as companies,
        (select count(*)::int from companies c where c.user_id = u.id and c.deleted_at is null
          and c.created_at >= coalesce(w.plan_period_start, now() - interval '32 days')) as companies_this_period
      from "user" u
      left join workspaces w on w.user_id = u.id
      left join platform_admins pa on pa.user_id = u.id
      where ${like} = '' or lower(u.email) like ${like} or lower(coalesce(u.name, '')) like ${like}
      order by u."createdAt" desc
      limit 500`;
  } catch {
    try {
      rows = await sql`
        select u.id, u.email, u.name, u."createdAt" as created_at,
          coalesce(w.plan, 'free') as plan, coalesce(w.searches_used, 0) as searches_used,
          pa.role as admin_role,
          (select count(*)::int from companies c where c.user_id = u.id and c.deleted_at is null) as companies
        from "user" u
        left join workspaces w on w.user_id = u.id
        left join platform_admins pa on pa.user_id = u.id
        where ${like} = '' or lower(u.email) like ${like} or lower(coalesce(u.name, '')) like ${like}
        order by u."createdAt" desc
        limit 500`;
    } catch {
      return { ok: false, error: "Users could not be listed." };
    }
  }
  return {
    ok: true,
    users: rows.map((r) => ({
      id: String(r.id),
      email: String(r.email ?? ""),
      name: String(r.name ?? ""),
      createdAt: isoTime(r.created_at),
      plan: normalizePlanId(String(r.plan ?? "free")),
      planSource: r.plan_source != null ? String(r.plan_source) : null,
      searchesUsed: Number(r.searches_used ?? 0) || 0,
      adminRole: r.admin_role != null ? String(r.admin_role) : null,
      companies: Number(r.companies ?? 0) || 0,
      companiesThisPeriod: Number(r.companies_this_period ?? r.companies ?? 0) || 0,
      giftedAt: isoTime(r.gifted_at),
      bonusSearches: Number(r.bonus_searches ?? 0) || 0,
      bonusLeads: Number(r.bonus_leads ?? 0) || 0,
    })),
  };
}

export async function createPlatformUser(
  sql: Sql,
  granterId: string,
  data: Record<string, unknown>,
): Promise<{ ok: true; userId: string; email: string; password: string | null; generated: boolean } | { ok: false; error: string }> {
  if (!(await isPlatformAdmin(sql, granterId))) return { ok: false, error: "Admin only" };
  const parsed = parseCreateUserInput(data);
  if (!parsed.ok) return parsed;
  await ensurePlatformSchema(sql);
  const { email, name, plan, makeAdmin } = parsed.value;
  const existing = await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
  if (existing[0]) return { ok: false, error: "That email already has an account." };
  const generated = !parsed.value.password;
  const password = parsed.value.password ?? generateTempPassword();
  const hashed = await hashPassword(password);
  const userId = nid();
  const accountId = nid();
  try {
    await sql`
      insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values (${userId}, ${name}, ${email}, ${true}, now(), now())`;
    await sql`
      insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${accountId}, ${userId}, ${"credential"}, ${userId}, ${hashed}, now(), now())`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(msg)) return { ok: false, error: "That email already has an account." };
    return { ok: false, error: "Could not create the account." };
  }
  await ensureWorkspace(sql, userId);
  if (plan !== "free") {
    const g = await giftWorkspacePlan(sql, granterId, userId, plan);
    if (!g.ok) return { ok: true, userId, email, password: generated ? password : null, generated };
  }
  if (makeAdmin) {
    await inviteAdmin(sql, granterId, email);
  }
  try {
    const { queueAccountReady } = await import("./mail-automations.ts");
    await queueAccountReady(sql, userId, email);
  } catch (err) {
    console.error("[norf] account ready mail", err);
  }
  return { ok: true, userId, email, password: generated ? password : null, generated };
}

export async function giftWorkspacePlan(
  sql: Sql,
  granterId: string,
  targetUserId: string,
  planRaw: unknown,
): Promise<{ ok: true; plan: PlanId } | { ok: false; error: string }> {
  if (!(await isPlatformAdmin(sql, granterId))) return { ok: false, error: "Admin only" };
  const target = String(targetUserId ?? "").slice(0, 128);
  if (!target) return { ok: false, error: "User not found" };
  const raw = String(planRaw ?? "").toLowerCase().trim();
  if (!raw || (!isPlanId(raw) && raw !== "scale")) return { ok: false, error: "Choose a plan." };
  const plan = isPlanId(planRaw) ? planRaw : normalizePlanId(raw);
  const user = await sql<{ id: string }>`select id from "user" where id = ${target} limit 1`;
  if (!user[0]) return { ok: false, error: "User not found" };
  await ensureWorkspace(sql, target);
  try {
    await sql`update workspaces set
      plan = ${plan},
      plan_source = ${"admin_gift"},
      gifted_by = ${granterId},
      gifted_at = now(),
      plan_period_start = now(),
      searches_used = 0,
      updated_at = now()
      where user_id = ${target}`;
  } catch {
    await sql`update workspaces set
      plan = ${plan},
      plan_period_start = now(),
      searches_used = 0,
      updated_at = now()
      where user_id = ${target}`;
  }
  try {
    const { queuePlanGifted } = await import("./mail-automations.ts");
    await queuePlanGifted(sql, target, plan);
  } catch (err) {
    console.error("[norf] plan gifted mail", err);
  }
  return { ok: true, plan };
}

export async function grantWorkspaceQuota(
  sql: Sql,
  granterId: string,
  raw: unknown,
): Promise<{ ok: true; searches: number; leads: number; bonusSearches: number; bonusLeads: number } | { ok: false; error: string }> {
  if (!(await isPlatformAdmin(sql, granterId))) return { ok: false, error: "Admin only" };
  const parsed = parseQuotaGrant(raw);
  if (!parsed.ok) return parsed;
  const user = await sql<{ id: string }>`select id from "user" where id = ${parsed.userId} limit 1`;
  if (!user[0]) return { ok: false, error: "User not found" };
  await ensureWorkspace(sql, parsed.userId);
  await ensurePlatformSchema(sql);
  try {
    await sql`update workspaces set
      bonus_searches = coalesce(bonus_searches, 0) + ${parsed.searches},
      bonus_leads = coalesce(bonus_leads, 0) + ${parsed.leads},
      updated_at = now()
      where user_id = ${parsed.userId}`;
  } catch {
    return { ok: false, error: "Could not add quota. Try again." };
  }
  const row = await sql<{ bonus_searches: number; bonus_leads: number }>`
    select coalesce(bonus_searches, 0) as bonus_searches, coalesce(bonus_leads, 0) as bonus_leads
    from workspaces where user_id = ${parsed.userId} limit 1`.catch(() => []);
  try {
    await sql`insert into audit_events (id, user_id, action, entity_type, entity_id, meta)
      values (${nid()}, ${granterId}, ${"admin.quota_grant"}, ${"user"}, ${parsed.userId},
        ${JSON.stringify({ searches: parsed.searches, leads: parsed.leads })}::jsonb)`;
  } catch { /* audit optional */ }
  return {
    ok: true,
    searches: parsed.searches,
    leads: parsed.leads,
    bonusSearches: Number(row[0]?.bonus_searches ?? parsed.searches),
    bonusLeads: Number(row[0]?.bonus_leads ?? parsed.leads),
  };
}

export async function grantAdminByUserId(
  sql: Sql,
  granterId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isPlatformAdmin(sql, granterId))) return { ok: false, error: "Admin only" };
  const target = String(targetUserId ?? "").slice(0, 128);
  const user = await sql<{ email: string }>`select email from "user" where id = ${target} limit 1`;
  if (!user[0]?.email) return { ok: false, error: "User not found" };
  return inviteAdmin(sql, granterId, user[0].email);
}
