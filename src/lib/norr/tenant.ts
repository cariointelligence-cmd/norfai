import type { Sql } from "@/lib/db";
import { getSql } from "@/lib/db";
import { ensurePlatformIdentity, lookupUserEmail } from "./platform.ts";
import { roleFromIdentity, type Role } from "./authz.ts";
import { ensureWorkspace } from "./repo.ts";

export { teamSeatCap } from "./platform.ts";

export type Tenant = {
  tenantUserId: string;
  actorUserId: string;
  isOwner: boolean;
  memberRole: "owner" | "admin" | "member";
};

const OPS_STMTS = [
    `create table if not exists workspace_members (
      id text primary key, owner_user_id text not null, member_user_id text, email text not null,
      role text not null default 'member', status text not null default 'invited',
      invited_at timestamptz not null default now(), joined_at timestamptz)`,
    `create unique index if not exists workspace_members_owner_email_idx on workspace_members (owner_user_id, email)`,
    `create table if not exists account_exclusions (
      id text primary key, user_id text not null, kind text not null, value text not null,
      value_normalized text not null, label text, source text not null default 'upload',
      created_at timestamptz not null default now(), unique (user_id, kind, value_normalized))`,
    `create table if not exists company_activities (
      id text primary key, user_id text not null, company_id text not null, actor_id text not null,
      kind text not null, outcome text, body text, created_at timestamptz not null default now())`,
    `create table if not exists company_snapshots (
      id text primary key, user_id text not null, company_id text not null, taken_at timestamptz not null default now(),
      website text, content_hash text, decision_maker text, revenue text, profit text, ads text,
      people_hash text, phone text, email text, business_status text)`,
    `create table if not exists company_changes (
      id text primary key, user_id text not null, company_id text not null, field text not null,
      old_value text, new_value text, summary text not null, severity text not null default 'info',
      detected_at timestamptz not null default now(), read_at timestamptz)`,
    `create table if not exists crm_connections (
      id text primary key, user_id text not null, provider text not null, token_last4 text, portal text,
      last_push_at timestamptz, last_error text, created_at timestamptz not null default now(),
      unique (user_id, provider))`,
    `create table if not exists crm_pushes (
      id text primary key, user_id text not null, company_id text not null, provider text not null,
      remote_id text, status text not null, error text, created_at timestamptz not null default now())`,
    `create table if not exists digests (
      id text primary key, user_id text not null, period_start timestamptz not null, period_end timestamptz not null,
      payload jsonb not null default '{}', created_at timestamptz not null default now())`,
    `alter table companies add column if not exists parent_company_id text`,
    `alter table companies add column if not exists parent_business_id text`,
    `alter table companies add column if not exists parent_name text`,
    `alter table companies add column if not exists group_role text`,
    `alter table companies add column if not exists phone_class text`,
    `alter table companies add column if not exists call_brief jsonb`,
    `alter table companies add column if not exists activity_outcome text`,
    `alter table companies add column if not exists last_activity_at timestamptz`,
    `alter table companies add column if not exists assigned_owner text`,
    `alter table companies add column if not exists equity numeric`,
    `alter table companies add column if not exists assets numeric`,
    `alter table companies add column if not exists liabilities numeric`,
    `alter table companies add column if not exists equity_ratio numeric`,
    `alter table companies add column if not exists financial_source text`,
    `alter table companies add column if not exists previous_revenue numeric`,
    `alter table companies add column if not exists financial_conflict text`,
    `alter table contacts add column if not exists phone_role text`,
    `alter table lists add column if not exists kind text not null default 'list'`,
    `alter table search_runs add column if not exists created_by_user_id text`,
    `alter table search_runs add column if not exists correlation_id text`,
    `alter table search_runs add column if not exists updated_at timestamptz not null default now()`,
    `alter table jobs add column if not exists lease_until timestamptz`,
    `alter table jobs add column if not exists generation integer not null default 1`,
    `alter table jobs add column if not exists capability text`,
    `create table if not exists worker_queue_snapshots (
      id text primary key,
      taken_at timestamptz not null default now(),
      queued integer not null default 0,
      running integer not null default 0,
      depth integer not null default 0,
      oldest_queued_ms integer,
      child_crawls integer not null default 0,
      stale_running integer not null default 0,
      users integer not null default 0,
      runs integer not null default 0,
      by_type jsonb not null default '[]',
      pressure text not null default 'idle',
      pruned integer not null default 0,
      stolen integer not null default 0)`,
    `create table if not exists financial_periods (
      id text primary key, user_id text not null, company_id text not null, year text,
      period_end date, revenue numeric, profit numeric, equity numeric, assets numeric,
      liabilities numeric, equity_ratio numeric, currency text not null default 'EUR',
      source_id text not null, source_url text, conflict_state text, observed_at timestamptz not null default now())`,
];

export async function ensureOpsSchema(sql: Sql): Promise<void> {
  const g = globalThis as typeof globalThis & { __norfOpsSchema__?: Promise<void> };
  g.__norfOpsSchema__ ??= (async () => {
    for (const stmt of OPS_STMTS) {
      try {
        await sql.query(stmt);
      } catch {
        /* idempotent */
      }
    }
  })().catch((err) => {
    g.__norfOpsSchema__ = undefined;
    throw err;
  });
  await g.__norfOpsSchema__;
}

export async function scoped(context: { userId: string }): Promise<{
  sql: Sql;
  uid: string;
  actor: string;
  isOwner: boolean;
  identity: Awaited<ReturnType<typeof ensurePlatformIdentity>>;
  memberRole: "owner" | "admin" | "member";
  role: Role;
}> {
  const sql = await getSql();
  await ensureOpsSchema(sql);
  const actor = context.userId;
  const identity = await ensurePlatformIdentity(sql, actor);
  try {
    const email = identity.email ?? (await lookupUserEmail(sql, actor));
    if (email) {
      await sql`update workspace_members
        set member_user_id = ${actor}, status = ${"active"}, joined_at = coalesce(joined_at, now())
        where lower(email) = ${email}
          and status = ${"invited"}
          and (member_user_id is null or member_user_id = ${actor})`;
    }
  } catch {
    /* invite table optional */
  }
  let ownerId = actor;
  let memberRole: "owner" | "admin" | "member" = "owner";
  try {
    const rows = await sql<{ owner_user_id: string; role: string; status: string }>`
      select owner_user_id, role, status from workspace_members
      where member_user_id = ${actor} and status = ${"active"}
      limit 1`;
    if (rows[0]?.owner_user_id && rows[0].owner_user_id !== actor) {
      ownerId = rows[0].owner_user_id;
      memberRole = rows[0].role === "admin" ? "admin" : "member";
    }
  } catch {
    ownerId = actor;
  }
  await ensureWorkspace(sql, ownerId);
  const isOwner = ownerId === actor;
  const role = roleFromIdentity({ isAdmin: identity.isAdmin, plan: identity.plan });
  return { sql, uid: ownerId, actor, isOwner, identity, memberRole, role };
}

export function effectiveWorkspaceOwner(opts: {
  actorId: string;
  membershipOwnerId: string | null;
  membershipStatus: string | null;
}): string {
  if (opts.membershipOwnerId && opts.membershipStatus === "active" && opts.membershipOwnerId !== opts.actorId) {
    return opts.membershipOwnerId;
  }
  return opts.actorId;
}
