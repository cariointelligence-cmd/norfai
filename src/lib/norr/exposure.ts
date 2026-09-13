import type { Sql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { RANKING_VERSION } from "./fingerprint.ts";
import { diversityPenalty, exhaustionScore, finalRankScore, noveltyScore, shouldHardExclude, type ExposureSnapshot } from "./novelty.ts";
import type { SearchCriteria } from "./types.ts";
import { offerFromCriteria, personalizedEligibleRank } from "./ranking-v2.ts";

export { shouldHardExclude };

export type ExposureRow = {
  company_id: string;
  business_id: string | null;
  times_seen: number;
  last_seen_at: string | null;
  times_exported: number;
  last_exported_at: string | null;
};

export async function ensureSearchHardeningSchema(sql: Sql): Promise<void> {
  try {
    await sql.query("alter table search_runs add column if not exists query_fingerprint text");
    await sql.query("alter table search_runs add column if not exists ranking_version text");
    await sql.query("alter table search_runs add column if not exists name text");
    await sql.query("alter table search_runs add column if not exists search_exhaustion_score integer");
    await sql.query("alter table search_runs add column if not exists new_leads_count integer");
    await sql.query("alter table search_runs add column if not exists previously_seen_count integer");
    await sql.query("alter table search_runs add column if not exists excluded_count integer");
    await sql.query("alter table run_companies add column if not exists novelty_score double precision");
    await sql.query("alter table run_companies add column if not exists search_score integer");
    await sql.query("alter table run_companies add column if not exists final_rank_score double precision");
    await sql.query("alter table run_companies add column if not exists rank_position integer");
    await sql.query("alter table run_companies add column if not exists seen_before boolean not null default false");
    await sql.query("alter table run_companies add column if not exists times_seen_before integer not null default 0");
    await sql.query("alter table run_companies add column if not exists last_shown_at timestamptz");
    await sql.query("alter table run_companies add column if not exists delivered boolean not null default false");
    await sql.query("alter table exports add column if not exists run_id text");
    await sql.query("alter table exports add column if not exists columns jsonb");
    await sql.query(`create table if not exists user_company_exposure (
      id text primary key,
      user_id text not null,
      tenant_id text not null,
      company_id text not null,
      business_id text,
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      times_seen integer not null default 1,
      first_search_id text,
      last_search_id text,
      times_exported integer not null default 0,
      first_exported_at timestamptz,
      last_exported_at timestamptz,
      last_opened_at timestamptz,
      unique (user_id, company_id)
    )`);
    await sql.query(`create table if not exists search_health_events (
      id text primary key,
      user_id text not null,
      run_id text,
      query_fingerprint text,
      ranking_version text,
      duration_ms integer,
      candidate_count integer,
      final_count integer,
      new_leads_count integer,
      previously_seen_count integer,
      duplicate_ratio double precision,
      novelty_avg double precision,
      exhausted boolean not null default false,
      status text,
      created_at timestamptz not null default now()
    )`);
  } catch {
    /* schema may already exist */
  }
}

export async function loadExposureMap(sql: Sql, userId: string): Promise<Map<string, ExposureRow>> {
  await ensureSearchHardeningSchema(sql);
  const rows = await sql<ExposureRow>`
    select company_id, business_id, times_seen, last_seen_at, times_exported, last_exported_at
    from user_company_exposure where user_id = ${userId}`;
  const map = new Map<string, ExposureRow>();
  for (const r of rows) {
    map.set(r.company_id, r);
    if (r.business_id) map.set(r.business_id, r);
  }
  return map;
}

export function snapshotFromMap(
  map: Map<string, ExposureRow>,
  companyId: string,
  businessId?: string | null,
): ExposureSnapshot | null {
  const row = (companyId && map.get(companyId)) || (businessId ? map.get(businessId) : null) || null;
  if (!row) return null;
  return { timesSeen: row.times_seen, lastSeenAt: row.last_seen_at, timesExported: row.times_exported };
}

async function upsertSeen(
  sql: Sql,
  userId: string,
  runId: string | null,
  rows: Array<{ companyId: string; businessId?: string | null }>,
  kind: "seen" | "exported",
): Promise<void> {
  if (!rows.length) return;
  await ensureSearchHardeningSchema(sql);
  for (const row of rows) {
    if (!row.companyId) continue;
    const id = nid();
    if (kind === "exported") {
      await sql`
        insert into user_company_exposure (
          id, user_id, tenant_id, company_id, business_id, times_seen, times_exported,
          first_exported_at, last_exported_at, last_search_id
        ) values (
          ${id}, ${userId}, ${userId}, ${row.companyId}, ${row.businessId ?? null}, 0, 1,
          now(), now(), ${runId}
        )
        on conflict (user_id, company_id) do update set
          times_exported = user_company_exposure.times_exported + 1,
          first_exported_at = coalesce(user_company_exposure.first_exported_at, now()),
          last_exported_at = now(),
          last_search_id = coalesce(excluded.last_search_id, user_company_exposure.last_search_id),
          business_id = coalesce(user_company_exposure.business_id, excluded.business_id)`;
    } else {
      await sql`
        insert into user_company_exposure (
          id, user_id, tenant_id, company_id, business_id, times_seen, first_search_id, last_search_id
        ) values (
          ${id}, ${userId}, ${userId}, ${row.companyId}, ${row.businessId ?? null}, 1, ${runId}, ${runId}
        )
        on conflict (user_id, company_id) do update set
          times_seen = user_company_exposure.times_seen + 1,
          last_seen_at = now(),
          last_search_id = coalesce(excluded.last_search_id, user_company_exposure.last_search_id),
          business_id = coalesce(user_company_exposure.business_id, excluded.business_id)`;
    }
  }
}

export async function recordDelivered(
  sql: Sql,
  userId: string,
  runId: string,
  rows: Array<{ companyId: string; businessId?: string | null }>,
): Promise<void> {
  if (!rows.length) return;
  await upsertSeen(sql, userId, runId, rows, "seen");
  const ids = rows.map((r) => r.companyId);
  await sql`
    update run_companies set delivered = true, last_shown_at = now()
    where user_id = ${userId} and run_id = ${runId} and company_id = any(${ids})`;
}

export async function recordExported(
  sql: Sql,
  userId: string,
  runId: string | null,
  rows: Array<{ companyId: string; businessId?: string | null }>,
): Promise<void> {
  await upsertSeen(sql, userId, runId, rows, "exported");
}

export async function recordOpened(sql: Sql, userId: string, companyId: string): Promise<void> {
  try {
    await sql`
      update user_company_exposure set last_opened_at = now()
      where user_id = ${userId} and company_id = ${companyId}`;
  } catch {
    /* schema may not exist yet */
  }
}

export async function hydrateLegacySearchRuns(sql: Sql, userId: string, runId?: string): Promise<void> {
  await ensureSearchHardeningSchema(sql);
  if (runId) {
    await sql`update search_runs set ranking_version = coalesce(ranking_version, ${RANKING_VERSION})
      where id = ${runId} and user_id = ${userId}`;
    return;
  }
  await sql`update search_runs set ranking_version = coalesce(ranking_version, ${RANKING_VERSION})
    where user_id = ${userId} and ranking_version is null`;
}

export async function backfillExposureFromHistory(sql: Sql, userId: string): Promise<void> {
  await ensureSearchHardeningSchema(sql);
  const rows = await sql<{ company_id: string; business_id: string | null; run_id: string }>`
    select rc.company_id, c.business_id, rc.run_id
    from run_companies rc
    join companies c on c.id = rc.company_id
    where rc.user_id = ${userId} and rc.delivered = true
    order by rc.created_at desc
    limit 2000`;
  if (!rows.length) return;
  await upsertSeen(
    sql,
    userId,
    rows[0]?.run_id ?? null,
    rows.map((r) => ({ companyId: r.company_id, businessId: r.business_id })),
    "seen",
  );
}

export type RankableRow = {
  company_id: string;
  municipality: string | null;
  industry_code: string | null;
  match_score: number | null;
  overall_confidence: number | null;
  commercial_opportunity: number | null;
  business_id: string | null;
  seen_before: boolean;
  times_seen_before: number;
  last_shown_at: string | null;
  rank_position: number | null;
  general_email: string | null;
  website_score: number | null;
  intel: unknown;
};

/**
 * Rank by current match/commercial scores. Positions update after scoring so
 * the list is not frozen at discover-time zeros.
 */
export async function freezeRunRanking(
  sql: Sql,
  userId: string,
  runId: string,
  criteria: SearchCriteria,
): Promise<{ newCount: number; seenCount: number; exhaustion: number; noveltyAvg: number }> {
  await ensureSearchHardeningSchema(sql);
  const prioritize = criteria.prioritizeNew !== false;
  const offer = offerFromCriteria(criteria);
  const rows = await sql<RankableRow>`
    select rc.company_id, rc.seen_before, rc.times_seen_before, rc.last_shown_at, rc.rank_position,
      c.municipality, c.industry_code, c.match_score, c.overall_confidence, c.commercial_opportunity, c.business_id,
      c.general_email, c.website_score, c.intel
    from run_companies rc
    join companies c on c.id = rc.company_id
    where rc.user_id = ${userId} and rc.run_id = ${runId} and c.deleted_at is null
      and c.record_status is distinct from 'rejected'`;
  const picked: Array<{ municipality: string | null; industry: string | null }> = [];
  const scored = rows.map((r) => {
    const intel = r.intel && typeof r.intel === "object" ? (r.intel as {
      hiring?: { evidence?: string[] };
      website?: { likelyWeak?: boolean };
      scores?: { purchaseCapacity?: number | null };
      growth?: { evidence?: string[] };
    }) : null;
    const hiringConfirmed = Boolean(intel?.hiring?.evidence?.includes("HIRING_CONFIRMED"));
    const ranked = personalizedEligibleRank({
      matchScore: r.match_score,
      overallConfidence: r.overall_confidence,
      offer,
      hiringConfirmed,
      websiteWeak: Boolean(intel?.website?.likelyWeak) || (r.website_score != null && r.website_score < 40),
      hasPublishedContact: Boolean(r.general_email),
      financialGrowth: intel?.growth?.evidence?.some((e) => /YoY/i.test(e)) ? 0.1 : null,
      purchaseCapacity: intel?.scores?.purchaseCapacity ?? null,
    });
    const search = ranked.score;
    const nov = noveltyScore({
      timesSeen: r.times_seen_before,
      lastSeenAt: r.last_shown_at,
      timesExported: 0,
    });
    const div = diversityPenalty({ municipality: r.municipality, industry: r.industry_code, picked });
    picked.push({ municipality: r.municipality, industry: r.industry_code });
    return {
      ...r,
      search,
      novelty: nov,
      final: finalRankScore({ searchScore: search, novelty: nov, prioritizeNew: prioritize, diversityPenalty: div }),
    };
  });
  scored.sort((a, b) => {
    if (b.final !== a.final) return b.final - a.final;
    return a.company_id.localeCompare(b.company_id);
  });
  let pos = 0;
  for (const row of scored) {
    pos += 1;
    await sql`
      update run_companies set
        novelty_score = ${row.novelty},
        search_score = ${Math.round(row.search)},
        final_rank_score = ${row.final},
        rank_position = ${pos}
      where user_id = ${userId} and run_id = ${runId} and company_id = ${row.company_id}`;
  }
  const newCount = rows.filter((r) => !r.seen_before).length;
  const seenCount = rows.filter((r) => r.seen_before).length;
  const requested = Math.max(1, criteria.maxResults ?? 100);
  const exhaustion = exhaustionScore({ requested, newCount, seenCount });
  const noveltyAvg = rows.length
    ? rows.reduce((s, r) => s + noveltyScore({ timesSeen: r.times_seen_before, lastSeenAt: r.last_shown_at, timesExported: 0 }), 0) / rows.length
    : 1;
  await sql`update search_runs set
    ranking_version = coalesce(ranking_version, ${RANKING_VERSION}),
    new_leads_count = ${newCount},
    previously_seen_count = ${seenCount},
    search_exhaustion_score = ${exhaustion}
    where id = ${runId} and user_id = ${userId}`;
  return { newCount, seenCount, exhaustion, noveltyAvg };
}

export async function writeSearchHealth(
  sql: Sql,
  opts: {
    userId: string;
    runId: string;
    queryFingerprint: string;
    durationMs: number;
    candidateCount: number;
    finalCount: number;
    newLeads: number;
    seenCount: number;
    noveltyAvg: number;
    exhausted: boolean;
    status: string;
  },
): Promise<void> {
  try {
    await ensureSearchHardeningSchema(sql);
    const dup = opts.finalCount > 0 ? opts.seenCount / opts.finalCount : 0;
    await sql`
      insert into search_health_events (
        id, user_id, run_id, query_fingerprint, ranking_version, duration_ms,
        candidate_count, final_count, new_leads_count, previously_seen_count,
        duplicate_ratio, novelty_avg, exhausted, status
      ) values (
        ${nid()}, ${opts.userId}, ${opts.runId}, ${opts.queryFingerprint}, ${RANKING_VERSION}, ${opts.durationMs},
        ${opts.candidateCount}, ${opts.finalCount}, ${opts.newLeads}, ${opts.seenCount},
        ${dup}, ${opts.noveltyAvg}, ${opts.exhausted}, ${opts.status}
      )`;
  } catch {
    /* health is optional */
  }
}
