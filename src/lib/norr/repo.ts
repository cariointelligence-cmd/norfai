import type { Sql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { canonicalCompanyWebsite, normalizeDomain, normalizeName } from "./normalize.ts";
import { coreCompanyName, isDistinctiveCoreName } from "./dedupe.ts";
import type { ObservationInput } from "./types.ts";
import { isJobType } from "./security.ts";
import { parseLeadPrefs } from "./prefs.ts";
import { isoTime } from "../format.ts";

export async function ensureWorkspace(sql: Sql, userId: string) {
  try {
    const { ensureTargetingSchema } = await import("./targeting/schema.ts");
    await ensureTargetingSchema(sql);
  } catch {
    /* preview schema catch-up */
  }
  try {
    const { ensureSecuritySchema } = await import("./security.ts");
    await ensureSecuritySchema(sql);
  } catch {
    /* preview schema catch-up */
  }
  try {
    const { ensureSearchHardeningSchema } = await import("./exposure.ts");
    await ensureSearchHardeningSchema(sql);
  } catch {
    /* preview schema catch-up */
  }
  try {
    await sql.query("alter table workspaces add column if not exists preferences jsonb not null default '{}'");
    await sql.query("alter table lists add column if not exists rules jsonb");
  } catch {
    /* prefs schema catch-up */
  }
  let existing: Array<{ id: string; onboarded_at: string | null; name: string; lawful_basis: string | null; purpose: string | null; retention_days: number; country_allowlist: string; preferences?: unknown }> = [];
  try {
    existing = await sql`
      select id, onboarded_at, name, lawful_basis, purpose, retention_days, country_allowlist, preferences from workspaces where user_id = ${userId} limit 1`;
  } catch {
    existing = await sql`
      select id, onboarded_at, name, lawful_basis, purpose, retention_days, country_allowlist from workspaces where user_id = ${userId} limit 1`;
  }
  if (existing[0]) {
    const row = existing[0];
    return {
      ...row,
      onboarded_at: isoTime(row.onboarded_at) ?? row.onboarded_at,
      preferences: parseLeadPrefs(row.preferences),
    };
  }
  const id = nid();
  try {
    await sql`insert into workspaces (id, user_id, name, plan) values (${id}, ${userId}, ${"Workspace"}, ${"free"})`;
  } catch {
    await sql`insert into workspaces (id, user_id, name) values (${id}, ${userId}, ${"Workspace"})`;
  }
  await seedSourceHealth(sql, userId);
  try {
    const { queueWelcome } = await import("./mail-automations.ts");
    await queueWelcome(sql, userId);
  } catch (err) {
    console.error("[norf] welcome", err);
  }
  return {
    id,
    onboarded_at: null,
    name: "Workspace",
    lawful_basis: null,
    purpose: null,
    retention_days: 730,
    country_allowlist: "FI",
    preferences: parseLeadPrefs({}),
  };
}

export async function seedSourceHealth(sql: Sql, userId: string) {
  const { SOURCE_CATALOG, initialState } = await import("./sources/catalog.ts");
  for (const s of SOURCE_CATALOG) {
    const state = initialState(s);
    const enabled = s.implemented && (s.open || state === "connected");
    await sql`
      insert into source_health (user_id, source_id, state, enabled)
      values (${userId}, ${s.id}, ${state}, ${enabled})
      on conflict (user_id, source_id) do update set
        state = excluded.state,
        last_test_detail = case
          when source_health.state in ('not_implemented', 'optional_offline', 'missing_credentials')
            and excluded.state = 'connected'
          then 'homemade collector online'
          else source_health.last_test_detail
        end,
        enabled = case
          when source_health.state in ('not_implemented', 'optional_offline', 'missing_credentials')
            then excluded.enabled
          else source_health.enabled
        end
      where source_health.state in ('not_implemented', 'optional_offline', 'missing_credentials')
        and excluded.state = 'connected'`;
  }
}

export async function audit(
  sql: Sql,
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  detail?: unknown,
) {
  await sql`insert into audit_events (id, user_id, action, entity_type, entity_id, detail)
    values (${nid()}, ${userId}, ${action}, ${entityType ?? null}, ${entityId ?? null}, ${JSON.stringify(detail ?? {})}::jsonb)`;
}

export async function insertObservations(
  sql: Sql,
  userId: string,
  entityType: string,
  entityId: string,
  sourceId: string,
  sourceUrl: string | undefined,
  sourceType: string,
  items: ObservationInput[],
) {
  for (const o of items) {
    if (!o.rawValue && !o.normalisedValue) continue;
    const url = o.sourceUrl ?? sourceUrl ?? null;
    const dup = await sql<{ id: string }>`
      select id from observations
      where user_id = ${userId} and entity_type = ${entityType} and entity_id = ${entityId}
        and field = ${o.field} and source_id = ${sourceId}
        and coalesce(raw_value,'') = ${o.rawValue ?? ""}
      limit 1`;
    if (dup[0]) continue;
    await sql`insert into observations (
      id, user_id, entity_type, entity_id, field, source_id, source_url, source_type, dataset_id,
      raw_value, normalised_value, confidence, source_reliability, extraction_method, evidence, licence, verification_status
    ) values (
      ${nid()}, ${userId}, ${entityType}, ${entityId}, ${o.field}, ${sourceId}, ${url},
      ${sourceType}, ${o.datasetId ?? null}, ${o.rawValue}, ${o.normalisedValue}, ${o.confidence}, ${o.sourceReliability},
      ${o.extractionMethod}, ${o.evidence ?? null}, ${o.licence ?? null}, ${o.verificationStatus ?? "unverified"}
    )`;
  }
}

export type CompanyRow = {
  id: string;
  user_id: string;
  business_id: string | null;
  vat_id: string | null;
  lei: string | null;
  name: string;
  name_normalized: string;
  trading_names: unknown;
  country: string;
  legal_form: string | null;
  registration_date: string | null;
  business_status: string | null;
  industry_code: string | null;
  industry_label: string | null;
  description: string | null;
  street: string | null;
  postal_code: string | null;
  municipality: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
  website_domain: string | null;
  general_email: string | null;
  general_email_class: string | null;
  phone: string | null;
  employee_count: number | null;
  revenue: string | null;
  profit?: string | null;
  overall_confidence: number | null;
  record_status: string;
  last_discovered_at: string | null;
  last_verified_at: string | null;
  reject_reason: string | null;
  eu_id: string | null;
  legal_form_code: string | null;
  website_quality: unknown;
  technologies: unknown;
  intel?: unknown;
  website_score?: number | null;
  seo_score?: number | null;
  digital_maturity?: number | null;
  commercial_opportunity?: number | null;
  company_age_years?: number | null;
  match_score?: number | null;
};

export async function findCompanyByBid(sql: Sql, userId: string, businessId: string) {
  const rows = await sql<CompanyRow>`
    select * from companies where user_id = ${userId} and business_id = ${businessId} and deleted_at is null limit 1`;
  return rows[0] ?? null;
}

export async function findCompanyByCore(sql: Sql, userId: string, name: string, domain?: string | null) {
  const nn = normalizeName(name);
  const core = coreCompanyName(name);
  if (nn) {
    const exact = await sql<{ id: string }>`
      select id from companies where user_id = ${userId} and name_normalized = ${nn} and deleted_at is null limit 1`;
    if (exact[0]) return exact[0];
  }
  if (domain) {
    const byDom = await sql<{ id: string; name: string; business_id: string | null }>`
      select id, name, business_id from companies
      where user_id = ${userId} and website_domain = ${domain} and deleted_at is null
      limit 12`;
    for (const row of byDom) {
      if (core && isDistinctiveCoreName(core) && coreCompanyName(row.name) === core) return row;
    }
  }
  if (!core || !isDistinctiveCoreName(core)) return null;
  const like = `${core} %`;
  const rows = await sql<{ id: string; name: string; business_id: string | null }>`
    select id, name, business_id from companies
    where user_id = ${userId} and deleted_at is null
      and (name_normalized = ${core} or name_normalized like ${like})
    limit 20`;
  for (const row of rows) {
    if (coreCompanyName(row.name) === core) return row;
  }
  return null;
}

export async function insertCompany(
  sql: Sql,
  userId: string,
  c: {
    businessId?: string | null;
    vatId?: string | null;
    euId?: string | null;
    lei?: string | null;
    name: string;
    tradingNames?: string[];
    country: string;
    legalForm?: string | null;
    legalFormCode?: string | null;
    registrationDate?: string | null;
    businessStatus?: string | null;
    industryCode?: string | null;
    industryLabel?: string | null;
    street?: string | null;
    postalCode?: string | null;
    municipality?: string | null;
    website?: string | null;
    websiteDomain?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<string> {
  if (c.businessId) {
    const existing = await findCompanyByBid(sql, userId, c.businessId);
    if (existing) return existing.id;
  }
  const site = canonicalCompanyWebsite(c.website);
  const domain = normalizeDomain(site) ?? c.websiteDomain ?? null;
  const existingCore = await findCompanyByCore(sql, userId, c.name, domain);
  if (existingCore) {
    if (c.businessId) {
      await sql`update companies set
        business_id = coalesce(business_id, ${c.businessId}),
        vat_id = coalesce(vat_id, ${c.vatId ?? null}),
        name = ${c.name},
        name_normalized = ${normalizeName(c.name)},
        website = coalesce(${site}, website),
        website_domain = coalesce(${domain}, website_domain),
        updated_at = now()
        where id = ${existingCore.id} and user_id = ${userId}`;
    } else if (site || domain) {
      await sql`update companies set
        website = coalesce(website, ${site}),
        website_domain = coalesce(website_domain, ${domain}),
        updated_at = now()
        where id = ${existingCore.id} and user_id = ${userId}`;
    }
    return existingCore.id;
  }
  try {
    const { assertCompanyQuota } = await import("./platform.ts");
    const q = await assertCompanyQuota(sql, userId);
    if (!q.ok) {
      const { CompanyQuotaError } = await import("./quota.ts");
      throw new CompanyQuotaError(q.error);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "CompanyQuotaError") throw err;
    const { CompanyQuotaError } = await import("./quota.ts");
    throw new CompanyQuotaError("Company quota could not be verified. Existing companies are kept.");
  }
  const id = nid();
  await sql`insert into companies (
    id, user_id, business_id, vat_id, lei, eu_id, name, name_normalized, trading_names, country,
    legal_form, legal_form_code, registration_date, business_status, industry_code, industry_label,
    street, postal_code, municipality, website, website_domain, lat, lng, last_discovered_at, record_status
  ) values (
    ${id}, ${userId}, ${c.businessId ?? null}, ${c.vatId ?? null}, ${c.lei ?? null}, ${c.euId ?? null},
    ${c.name}, ${normalizeName(c.name)}, ${JSON.stringify(c.tradingNames ?? [])}::jsonb, ${c.country},
    ${c.legalForm ?? null}, ${c.legalFormCode ?? null}, ${c.registrationDate ?? null}, ${c.businessStatus ?? null},
    ${c.industryCode ?? null}, ${c.industryLabel ?? null}, ${c.street ?? null}, ${c.postalCode ?? null},
    ${c.municipality ?? null}, ${site}, ${domain}, ${c.lat ?? null}, ${c.lng ?? null},
    now(), ${"discovered"}
  )`;
  return id;
}

export async function enqueueJob(
  sql: Sql,
  userId: string,
  type: string,
  opts: { runId?: string | null; companyId?: string | null; payload?: unknown } = {},
) {
  if (!isJobType(type)) throw new Error("Unknown job type");
  const payload = JSON.stringify(opts.payload ?? {});
  if (type === "enrich" && opts.companyId) {
    const live = await sql<{ id: string }>`
      select id from jobs
      where user_id = ${userId} and type = ${"enrich"} and company_id = ${opts.companyId}
        and status in ('queued','running')
      limit 1`;
    if (live[0]) return live[0].id;
  }
  const existing = await sql<{ id: string; status: string }>`
    select id, status from jobs
    where user_id = ${userId} and type = ${type}
      and coalesce(run_id, '') = ${opts.runId ?? ""}
      and coalesce(company_id, '') = ${opts.companyId ?? ""}
      and coalesce(payload->>'url','') = ${(opts.payload as { url?: string } | undefined)?.url ?? ""}
    limit 1`;
  if (existing[0]) {
    if (
      (type === "enrich" || type === "scrape" || type === "crawl" || type === "email")
      && (existing[0].status === "done" || existing[0].status === "failed" || existing[0].status === "cancelled")
    ) {
      try {
        await sql`update jobs set status = ${"queued"}, run_after = now(), last_error = null, attempts = 0, locked_at = null, lease_until = null, generation = generation + 1, updated_at = now()
          where id = ${existing[0].id} and user_id = ${userId} and status in ('done','failed','cancelled')`;
      } catch {
        await sql`update jobs set status = ${"queued"}, run_after = now(), last_error = null, attempts = 0, locked_at = null, updated_at = now()
          where id = ${existing[0].id} and user_id = ${userId} and status in ('done','failed','cancelled')`;
      }
    }
    return existing[0].id;
  }
  const id = nid();
  await sql`insert into jobs (id, user_id, run_id, company_id, type, payload)
    values (${id}, ${userId}, ${opts.runId ?? null}, ${opts.companyId ?? null}, ${type}, ${payload}::jsonb)`;
  return id;
}

export async function bumpSource(
  sql: Sql,
  userId: string,
  sourceId: string,
  kind: "ok" | "fail" | "discover" | "enrich",
  extra?: { error?: string; latencyMs?: number; confidence?: number },
) {
  await seedSourceHealth(sql, userId);
  if (kind === "ok") {
    await sql`update source_health set last_success_at = now(), last_latency_ms = ${extra?.latencyMs ?? null}, state = ${"connected"}, updated_at = now()
      where user_id = ${userId} and source_id = ${sourceId}`;
  } else if (kind === "fail") {
    await sql`update source_health set last_failure_at = now(), last_error = ${extra?.error ?? "error"}, state = ${"temporarily_unavailable"}, updated_at = now()
      where user_id = ${userId} and source_id = ${sourceId}`;
  } else if (kind === "discover") {
    await sql`update source_health set records_discovered = records_discovered + 1, last_success_at = now(), state = ${"connected"}, updated_at = now()
      where user_id = ${userId} and source_id = ${sourceId}`;
  } else if (kind === "enrich") {
    await sql`update source_health set records_enriched = records_enriched + 1, last_success_at = now(),
      confidence_sum = confidence_sum + ${extra?.confidence ?? 0}, confidence_n = confidence_n + 1, state = ${"connected"}, updated_at = now()
      where user_id = ${userId} and source_id = ${sourceId}`;
  }
}

export async function updateRunStats(sql: Sql, userId: string, runId: string) {
  const counts = await sql<{
    companies: number;
    people: number;
    contacts: number;
    queued: number;
    running: number;
    done: number;
    failed: number;
  }>`
    select
      (select count(*)::int from run_companies where user_id = ${userId} and run_id = ${runId}) as companies,
      (select count(*)::int from people p join run_companies rc on rc.company_id = p.company_id and rc.user_id = p.user_id
        where rc.user_id = ${userId} and rc.run_id = ${runId} and p.deleted_at is null) as people,
      (select count(*)::int from contacts c join run_companies rc on rc.company_id = c.company_id and rc.user_id = c.user_id
        where rc.user_id = ${userId} and rc.run_id = ${runId}) as contacts,
      (select count(*)::int from jobs where user_id = ${userId} and run_id = ${runId} and status = 'queued') as queued,
      (select count(*)::int from jobs where user_id = ${userId} and run_id = ${runId} and status = 'running') as running,
      (select count(*)::int from jobs where user_id = ${userId} and run_id = ${runId} and status = 'done') as done,
      (select count(*)::int from jobs where user_id = ${userId} and run_id = ${runId} and status = 'failed') as failed
  `;
  const c = counts[0]!;
  const enriched = await sql<{ n: number }>`
    select count(*)::int as n from companies co join run_companies rc on rc.company_id = co.id
    where rc.user_id = ${userId} and rc.run_id = ${runId} and co.record_status in ('enriched','verified')`;
  const rejected = await sql<{ n: number }>`
    select count(*)::int as n from companies co join run_companies rc on rc.company_id = co.id
    where rc.user_id = ${userId} and rc.run_id = ${runId} and co.record_status = 'rejected'`;
  const stats = {
    discovered: c.companies,
    enriched: enriched[0]?.n ?? 0,
    verified: 0,
    rejected: rejected[0]?.n ?? 0,
    people: c.people,
    contacts: c.contacts,
    jobsQueued: c.queued,
    jobsRunning: c.running,
    jobsDone: c.done,
    jobsFailed: c.failed,
  };
  const remaining = c.queued + c.running;
  const prev = (await sql<{ status: string; name: string | null }>`
    select status, name from search_runs where id = ${runId} and user_id = ${userId} limit 1`)[0];
  await sql`update search_runs set stats = ${JSON.stringify(stats)}::jsonb,
    status = case
      when status in ('cancelled','failed') then status
      when ${remaining} = 0 then ${"completed"}
      else status
    end,
    finished_at = case
      when status in ('cancelled','failed') then finished_at
      when ${remaining} = 0 then now()
      else finished_at
    end
    where id = ${runId} and user_id = ${userId}`;
  if (
    remaining === 0 &&
    prev &&
    prev.status !== "completed" &&
    prev.status !== "cancelled" &&
    prev.status !== "failed"
  ) {
    try {
      const { queueSearchFinished } = await import("./mail-automations.ts");
      await queueSearchFinished(sql, {
        userId,
        runId,
        runName: prev.name,
        companies: stats.discovered,
        contacts: stats.contacts,
      });
    } catch {
      /* mail is best-effort */
    }
    try {
      const { writeSearchHealth } = await import("./exposure.ts");
      const started = (await sql<{ started_at: Date | string | null }>`
        select coalesce(started_at, created_at) as started_at from search_runs
        where id = ${runId} and user_id = ${userId} limit 1`)[0]?.started_at;
      const t0 = started ? new Date(started).getTime() : Date.now();
      await writeSearchHealth(sql, {
        userId,
        runId,
        queryFingerprint: "",
        durationMs: Math.max(0, Date.now() - t0),
        candidateCount: stats.discovered,
        finalCount: stats.discovered,
        newLeads: stats.discovered,
        seenCount: 0,
        noveltyAvg: 0,
        exhausted: false,
        status: "completed",
      });
    } catch {
      /* health is optional */
    }
  }
  return stats;
}

export async function mergeCompanyRecords(sql: Sql, userId: string, keepId: string, dropId: string) {
  if (keepId === dropId) return;
  await sql`update people p set company_id = ${keepId}
    where p.company_id = ${dropId} and p.user_id = ${userId} and p.deleted_at is null
      and not exists (
        select 1 from people k
        where k.user_id = p.user_id and k.company_id = ${keepId} and k.deleted_at is null
          and k.name_normalized = p.name_normalized
          and coalesce(k.title_normalized, '') = coalesce(p.title_normalized, '')
      )`;
  await sql`update people set deleted_at = now() where company_id = ${dropId} and user_id = ${userId} and deleted_at is null`;
  await sql`update contacts c set company_id = ${keepId}
    where c.company_id = ${dropId} and c.user_id = ${userId}
      and not exists (
        select 1 from contacts k
        where k.user_id = c.user_id and k.company_id = ${keepId}
          and k.kind = c.kind and k.value_normalized = c.value_normalized
      )`;
  await sql`delete from contacts where company_id = ${dropId} and user_id = ${userId}`;
  await sql`update observations set entity_id = ${keepId} where entity_id = ${dropId} and user_id = ${userId}`;
  await sql`update signals set company_id = ${keepId} where company_id = ${dropId} and user_id = ${userId}`;
  const runs = await sql<{ run_id: string }>`select run_id from run_companies where company_id = ${dropId} and user_id = ${userId}`;
  for (const r of runs) {
    await sql`insert into run_companies (user_id, run_id, company_id, match_reasons, is_new)
      values (${userId}, ${r.run_id}, ${keepId}, ${JSON.stringify(["merged-branch"])}::jsonb, ${false})
      on conflict do nothing`;
  }
  await sql`delete from run_companies where company_id = ${dropId} and user_id = ${userId}`;
  await sql`update companies set deleted_at = now(), updated_at = now() where id = ${dropId} and user_id = ${userId}`;
}

