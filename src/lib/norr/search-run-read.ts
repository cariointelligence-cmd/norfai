import { getSql } from "@/lib/db";
import { runProgress, displayRunStatus } from "./progress.ts";
import { canonicalCompanyWebsite } from "./normalize.ts";
import { emailBelongsToCompany, isJunkEmail } from "./contacts.ts";
import { isJunkCompanyPhone } from "./phones.ts";

export async function countRunFacts(sql: Awaited<ReturnType<typeof getSql>>, userId: string, runId: string) {
  const [rc] = await sql`
    select
      count(*)::int as matched,
      count(*) filter (where coalesce(seen_before, false) = false)::int as new_to_you,
      count(*) filter (where coalesce(seen_before, false) = true)::int as seen_before
    from run_companies
    where user_id = ${userId} and run_id = ${runId}`;
  const matched = Number(rc?.matched ?? 0);
  const [ct] = await sql`
    select
      count(distinct rc.company_id) filter (where nullif(btrim(e.value), '') is not null)::int as found_email,
      count(distinct rc.company_id) filter (where nullif(btrim(ph.value), '') is not null)::int as found_phone
    from run_companies rc
    join companies c on c.id = rc.company_id
    left join contacts e on e.company_id = rc.company_id and e.user_id = rc.user_id and e.kind = ${"email"}
    left join contacts ph on ph.company_id = rc.company_id and ph.user_id = rc.user_id and ph.kind = ${"phone"}
    where rc.user_id = ${userId} and rc.run_id = ${runId}
      and c.deleted_at is null`;
  let foundDecisionMaker = 0;
  try {
    const [dm] = await sql`
      select count(distinct rc.company_id)::int as n
      from run_companies rc
      inner join people p
        on p.company_id = rc.company_id and p.user_id = ${userId} and p.deleted_at is null
      where rc.user_id = ${userId} and rc.run_id = ${runId}`;
    foundDecisionMaker = Number(dm?.n ?? 0);
  } catch {
    foundDecisionMaker = 0;
  }
  const foundEmail = Number(ct?.found_email ?? 0);
  const foundPhone = Number(ct?.found_phone ?? 0);
  return {
    matched,
    newToYou: Number(rc?.new_to_you ?? 0),
    seenBefore: Number(rc?.seen_before ?? 0),
    foundEmail,
    foundPhone,
    foundDecisionMaker,
    missingEmail: Math.max(0, matched - foundEmail),
    missingPhone: Math.max(0, matched - foundPhone),
    missingDecisionMaker: Math.max(0, matched - foundDecisionMaker),
  };
}

export async function readSearchRun(userId: string, runId: string, cursor?: string | null) {
  const sql = await getSql();

  let run;
  try {
    run = (await sql`
      select id, status, criteria, stats, source_report, error, created_at, started_at, finished_at,
        pause_requested, cancel_requested, name, new_leads_count, previously_seen_count, excluded_count
      from search_runs where id = ${runId} and user_id = ${userId}`)?.[0];
  } catch {
    run = (await sql`select id, status, criteria, stats, source_report, error, created_at, started_at, finished_at, name
      from search_runs where id = ${runId} and user_id = ${userId}`)?.[0];
  }
  if (!run) return { ok: false as const, error: "Not found" };

  const jobs = await sql`
    select id, type, status, last_error, company_id, updated_at
    from jobs where user_id = ${userId} and run_id = ${runId}
    order by created_at asc`;

  let companies = [];
  try {
    companies = await sql`
      select c.id, c.name, c.business_id, c.municipality, c.industry_code, c.industry_label,
        c.website, c.overall_confidence, c.record_status, c.general_email, c.phone,
        c.match_score, coalesce(rc.seen_before, false) as seen_before,
        (select p.full_name from people p
          where p.user_id = ${userId} and p.company_id = c.id and p.deleted_at is null
          order by p.confidence desc nulls last limit 1) as decision_maker
      from run_companies rc
      join companies c on c.id = rc.company_id
      where rc.user_id = ${userId} and rc.run_id = ${runId}
      order by coalesce(rc.rank_position, 999999) asc, c.id asc
      limit 1000`;
  } catch {
    companies = [];
  }

  const unique = companies.map((c) => {
    const website = canonicalCompanyWebsite(c.website) ?? null;
    const email = String(c.general_email ?? "");
    const keepEmail = email && !isJunkEmail(email) && emailBelongsToCompany(email, { name: c.name, website });
    const phone = isJunkCompanyPhone(c.phone) ? null : (c.phone ?? null);
    return { ...c, website, general_email: keepEmail ? c.general_email : null, phone };
  });
  const jobsLive = jobs.some((j: { status?: string }) => j.status === "running" || j.status === "queued");
  const viewStatus = displayRunStatus(String(run.status ?? ""), jobsLive);
  let facts = {
    matched: unique.length,
    newToYou: unique.filter((c) => !c.seen_before).length,
    seenBefore: unique.filter((c) => c.seen_before).length,
    foundEmail: unique.filter((c) => c.general_email).length,
    foundPhone: unique.filter((c) => c.phone).length,
    foundDecisionMaker: unique.filter((c) => c.decision_maker).length,
    missingEmail: unique.filter((c) => !c.general_email).length,
    missingPhone: unique.filter((c) => !c.phone).length,
    missingDecisionMaker: unique.filter((c) => !c.decision_maker).length,
  };
  try {
    facts = await countRunFacts(sql, userId, runId);
  } catch {
    try {
      const [rc] = await sql`
        select count(*)::int as matched,
          count(*) filter (where coalesce(seen_before, false) = false)::int as neu
        from run_companies where user_id = ${userId} and run_id = ${runId}`;
      const matched = Number(rc?.matched ?? facts.matched);
      facts = {
        ...facts,
        matched,
        newToYou: Number(rc?.neu ?? facts.newToYou),
        seenBefore: Math.max(0, matched - Number(rc?.neu ?? 0)),
        missingEmail: Math.max(0, matched - facts.foundEmail),
        missingPhone: Math.max(0, matched - facts.foundPhone),
        missingDecisionMaker: Math.max(0, matched - facts.foundDecisionMaker),
      };
    } catch { /* keep page fallback */ }
  }
  const want = Number((run.criteria as { maxResults?: number } | undefined)?.maxResults ?? 0) || facts.matched;
  const progress = runProgress(jobs, viewStatus, { matched: facts.matched, want });
  let queue: { active: boolean; position: number; ahead: number; lane: string | null } = { active: jobsLive, position: 1, ahead: 0, lane: null };
  try {
    const { searchQueueView } = await import("./search-queue.ts");
    const qv = await searchQueueView(sql, userId, runId);
    queue = { active: qv.active, position: qv.position, ahead: qv.ahead, lane: qv.lane };
  } catch { /* queue view optional */ }

  return {
    ok: true as const,
    previousRunId: null,
    progress,
    run: { ...run, status: viewStatus },
    jobs,
    companies: unique,
    nextCursor: null,
    queue,
    summary: {
      matched: facts.matched,
      newToYou: facts.newToYou,
      seenBefore: facts.seenBefore,
      excluded: Number(run.excluded_count ?? 0),
      exhaustion: 0,
      rankingVersion: "",
      limitedNew: false,
      limitedNewMessage: "",
      emptyNew: facts.matched === 0 && viewStatus !== "queued" && viewStatus !== "running",
      emptyNewMessage: "",
      missingEmail: facts.missingEmail,
      foundEmail: facts.foundEmail,
      foundPhone: facts.foundPhone,
      foundDecisionMaker: facts.foundDecisionMaker,
      missingPhone: facts.missingPhone,
      missingDecisionMaker: facts.missingDecisionMaker,
      diagnosis: null,
      coverage: null,
    },
  };
}
