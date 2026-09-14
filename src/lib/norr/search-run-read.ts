import { getSql } from "@/lib/db";
import { runProgress, displayRunStatus } from "./progress.ts";

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
      limit 100`;
  } catch {
    companies = [];
  }

  const unique = companies.map((c) => ({ ...c, website: c.website ?? null }));
  const jobsLive = jobs.some((j: { status?: string }) => j.status === "running" || j.status === "queued");
  const viewStatus = displayRunStatus(String(run.status ?? ""), jobsLive);
  const missingEmail = unique.filter((c) => !c.general_email).length;
  const foundEmail = unique.filter((c) => c.general_email).length;
  const foundPhone = unique.filter((c) => c.phone).length;
  const foundDecisionMaker = unique.filter((c) => c.decision_maker).length;
  const progress = runProgress(jobs, viewStatus);
  const matched = Number(run.new_leads_count ?? 0) + Number(run.previously_seen_count ?? 0) || unique.length;

  return {
    ok: true as const,
    previousRunId: null,
    progress,
    run: { ...run, status: viewStatus },
    jobs,
    companies: unique,
    nextCursor: null,
    summary: {
      matched,
      newToYou: unique.filter((c) => !c.seen_before).length,
      seenBefore: unique.filter((c) => c.seen_before).length,
      excluded: Number(run.excluded_count ?? 0),
      exhaustion: 0,
      rankingVersion: "",
      limitedNew: false,
      limitedNewMessage: "",
      emptyNew: unique.length === 0 && viewStatus !== "queued" && viewStatus !== "running",
      emptyNewMessage: "",
      missingEmail,
      foundEmail,
      foundPhone,
      foundDecisionMaker,
      missingPhone: unique.length - foundPhone,
      missingDecisionMaker: unique.length - foundDecisionMaker,
      diagnosis: null,
      coverage: null,
    },
  };
}
