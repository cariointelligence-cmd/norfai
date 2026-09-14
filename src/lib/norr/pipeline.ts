// @ts-nocheck
import type { Sql } from "@/lib/db";
import { nid } from "@/lib/utils";
import type { ContactHit, DiscoveredCompany, ObservationInput, PersonHit, SearchCriteria } from "./types.ts";
import { passesLocalFilters, valuesOf } from "./criteria.ts";
import { assertSearchQuota, assertCompanyQuota, ensurePlatformIdentity, readPlatformIdentity, perSearchLimitFor, clampRequestedLeads, ENGINE_SEARCH_CEILING, isUnlimitedQuota, companiesLimitFor } from "./platform.ts";
import {
  audit,
  bumpSource,
  enqueueJob,
  findCompanyByBid,
  findCompanyByCore,
  insertCompany,
  insertObservations,
  mergeCompanyRecords,
  updateRunStats,
  seedSourceHealth,
  type CompanyRow,
} from "./repo.ts";
import { canonicalCompanyWebsite, isJunkCompanyWebsite, normalizeDomain, normalizeName } from "./normalize.ts";
import { emailPreferenceRank, isBillingEmail, isDisposableDomain, isJunkEmail, isRecruitingEmail, isRoleAddress, inferEmail, inferGeneralMailbox, decodeEmailCandidate, isTemplateEmail, materializeTemplateEmail, cleanExtractedEmail, isGarbageEmail, validEmailSyntax, websiteFromPublishedEmails } from "./contacts.ts";
import { cleanPersonName, CONTACT_SEED_PATHS } from "./extract.ts";
import { coreCompanyName, isDistinctiveCoreName, stripPlaceSuffixDisplay } from "./dedupe.ts";
import { crawlPage, discoverSitemapUrls, pickNextUrls, readRobots, robotsAllows } from "./crawler.ts";
import { explanationText, scoreCompany, DEFAULT_WEIGHTS } from "./scoring.ts";
import { buildCompanyIntel, websiteIntelFromStored } from "./targeting/hydrate.ts";
import { extractFinancialMentions } from "./targeting/website.ts";
import { extractParentMention } from "./group.ts";
import { classifyPhoneRole, extractPhonesWithRole, pickCompanyPhone } from "./phones.ts";
import { matchesExclusion, type ExclusionRow } from "./exclusions.ts";
import { prhBisLookup } from "./sources/prh-bis.ts";
import { takeCompanySnapshot } from "./ops-store.ts";
import { ensureOpsSchema } from "./tenant.ts";
import { targetHasConstraint } from "./targeting/spec.ts";
import { shouldRejectForTarget } from "./targeting/filter.ts";
import { findMunicipality } from "./finland.ts";
import { ytjDiscover, ytjFetchById, type YtjDiscoverCursor } from "./sources/ytj.ts";
import { gleifLookup, gleifDirectParent, hilmaSearch, mxCheck, nominatimGeocode, tedSearch, viesValidate, wikidataLookup, wikidataPerson } from "./sources/open.ts";
import { hunterDomainSearch, publishedAccountsLookup, businessFinlandFunding, ejusticePortal, commonCrawlLookup } from "./sources/licensed.ts";
import { collectFastContacts, harvestSite, isDirectoryHost, domainCandidates, probeDomain } from "./sources/webdiscover.ts";
import { publicHiringSearch, prhXbrlLookup } from "./sources/homemade.ts";
import { findCompanyPages, contactsFromHits } from "./sources/websearch.ts";
import { scoreMayProceed } from "./scrape-gate.ts";
import { finderLookup } from "./sources/finder.ts";
import { kauppalehtiLookup } from "./sources/kauppalehti.ts";
import { northdataLookup } from "./sources/northdata.ts";
import { linkedinLookup } from "./sources/linkedin.ts";
import { grokBudgetRemaining, grokContactSearch } from "./sources/groksearch.ts";
import { federatedCompanySearch } from "./sources/discovery.ts";
import { homemadeRegisterDiscover } from "./sources/directories.ts";
import { acceptDiscovered, looksLikeCompanyName } from "./sources/register-gate.ts";
import { diagnoseRegisterEmpty, planRegisterQuery } from "./sources/register-plan.ts";
import { loadExposureMap, snapshotFromMap, shouldHardExclude, freezeRunRanking, type ExposureRow } from "./exposure.ts";
import { discoverPoolSize, noveltyScore, collectHardExcludeBids, skipPreviouslyShown, discoverSliceComplete, discoverFillTarget, shouldResumeDiscover, mergeSourceReports } from "./novelty.ts";
import { isCompanyQuotaError } from "./quota.ts";
import { RUNTIME, clampConcurrency } from "./runtime.ts";
import { loadSourceFlags, sourceAllowed, disabledSourceIds } from "./immune/flags.ts";
import { ytjFieldObservations } from "./sources/ytj.ts";
import { cheapDiscoverReject } from "./cheap-filter.ts";
import { directoriesNeeded, contactPlan, contactHarvestDone } from "./contact-plan.ts";
import { recordCapability } from "./capabilities.ts";
import { hivePlan, hiveSkipIdentity, hiveSkipFinancial, hiveSkipSignals, hiveSourceReport } from "./hive-coordinator.ts";

const CRAWL_BUDGET = RUNTIME.crawlBudget;
const DEEP_CRAWL_BUDGET = RUNTIME.deepCrawlBudget;
const WEB_SOURCE_IDS = new Set([
  "wikipedia", "domain_guess", "search_api", "duckduckgo", "nominatim", "website",
  "existing", "email_domain", "finder", "linkedin", "grok_search", "kauppalehti", "northdata",
]);
const DISCOVER_BUDGET_MS = RUNTIME.discoverBudgetMs;

async function enqueueScore(sql, userId, runId, companyId) {
	if (!runId || !companyId) return;
	const slice = await sql`select type, status from jobs
    where user_id = ${userId} and run_id = ${runId} and company_id = ${companyId}`;
	const gate = scoreMayProceed(slice);
	if (gate === "enqueue_scrape") {
		await ensureScrapeJob(sql, userId, runId, companyId);
		return;
	}
	if (gate !== "score") return;
	const existing = await sql`select id, status from jobs
    where user_id = ${userId} and run_id = ${runId} and company_id = ${companyId} and type = 'score' limit 1`;
	if (existing[0]?.status === "queued" || existing[0]?.status === "running") return;
	if (existing[0]) {
		await sql`update jobs set status = ${"queued"}, run_after = now(), last_error = null, updated_at = now() where id = ${existing[0].id} and user_id = ${userId}`;
		return;
	}
	await enqueueJob(sql, userId, "score", { runId, companyId });
}

async function ensureScrapeJob(sql, userId, runId, companyId) {
	if (!companyId) return null;
	const existing = await sql`select id, status from jobs
    where user_id = ${userId} and type = ${"scrape"}
      and coalesce(run_id, '') = ${runId ?? ""}
      and coalesce(company_id, '') = ${companyId}
    limit 1`;
	if (!existing[0]) return enqueueJob(sql, userId, "scrape", { runId, companyId });
	if (existing[0].status === "queued" || existing[0].status === "running" || existing[0].status === "done") return existing[0].id;
	await sql`update jobs set status = ${"queued"}, run_after = now(), last_error = null, attempts = 0, locked_at = null, updated_at = now()
    where id = ${existing[0].id} and user_id = ${userId}`;
	return existing[0].id;
}

async function persistPublishedFinance(sql, userId, companyId, sourceId, sourceUrl, revenue, profit, evidence) {
	if (revenue == null && profit == null) return;
	if (revenue != null) {
		await sql`update companies set revenue = coalesce(revenue, ${revenue}) where id = ${companyId} and user_id = ${userId}`;
	}
	if (profit != null) {
		await sql`update companies set profit = coalesce(profit, ${profit}) where id = ${companyId} and user_id = ${userId}`;
	}
	const obs = [];
	if (revenue != null) obs.push({
		field: "revenue",
		rawValue: String(revenue),
		normalisedValue: String(revenue),
		confidence: 74,
		sourceReliability: 80,
		extractionMethod: "published_html_figure",
		sourceUrl: sourceUrl || undefined,
		verificationStatus: "published",
		evidence: evidence?.[0] ?? "Published revenue on a public company card"
	});
	if (profit != null) obs.push({
		field: "profit",
		rawValue: String(profit),
		normalisedValue: String(profit),
		confidence: 72,
		sourceReliability: 80,
		extractionMethod: "published_html_figure",
		sourceUrl: sourceUrl || undefined,
		verificationStatus: "published",
		evidence: evidence?.[1] ?? evidence?.[0] ?? "Published profit on a public company card"
	});
	if (obs.length) await insertObservations(sql, userId, "company", companyId, sourceId, sourceUrl, "structured_web", obs);
}

function catalogSource(src?: string | null): string {
  if (!src) return "website";
  if (src === "existing" || src === "email_domain") return "website";
  return WEB_SOURCE_IDS.has(src) ? src : "website";
}

async function loadCompany(sql: Sql, userId: string, companyId: string): Promise<CompanyRow | null> {
  const rows = await sql<CompanyRow>`select * from companies where id = ${companyId} and user_id = ${userId} and deleted_at is null limit 1`;
  return rows[0] ?? null;
}

async function findCompanyByName(sql: Sql, userId: string, name: string, domain?: string | null) {
  return findCompanyByCore(sql, userId, name, domain);
}

async function attachDiscovered(
  sql: Sql,
  userId: string,
  runId: string,
  row: DiscoveredCompany,
  reasons: string[],
  criteria?: SearchCriteria,
  exposure?: Map<string, ExposureRow>,
  exclusions?: ExclusionRow[],
  skipQuota = false,
): Promise<"kept" | "filtered" | "excluded_seen" | "excluded_exported" | "excluded_customer" | "duplicate" | "quota"> {
  if (criteria) {
    const cheap = cheapDiscoverReject(row, criteria);
    if (cheap) return "filtered";
    const filt = passesLocalFilters(row, criteria);
    if (!filt.ok) return "filtered";
    reasons = [...reasons, ...filt.reasons];
  }
  if (criteria?.excludeCustomers !== false && exclusions?.length) {
    const hit = matchesExclusion(
      { businessId: row.businessId, vatId: row.vatId, website: row.website, name: row.name },
      exclusions,
    );
    if (hit) return "excluded_customer";
  }
  if (row.businessId && exposure && criteria) {
    const early = snapshotFromMap(exposure, "", row.businessId);
    const hardEarly = shouldHardExclude(criteria, early);
    if (hardEarly === "seen") return "excluded_seen";
    if (hardEarly === "exported") return "excluded_exported";
  }
  const existing =
    (row.businessId ? await findCompanyByBid(sql, userId, row.businessId) : null)
    ?? (await findCompanyByName(sql, userId, row.name, normalizeDomain(row.website ?? null)));
  if (!existing && !skipQuota) {
    const quota = await assertCompanyQuota(sql, userId);
    if (!quota.ok) return "quota";
  }
  let companyId: string;
  try {
    companyId = await insertCompany(sql, userId, {
      ...row,
      websiteDomain: normalizeDomain(row.website ?? null),
    });
  } catch (err) {
    if (isCompanyQuotaError(err)) return "quota";
    throw err;
  }
  if (row.businessId && criteria) {
    const existingRejected = await sql<{ record_status: string }>`
      select record_status from companies where id = ${companyId} and user_id = ${userId} limit 1`;
    if (existingRejected[0]?.record_status === "rejected") {
      await sql`update companies set record_status = ${"discovered"}, reject_reason = null,
        industry_code = coalesce(${row.industryCode ?? null}, industry_code),
        industry_label = coalesce(${row.industryLabel ?? null}, industry_label),
        updated_at = now()
        where id = ${companyId} and user_id = ${userId}`;
    }
  }
  const snap = exposure ? snapshotFromMap(exposure, companyId, row.businessId ?? null) : null;
  const hard = criteria ? shouldHardExclude(criteria, snap) : null;
  if (hard === "seen") return "excluded_seen";
  if (hard === "exported") return "excluded_exported";
  const seenBefore = Boolean(snap && snap.timesSeen > 0);
  const timesBefore = snap?.timesSeen ?? 0;
  const nov = noveltyScore(snap);
  const inserted = await sql<{ company_id: string }>`
    insert into run_companies (
      user_id, run_id, company_id, match_reasons, is_new,
      seen_before, times_seen_before, novelty_score, last_shown_at
    ) values (
      ${userId}, ${runId}, ${companyId}, ${JSON.stringify(reasons)}::jsonb, ${!seenBefore},
      ${seenBefore}, ${timesBefore}, ${nov}, ${snap?.lastSeenAt ?? null}
    )
    on conflict do nothing
    returning company_id`;
  if (!inserted[0]) return "duplicate";
  await enqueueJob(sql, userId, "enrich", { runId, companyId });
  return "kept";
}

export async function runDiscover(sql: Sql, userId: string, runId: string, criteria: SearchCriteria, opts?: { cursor?: YtjDiscoverCursor | null }) {
  const t0 = Date.now();
  const deadline = t0 + DISCOVER_BUDGET_MS;
  const report: Array<Record<string, unknown>> = [];
  const planCap = ENGINE_SEARCH_CEILING;
  const want = clampRequestedLeads(criteria.maxResults, planCap);
  const pool = Math.min(discoverPoolSize({ ...criteria, maxResults: want }), ENGINE_SEARCH_CEILING);
  const depth = criteria.depth === "deep" ? "deep" : "normal";
  const country = criteria.country || "FI";
  const skipSeen = skipPreviouslyShown(criteria);
  const existing = await sql<{ n: number }>`
    select count(*)::int as n from run_companies
    where user_id = ${userId} and run_id = ${runId}
      and (${!skipSeen} or coalesce(seen_before, false) = false)`;
  let kept = existing[0]?.n ?? 0;
  const prior = await sql<{ bid: string | null; name: string | null }>`
    select c.business_id as bid, c.name
    from run_companies rc join companies c on c.id = rc.company_id
    where rc.user_id = ${userId} and rc.run_id = ${runId}`;
  const skipKeys = new Set<string>();
  for (const row of prior) {
    if (row.bid) skipKeys.add(row.bid);
    if (row.name) skipKeys.add(row.name);
  }
  let excludedSeen = 0;
  let excludedExported = 0;
  let quotaStopped = false;
  let timedOut = false;
  let registerExhausted = false;
  let ytjCursor: YtjDiscoverCursor | null = opts?.cursor ?? null;
  const exposure = await loadExposureMap(sql, userId);
  for (const bid of collectHardExcludeBids(exposure.values(), criteria)) skipKeys.add(bid);
  let exclusions: ExclusionRow[] = [];
  if (criteria.excludeCustomers !== false) {
    try {
      exclusions = await sql`select kind, value, value_normalized as "valueNormalized", label from account_exclusions where user_id = ${userId}`;
    } catch {
      exclusions = [];
    }
  }
  let skipQuota = false;
  try {
    const ident = await readPlatformIdentity(sql, userId);
    skipQuota = ident.isAdmin || isUnlimitedQuota(companiesLimitFor(ident.plan, ident.isAdmin));
  } catch { skipQuota = false; }
  const flags = await (async () => {
    try { return await loadSourceFlags(sql, userId); } catch { return []; }
  })();
  const disabled = disabledSourceIds(flags);
  const searchPlan = hivePlan({ criteria, depth, country });
  report.push(hiveSourceReport(searchPlan));

  const finish = async (complete: boolean) => {
    const plan = planRegisterQuery(criteria);
    const diag = diagnoseRegisterEmpty(plan, report, { kept, want, complete });
    if (complete && diag && !report.some((r) => r.source === "register_plan" && r.code)) {
      report.push({
        source: "register_plan",
        ok: diag.code !== "SOURCE_UNAVAILABLE",
        hits: kept,
        code: diag.code,
        note: `${diag.code}: ${diag.text}`,
      });
    }
    const ranking = complete
      ? await freezeRunRanking(sql, userId, runId, criteria)
      : { newCount: kept, seenCount: excludedSeen };
    let previousReport: Array<Record<string, unknown>> = [];
    try {
      const prev = await sql`select source_report from search_runs where id = ${runId} and user_id = ${userId} limit 1`;
      if (Array.isArray(prev[0]?.source_report)) previousReport = prev[0].source_report;
    } catch {
      previousReport = [];
    }
    if (!complete) {
      previousReport = previousReport.filter((r) => !(r.source === "register_plan" && (r.code === "NO_MATCH" || r.code === "FILTER_EXCLUDED_ALL")));
    }
    const merged = mergeSourceReports(previousReport, report);
    await sql`update search_runs set source_report = ${JSON.stringify(merged)}::jsonb, status = ${"running"},
      started_at = coalesce(started_at, now()), excluded_count = ${excludedSeen + excludedExported}, finished_at = null
      where id = ${runId} and user_id = ${userId}`;
    await updateRunStats(sql, userId, runId);
    await audit(sql, userId, "search.discover", "search_run", runId, {
      kept, country, depth, excludedSeen, excludedExported,
      newLeads: ranking.newCount, seenBefore: ranking.seenCount, complete, timedOut, registerExhausted,
    });
    return { discovered: kept, excludedSeen, excludedExported, complete, timedOut, cursor: ytjCursor, exhausted: registerExhausted && kept < want && !quotaStopped };
  };

  if (kept >= want) return finish(true);

  const ingestRow = async (row: DiscoveredCompany, sourceId: string, reasons: string[], observations?: ObservationInput[], sourceUrl?: string, sourceType = "official_register") => {
    if (kept >= want) return;
    if (Date.now() > deadline) { timedOut = true; return; }
    const result = await attachDiscovered(sql, userId, runId, row, reasons, criteria, exposure, exclusions, skipQuota);
    if (result === "quota") {
      quotaStopped = true;
      return;
    }
    if (result === "kept") {
      kept += 1;
      await bumpSource(sql, userId, sourceId, "discover");
      if (observations?.length) {
        const companyId = row.businessId
          ? (await findCompanyByBid(sql, userId, row.businessId))?.id
          : (await findCompanyByName(sql, userId, row.name, normalizeDomain(row.website ?? null)))?.id;
        if (companyId) await insertObservations(sql, userId, "company", companyId, sourceId, sourceUrl, sourceType, observations);
      }
    } else if (result === "excluded_seen") excludedSeen += 1;
    else if (result === "excluded_exported") excludedExported += 1;
    else if (result === "excluded_customer") excludedSeen += 1;
  };

  let stored = 0;
  let failed = 0;
  const failSample: string[] = [];

  if (country === "FI") {
    if (!sourceAllowed(flags, "ytj")) {
      registerExhausted = true;
      report.push({ source: "ytj", ok: false, skipped: true, error: "kill-switch" });
    } else {
    const result = await ytjDiscover(
      { ...criteria, maxResults: discoverFillTarget(kept, want) },
      {
        skipKeys,
        deadline,
        cursor: ytjCursor,
        onKeep: async (row) => {
          if (kept >= want || quotaStopped) return false;
          if (Date.now() > deadline) { timedOut = true; return false; }
          try {
            const resultAttach = await attachDiscovered(sql, userId, runId, row, ["ytj", row.industryCode ?? "industry"], criteria, exposure, exclusions, skipQuota);
            if (row.businessId) skipKeys.add(row.businessId);
            if (row.name) skipKeys.add(row.name);
            if (resultAttach === "quota") { quotaStopped = true; return false; }
            if (resultAttach === "kept") {
              kept += 1;
              stored += 1;
              await bumpSource(sql, userId, "ytj", "discover");
              const storedId = row.businessId
                ? (await findCompanyByBid(sql, userId, row.businessId))?.id
                : (await findCompanyByName(sql, userId, row.name, normalizeDomain(row.website ?? null)))?.id;
              if (storedId) {
                await insertObservations(sql, userId, "company", storedId, "ytj", result.sourceUrl, "official_register", ytjFieldObservations(row));
              }
              if (stored === 1 || stored % 8 === 0) {
                try { await updateRunStats(sql, userId, runId); } catch { /* stats are best-effort mid-slice */ }
              }
            } else if (resultAttach === "excluded_seen") excludedSeen += 1;
            else if (resultAttach === "excluded_exported") excludedExported += 1;
            else if (resultAttach === "excluded_customer") excludedSeen += 1;
          } catch (err) {
            failed += 1;
            if (failSample.length < 5) failSample.push(err instanceof Error ? err.message.slice(0, 120) : "store failed");
          }
          return kept < want && !quotaStopped;
        },
      },
    );
    if (result.cursor) ytjCursor = result.cursor;
    else if (!result.timedOut) ytjCursor = null;
    if (result.timedOut) timedOut = true;
    if (result.exhausted && !result.timedOut) registerExhausted = true;
    if (!result.ok) {
      await bumpSource(sql, userId, "ytj", "fail", { error: result.error, latencyMs: Date.now() - t0 });
      report.push({ source: "ytj", ok: false, error: result.error });
    } else {
      await bumpSource(sql, userId, "ytj", "ok", { latencyMs: Date.now() - t0 });
      const ytjReport: Record<string, unknown> = {
        source: "ytj",
        ok: true,
        hits: stored,
        registerHits: result.registerHits,
        queries: result.queries,
        expandedNationwide: result.expandedNationwide ?? false,
        filtered: result.filtered ?? 0,
        excludedSeen,
        pool,
        want,
        already: kept,
        timedOut,
      };
      const registerReturned = (result.registerHits ?? 0) > 0 || result.data.length > 0 || stored > 0;
      ytjReport.ok = stored > 0 || kept >= want || registerReturned || timedOut;
      if (stored === 0 && kept === 0 && !registerReturned && !timedOut) {
        ytjReport.ok = false;
        ytjReport.error = failSample[0] ?? "No register hits";
      }
      if (failed) ytjReport.failed = failed;
      report.push(ytjReport);
    }
    }
  }

  if (kept >= want || quotaStopped) return finish(true);
  if (timedOut) return finish(false);

  if (kept < want && stored === 0 && Date.now() < deadline) {
    try {
      const extra = await homemadeRegisterDiscover({
        criteria,
        max: Math.min(RUNTIME.homemadeDiscoverCap, Math.max(want - kept, 8)),
        skipKeys,
        deadline,
        disabled,
      });
      report.push({
        source: "register_plan",
        ok: true,
        official: extra.plan.official,
        homemade: extra.plan.homemade,
        mustIndustry: extra.plan.must.industryCodes,
        evidenceMinimum: extra.plan.evidenceMinimum,
      });
      report.push(...extra.report);
      for (const hit of extra.companies) {
        if (kept >= want || quotaStopped) break;
        if (Date.now() > deadline) { timedOut = true; break; }
        await ingestRow(hit.company, hit.sourceId, hit.reasons);
        if (hit.company.businessId) skipKeys.add(hit.company.businessId);
        if (hit.company.name) skipKeys.add(hit.company.name);
      }
    } catch (err) {
      report.push({
        source: "homemade_register",
        ok: false,
        error: err instanceof Error ? err.message : "homemade register failed",
      });
    }
  }

  if (kept >= want || quotaStopped) return finish(true);
  if (timedOut) return finish(false);
  if (country === "FI" && !registerExhausted && kept < want) return finish(false);

  const nameKw = valuesOf(criteria, "keyword").map(String).filter((k) => looksLikeCompanyName(k));
  if (nameKw.length && kept < want && Date.now() < deadline) {
    const kw = nameKw[0]!;
    const fed = await federatedCompanySearch({ name: kw, country, max: Math.max(0, pool - kept), depth });
    report.push(...fed.report, { note: "Name-keyword fallback after official and homemade registers" });
    for (const row of fed.companies) {
      const gate = acceptDiscovered(row, criteria);
      if (!gate.ok) continue;
      await ingestRow(row, row.lei ? "gleif" : row.website ? "duckduckgo" : "wikidata", [`open_network_${country.toLowerCase()}`, ...gate.reasons]);
    }
  }

  if (quotaStopped) {
    report.push({ source: "quota", ok: true, stopped: true, kept, note: "Plan cap reached. Existing companies were not removed." });
    try {
      const { queueQuotaMail } = await import("./mail-automations.ts");
      await queueQuotaMail(sql, userId, "companies");
    } catch {
      /* mail is best-effort */
    }
  }
  if (country !== "FI") {
    await collapseBranchDuplicates(sql, userId);
    if (!timedOut && kept < want) registerExhausted = true;
  }
  const complete = discoverSliceComplete({ kept, want, timedOut, quotaStopped, registerExhausted });
  return finish(complete);
}

async function runEnrich(sql, userId, runId, companyId, _opts) {
	const co = await loadCompany(sql, userId, companyId);
	if (!co) return;
	const name = String(co.name);
	const country = String(co.country ?? "FI");
	const bid = co.business_id ?? null;
	const vat = co.vat_id ?? null;
	const website = co.website ?? null;
	const emailRecovery = Boolean(_opts?.emailRecovery);
	const runRow = (await sql`select criteria from search_runs where id = ${runId} and user_id = ${userId} limit 1`)[0];
	const depth = runRow?.criteria?.depth === "deep" ? "deep" : "normal";
	const searchPlan = hivePlan({ criteria: runRow?.criteria, depth, country });
	const mun = co.municipality;
	const street = co.street;
	if (!hiveSkipIdentity({ depth, emailRecovery })) {
	const wik = await wikidataLookup(name, bid);
	if (wik.ok) {
		await insertObservations(sql, userId, "company", companyId, "wikidata", wik.sourceUrl, "wikidata", wik.observations);
		if (wik.data.lei && !co.lei) await sql`update companies set lei = ${wik.data.lei} where id = ${companyId} and user_id = ${userId}`;
		if (wik.data.website && !website) await sql`update companies set website = ${wik.data.website}, website_domain = ${normalizeDomain(wik.data.website)} where id = ${companyId} and user_id = ${userId}`;
		if (wik.data.employees != null && co.employee_count == null) await sql`update companies set employee_count = ${wik.data.employees} where id = ${companyId} and user_id = ${userId}`;
		if (wik.data.revenue != null && co.revenue == null) await sql`update companies set revenue = ${wik.data.revenue}, financial_period = ${wik.data.inception ?? null} where id = ${companyId} and user_id = ${userId}`;
		if (wik.data.profit != null && co.profit == null) await sql`update companies set profit = ${wik.data.profit} where id = ${companyId} and user_id = ${userId}`;
		if (wik.data.email) await upsertContact(sql, userId, companyId, {
			kind: "email",
			value: wik.data.email,
			classification: "published",
			sourceId: "wikidata",
			sourceUrl: wik.sourceUrl,
			evidence: "Wikidata P968",
			confidence: 55
		});
		if (wik.data.phone) await upsertContact(sql, userId, companyId, {
			kind: "phone",
			value: wik.data.phone,
			classification: "published",
			sourceId: "wikidata",
			sourceUrl: wik.sourceUrl,
			evidence: "Wikidata P1329",
			confidence: 55
		});
		for (const p of wik.data.people ?? []) await upsertPerson(sql, userId, companyId, p);
		if (!wik.data.people?.length) {
			const person = wikidataPerson(wik.data.ceo ?? null, wik.sourceUrl);
			if (person) await upsertPerson(sql, userId, companyId, person);
		}
		await bumpSource(sql, userId, "wikidata", "enrich", { confidence: 58 });
	} else await bumpSource(sql, userId, "wikidata", "fail", { error: wik.error });
	const gleif = await gleifLookup(name, country);
	if (gleif.ok) {
		await insertObservations(sql, userId, "company", companyId, "gleif", gleif.sourceUrl, "official_register", gleif.observations);
		await sql`update companies set lei = coalesce(lei, ${gleif.data.lei}) where id = ${companyId} and user_id = ${userId}`;
		await bumpSource(sql, userId, "gleif", "enrich", { confidence: 88 });
	} else if (gleif.state !== "connected") await bumpSource(sql, userId, "gleif", "fail", { error: gleif.error });
	if (vat) {
		const vies = await viesValidate(vat);
		if (vies.ok) {
			await insertObservations(sql, userId, "company", companyId, "vies", vies.sourceUrl, "eu_dataset", vies.observations);
			await bumpSource(sql, userId, "vies", "enrich", { confidence: 90 });
		} else await bumpSource(sql, userId, "vies", "fail", { error: vies.error });
	}
	if (co.lat == null && (mun || street)) {
		const local = mun ? findMunicipality(mun) : void 0;
		if (local) {
			await sql`update companies set lat = ${local.lat}, lng = ${local.lng} where id = ${companyId} and user_id = ${userId}`;
			await insertObservations(sql, userId, "company", companyId, "nominatim", "internal:municipality-centroid", "open_government", [{
				field: "coordinates",
				rawValue: `${local.lat},${local.lng}`,
				normalisedValue: `${local.lat},${local.lng}`,
				confidence: 60,
				sourceReliability: 70,
				extractionMethod: "municipality_centroid",
				evidence: `Centroid of ${local.name} (${local.code})`,
				verificationStatus: "derived"
			}]);
		} else {
			const geo = await nominatimGeocode([
				street,
				mun,
				country
			].filter(Boolean).join(", "));
			if (geo.ok) {
				await sql`update companies set lat = ${geo.data.lat}, lng = ${geo.data.lng} where id = ${companyId} and user_id = ${userId}`;
				await insertObservations(sql, userId, "company", companyId, "nominatim", geo.sourceUrl, "open_government", geo.observations);
			}
		}
	}
	}
	const persistHits = async (hits) => {
		if (hits.website) {
			const incoming = canonicalCompanyWebsite(hits.website);
			if (incoming && !isDirectoryHost(incoming)) await sql`update companies set website = ${incoming}, website_domain = ${normalizeDomain(incoming)} where id = ${companyId} and user_id = ${userId}`;
			else if (!incoming && /closed\.html?/i.test(hits.website)) await sql`update companies set website = null, website_domain = null
          where id = ${companyId} and user_id = ${userId}
            and (website is null or website ~* 'closed\\.html?')`;
		}
		const src = hits.websiteSource ?? "website";
		for (const p of hits.people ?? []) await upsertPerson(sql, userId, companyId, p);
		for (const e of hits.emails ?? []) await upsertContact(sql, userId, companyId, {
			kind: "email",
			value: e.value,
			classification: e.classification,
			sourceId: e.sourceId ?? src,
			sourceUrl: e.sourceUrl ?? void 0,
			evidence: e.evidence ?? "Public page",
			confidence: e.confidence
		});
		for (const p of hits.phones ?? []) await upsertContact(sql, userId, companyId, {
			kind: "phone",
			value: p.value,
			classification: "published",
			sourceId: p.sourceId ?? src,
			sourceUrl: p.sourceUrl ?? void 0,
			evidence: p.evidence ?? "Public page",
			confidence: p.confidence
		});
	};
	const site = canonicalCompanyWebsite((await loadCompany(sql, userId, companyId))?.website);
	const facts = await collectFastContacts({
		name,
		municipality: mun,
		website: site,
		street,
		businessId: bid,
		country,
		depth: emailRecovery ? "deep" : depth,
		emailRecovery,
	});
	let finderFirst = { ok: false, profile: null, sourceUrl: "", observations: [] };
	let kl = { ok: false, profile: null, sourceUrl: "", observations: [] };
	let nd = { ok: false, profile: null, sourceUrl: "", observations: [] };
	const needDirs = directoriesNeeded({
		emails: facts.emails.length,
		phones: facts.phones.length,
		website: facts.website,
		depth,
		emailRecovery,
	});
	if (needDirs) {
		[finderFirst, kl, nd] = await Promise.all([
		finderLookup({
			name,
			businessId: bid,
			municipality: mun,
			allowRender: depth === "deep"
		}).catch(() => ({
			ok: false,
			profile: null,
			sourceUrl: "",
			observations: []
		})),
		kauppalehtiLookup({
			name,
			businessId: bid
		}).catch(() => ({
			ok: false,
			profile: null,
			sourceUrl: "",
			observations: []
		})),
		northdataLookup({
			name,
			businessId: bid,
			municipality: mun
		}).catch(() => ({
			ok: false,
			profile: null,
			sourceUrl: "",
			observations: []
		}))
		]);
	}
	if (facts.observations.length) await insertObservations(sql, userId, "company", companyId, catalogSource(facts.websiteSource), facts.website ?? void 0, "structured_web", facts.observations);
	if (!facts.website && facts.existingDead) await sql`update companies set website = null, website_domain = null where id = ${companyId} and user_id = ${userId}`;
	await persistHits({
		website: facts.website,
		websiteSource: facts.websiteSource ?? void 0,
		people: facts.people,
		emails: facts.emails,
		phones: facts.phones
	});
	if (bid && country === "FI" && (!facts.emails.length || !facts.phones.length || !facts.people.length)) {
		try {
			const bis = await prhBisLookup(bid, { timeoutMs: 3500 });
			if (bis.ok) {
				await persistHits({
					website: bis.data.website,
					websiteSource: "ytj",
					people: [],
					emails: (bis.data.contacts ?? []).filter((c) => c.kind === "email"),
					phones: (bis.data.contacts ?? []).filter((c) => c.kind === "phone"),
				});
				if (bis.observations?.length) {
					await insertObservations(sql, userId, "company", companyId, "ytj", bis.sourceUrl, "official_register", bis.observations);
				}
			}
		} catch { /* BIS is optional contact fill */ }
	}
	await recordCapability(sql, userId, companyId, "email", facts.emails.length ? "SUCCESS" : "NO_DATA", { evidence: { n: facts.emails.length } });
	await recordCapability(sql, userId, companyId, "phone", facts.phones.length ? "SUCCESS" : "NO_DATA", { evidence: { n: facts.phones.length } });
	await recordCapability(sql, userId, companyId, "website", facts.website ? "SUCCESS" : "NO_DATA");
	await recordCapability(sql, userId, companyId, "decisionMaker", facts.people.length ? "SUCCESS" : "NO_DATA", { evidence: { n: facts.people.length } });
	if (emailRecovery) return;
	if (facts.website) await bumpSource(sql, userId, catalogSource(facts.websiteSource), "enrich", { confidence: 72 });
	else if (facts.people.length || facts.emails.length || facts.phones.length) await bumpSource(sql, userId, "website", "enrich", { confidence: 72 });
	if (facts.sourcesChecked.includes("duckduckgo")) await bumpSource(sql, userId, "duckduckgo", "enrich", { confidence: 58 });
	const harvestedHosts = /* @__PURE__ */ new Set();
	const markHost = (url) => {
		if (!url) return;
		try {
			harvestedHosts.add(new URL(url).hostname.replace(/^www\./, "").toLowerCase());
		} catch {}
	};
	markHost(facts.website);
	markHost(site);
	const harvestNewSite = async (url, source) => {
		if (contactHarvestDone({ emails: facts.emails.length, phones: facts.phones.length, people: facts.people.length, depth })) return;
		const w = canonicalCompanyWebsite(url ?? null);
		if (!w || isDirectoryHost(w)) return;
		let host = "";
		try {
			host = new URL(w).hostname.replace(/^www\./, "").toLowerCase();
		} catch {
			return;
		}
		if (harvestedHosts.has(host)) return;
		harvestedHosts.add(host);
		const harvested = await harvestSite({
			website: w,
			companyName: name,
			budget: contactPlan({ website: w, depth }).harvestBudget
		});
		await persistHits({
			website: harvested.website,
			websiteSource: source,
			people: harvested.people,
			emails: harvested.emails,
			phones: harvested.phones
		});
	};
	const finder = finderFirst.profile || finderFirst.ok
		? finderFirst
		: facts.finderProfileUrl
			? await finderLookup({
				name,
				businessId: bid,
				municipality: mun,
				profileUrl: facts.finderProfileUrl
			})
			: finderFirst;
	if (finder.observations.length) await insertObservations(sql, userId, "company", companyId, "finder", finder.sourceUrl, "structured_web", finder.observations);
	if (finder.profile) {
		await persistHits({
			website: finder.profile.website,
			websiteSource: "finder",
			people: finder.profile.people,
			emails: finder.profile.emails,
			phones: finder.profile.phones
		});
		await harvestNewSite(finder.profile.website, "finder");
		await bumpSource(sql, userId, "finder", "enrich", { confidence: 84 });
	} else if (!finder.ok) await bumpSource(sql, userId, "finder", "fail", { error: finder.error });
	else await bumpSource(sql, userId, "finder", "enrich", { confidence: 40 });
	if (kl && "observations" in kl && kl.observations.length) await insertObservations(sql, userId, "company", companyId, "kauppalehti", kl.sourceUrl, "structured_web", kl.observations);
	if (kl && "profile" in kl && kl.profile) {
		await persistHits({
			website: kl.profile.website,
			websiteSource: "kauppalehti",
			people: kl.profile.people,
			emails: kl.profile.emails,
			phones: kl.profile.phones
		});
		if (kl.profile.street) await sql`update companies set street = coalesce(street, ${kl.profile.street}) where id = ${companyId} and user_id = ${userId}`;
		await harvestNewSite(kl.profile.website, "kauppalehti");
		await bumpSource(sql, userId, "kauppalehti", "enrich", { confidence: 84 });
	}
	if (nd && "observations" in nd && nd.observations.length) await insertObservations(sql, userId, "company", companyId, "northdata", nd.sourceUrl, "structured_web", nd.observations);
	if (nd && "profile" in nd && nd.profile) {
		await persistHits({
			website: nd.profile.website,
			websiteSource: "northdata",
			people: nd.profile.people,
			emails: nd.profile.emails,
			phones: nd.profile.phones
		});
		if (nd.profile.lei) await sql`update companies set lei = coalesce(lei, ${nd.profile.lei}) where id = ${companyId} and user_id = ${userId}`;
		if (nd.profile.businessId) await sql`update companies set business_id = coalesce(business_id, ${nd.profile.businessId}) where id = ${companyId} and user_id = ${userId}`;
		await harvestNewSite(nd.profile.website, "northdata");
		await bumpSource(sql, userId, "northdata", "enrich", { confidence: 80 });
	}
	if (depth === "deep") {
	const li = await linkedinLookup({
		name,
		municipality: mun,
		ceoHint: facts.people.find((p) => /toimitusjohtaja|ceo|managing director/i.test(p.title ?? ""))?.fullName ?? null
	});
	if (li.observations.length) await insertObservations(sql, userId, "company", companyId, "linkedin", li.companyUrl ?? void 0, "structured_web", li.observations);
	await persistHits({
		website: li.website,
		websiteSource: "linkedin",
		people: li.people,
		emails: li.emails,
		phones: li.phones
	});
	await harvestNewSite(li.website, "linkedin");
	await bumpSource(sql, userId, "linkedin", "enrich", { confidence: li.companyUrl ? 64 : 40 });
	const afterLi = await loadCompany(sql, userId, companyId);
	if ((!afterLi?.website || !afterLi?.general_email || !afterLi?.phone) && grokBudgetRemaining() > 0) {
		const grok = await grokContactSearch({
			name,
			businessId: bid,
			municipality: mun
		});
		if (grok.observations.length) await insertObservations(sql, userId, "company", companyId, "grok_search", grok.website ?? void 0, "search_api", grok.observations);
		if (grok.used) {
			await persistHits({
				website: grok.website,
				websiteSource: "grok_search",
				people: grok.people,
				emails: grok.emails,
				phones: grok.phones
			});
			await harvestNewSite(grok.website, "grok_search");
			await bumpSource(sql, userId, "grok_search", grok.error ? "fail" : "enrich", {
				error: grok.error,
				confidence: grok.error ? 20 : 55
			});
		}
	}
	}
	const site2 = canonicalCompanyWebsite((await loadCompany(sql, userId, companyId))?.website);
	if (site2 && process.env.HUNTER_API_KEY) {
		const domain = normalizeDomain(site2);
		if (domain) {
			const hun = await hunterDomainSearch(domain);
			if (hun.ok) {
				for (const hit of hun.data) await upsertContact(sql, userId, companyId, {
					kind: "email",
					value: hit.value,
					classification: hit.classification === "published" ? "inferred" : hit.classification,
					sourceId: "hunter",
					sourceUrl: hit.sourceUrl ?? void 0,
					evidence: hit.evidence ?? "Hunter domain search",
					confidence: hit.confidence,
					derivationMethod: "hunter_domain_search"
				});
				await bumpSource(sql, userId, "hunter", "enrich", { confidence: 70 });
			} else await bumpSource(sql, userId, "hunter", "fail", { error: hun.error });
		}
	}
	if (!hiveSkipFinancial(searchPlan) && bid) {
		try {
			const xbrl = await prhXbrlLookup(bid);
			if (xbrl.ok && xbrl.data) {
				await sql`update companies set
          revenue = coalesce(${xbrl.data.revenue}, revenue),
          profit = coalesce(${xbrl.data.profit}, profit),
          financial_period = coalesce(${xbrl.data.year}, financial_period),
          financial_source = ${"prh_xbrl"}
          where id = ${companyId} and user_id = ${userId}`;
				await recordCapability(sql, userId, companyId, "financial", xbrl.data.revenue != null ? "SUCCESS" : "NO_DATA", { evidence: { year: xbrl.data.year, status: xbrl.data.status } });
			} else {
				await recordCapability(sql, userId, companyId, "financial", "NO_DATA", { error: xbrl.error ?? "no filing" });
			}
		} catch (err) {
			await recordCapability(sql, userId, companyId, "financial", "FAILED", { error: err instanceof Error ? err.message : "xbrl" });
		}
	}
	if (!hiveSkipSignals(searchPlan)) {
		try {
			const jobs = await publicHiringSearch({ name, municipality: mun, businessId: bid });
			if (jobs.ok && Array.isArray(jobs.data) && jobs.data.length) {
				await recordCapability(sql, userId, companyId, "signals", "SUCCESS", { evidence: { n: jobs.data.length } });
			} else {
				await recordCapability(sql, userId, companyId, "signals", "NO_DATA", { error: jobs.error ?? null });
			}
		} catch (err) {
			await recordCapability(sql, userId, companyId, "signals", "FAILED", { error: err instanceof Error ? err.message : "hiring" });
		}
	}
	if (site2 && !facts.emails.length) await enqueueJob(sql, userId, "crawl", {
		runId,
		companyId,
		payload: {
			url: site2,
			seed: true
		}
	});
	if (!hiveSkipSignals(searchPlan)) await enqueueJob(sql, userId, "signals", {
		runId,
		companyId
	});
	try { await runScore(sql, userId, runId, companyId); } catch { /* score after contacts; extra job not required */ }
	await sql`update companies set record_status = ${"enriched"}, last_verified_at = now() where id = ${companyId} and user_id = ${userId} and record_status = 'discovered'`;
	await bumpSource(sql, userId, "ytj", "enrich", { confidence: 90 });
}
async function upsertPerson(sql, userId, companyId, p) {
	const cleaned = cleanPersonName(p.fullName);
	if (!cleaned) return null;
	const nn = normalizeName(cleaned);
	const tn = p.title ? p.title.toLowerCase().trim() : "";
	const existing = await sql`
    select id, title from people where user_id = ${userId} and company_id = ${companyId} and name_normalized = ${nn} and deleted_at is null
    order by confidence desc nulls last limit 1`;
	const workEmail = p.workEmail && !isJunkEmail(p.workEmail) && !isBillingEmail(p.workEmail) && !isTemplateEmail(p.workEmail) ? cleanExtractedEmail(p.workEmail)?.value ?? null : null;
	if (existing[0]) {
		await sql`update people set
      title = coalesce(title, ${p.title ?? null}),
      title_normalized = coalesce(title_normalized, ${tn || null}),
      seniority = coalesce(seniority, ${p.seniority ?? null}),
      work_email = coalesce(work_email, ${workEmail}),
      work_phone = coalesce(work_phone, ${p.workPhone ?? null}),
      profile_url = coalesce(profile_url, ${p.profileUrl ?? null}),
      evidence = coalesce(evidence, ${p.evidence ?? null}),
      source_page = coalesce(source_page, ${p.sourcePage ?? null}),
      confidence = greatest(coalesce(confidence, 0), ${p.confidence})
      where id = ${existing[0].id}`;
		if (workEmail) await upsertContact(sql, userId, companyId, {
			kind: "email",
			value: workEmail,
			classification: "published",
			sourceId: "website",
			sourceUrl: p.sourcePage ?? void 0,
			evidence: p.evidence ?? "Person record",
			confidence: Math.min(p.confidence, 75),
			personId: existing[0].id
		});
		if (p.workPhone) await upsertContact(sql, userId, companyId, {
			kind: "phone",
			value: p.workPhone,
			classification: "published",
			sourceId: "website",
			sourceUrl: p.sourcePage ?? void 0,
			evidence: p.evidence ?? "Person record",
			confidence: Math.min(p.confidence, 70),
			personId: existing[0].id
		});
		await refreshCompanyContactFields(sql, userId, companyId);
		return existing[0].id;
	}
	const id = nid();
	await sql`insert into people (
    id, user_id, company_id, full_name, name_normalized, title, title_normalized, seniority, source_page, evidence, confidence, work_email, work_phone, profile_url
  ) values (
    ${id}, ${userId}, ${companyId}, ${cleaned}, ${nn}, ${p.title ?? null}, ${tn || null}, ${p.seniority ?? null},
    ${p.sourcePage ?? null}, ${p.evidence ?? null}, ${p.confidence}, ${workEmail}, ${p.workPhone ?? null}, ${p.profileUrl ?? null}
  )`;
	if (workEmail) await upsertContact(sql, userId, companyId, {
		kind: "email",
		value: workEmail,
		classification: "published",
		sourceId: "website",
		sourceUrl: p.sourcePage ?? void 0,
		evidence: p.evidence ?? "Person record",
		confidence: Math.min(p.confidence, 75),
		personId: id
	});
	if (p.workPhone) await upsertContact(sql, userId, companyId, {
		kind: "phone",
		value: p.workPhone,
		classification: "published",
		sourceId: "website",
		sourceUrl: p.sourcePage ?? void 0,
		evidence: p.evidence ?? "Person record",
		confidence: Math.min(p.confidence, 70),
		personId: id
	});
	await refreshCompanyContactFields(sql, userId, companyId);
	return id;
}
async function upsertContact(sql, userId, companyId, c) {
	if (c.kind === "email") {
		const decoded = decodeEmailCandidate(c.value);
		if (!decoded || isGarbageEmail(decoded) || isBillingEmail(decoded) || isRecruitingEmail(decoded)) return null;
		if (isTemplateEmail(decoded)) {
			const person = await sql`
        select full_name from people
        where user_id = ${userId} and company_id = ${companyId} and deleted_at is null
        order by case
          when coalesce(title,'') ~* 'toimitusjohtaja|managing director|verkställande|\\yceo\\y' then 0
          when coalesce(seniority,'') = 'executive' then 1
          else 2 end, confidence desc nulls last
        limit 1`;
			const filled = materializeTemplateEmail(decoded, person[0]?.full_name ?? null);
			if (!filled) return null;
			c = {
				...c,
				value: filled,
				classification: "inferred",
				derivationMethod: c.derivationMethod ?? "template_local_from_site",
				confidence: Math.min(c.confidence, 55)
			};
		} else {
			const cleaned = cleanExtractedEmail(decoded);
			if (!cleaned || cleaned.template) return null;
			c = {
				...c,
				value: cleaned.value
			};
		}
	}
	if (c.kind === "email" && (isJunkEmail(c.value) || isBillingEmail(c.value) || isTemplateEmail(c.value) || isRecruitingEmail(c.value))) return null;
	const valueNormalized = c.kind === "email" ? c.value.toLowerCase() : c.value;
	const role = c.kind === "email" ? isRoleAddress(c.value) : false;
	const disposable = c.kind === "email" ? isDisposableDomain(c.value) : false;
	const syntax = c.kind === "email" ? validEmailSyntax(c.value) : true;
	const existing = await sql`
    select id from contacts where user_id = ${userId} and company_id = ${companyId} and kind = ${c.kind} and value_normalized = ${valueNormalized} limit 1`;
	if (existing[0]) {
		await sql`update contacts set
      last_seen_at = now(),
      confidence = greatest(coalesce(confidence, 0), ${c.confidence}),
      evidence = coalesce(evidence, ${c.evidence ?? null}),
      source_url = coalesce(source_url, ${c.sourceUrl ?? null}),
      person_id = coalesce(person_id, ${c.personId ?? null})
      where id = ${existing[0].id}`;
		await refreshCompanyContactFields(sql, userId, companyId);
		return existing[0].id;
	}
	const id = nid();
	await sql`insert into contacts (
    id, user_id, company_id, person_id, kind, value, value_normalized, classification, role_address, disposable, syntax_valid, mx_valid,
    derivation_method, confidence, source_id, source_url, evidence
  ) values (
    ${id}, ${userId}, ${companyId}, ${c.personId ?? null}, ${c.kind}, ${c.value}, ${valueNormalized}, ${c.classification},
    ${role}, ${disposable}, ${syntax}, ${c.mxValid ?? null}, ${c.derivationMethod ?? null}, ${c.confidence},
    ${c.sourceId ?? null}, ${c.sourceUrl ?? null}, ${c.evidence ?? null}
  )`;
	await refreshCompanyContactFields(sql, userId, companyId);
	return id;
}
async function refreshCompanyContactFields(sql, userId, companyId) {
	const co = await loadCompany(sql, userId, companyId);
	const domain = co?.website_domain ?? (co?.website ? normalizeDomain(co.website) : null);
	const bestEmail = (await sql`
    select value, classification, person_id, role_address from contacts
    where user_id = ${userId} and company_id = ${companyId} and kind = 'email'`).filter((e) => {
		const v = decodeEmailCandidate(e.value);
		return !isJunkEmail(v) && !isBillingEmail(v) && !isRecruitingEmail(v) && !isTemplateEmail(v) && !isGarbageEmail(v);
	}).map((e) => ({
		e,
		rank: emailPreferenceRank(e.value, {
			personLinked: Boolean(e.person_id),
			companyDomain: domain
		}) + (e.classification === "published" ? 0 : 5)
	})).sort((a, b) => a.rank - b.rank)[0]?.e ?? null;
	let phone = (await sql`
    select work_phone, work_email from people
    where user_id = ${userId} and company_id = ${companyId} and deleted_at is null
      and work_phone is not null
    order by case
      when coalesce(title,'') ~* 'toimitusjohtaja|managing director|verkställande|\\yceo\\y' then 0
      when coalesce(seniority,'') = 'executive' then 1
      else 2 end, confidence desc nulls last
    limit 1`)[0]?.work_phone ?? null;
	if (!phone) phone = (await sql`
      select value from contacts
      where user_id = ${userId} and company_id = ${companyId} and kind = 'phone' and person_id is not null
      order by confidence desc nulls last limit 1`)[0]?.value ?? null;
	if (!phone) phone = (await sql`
      select value from contacts
      where user_id = ${userId} and company_id = ${companyId} and kind = 'phone'
      order by confidence desc nulls last limit 1`)[0]?.value ?? null;
	await sql`update companies set
    general_email = ${bestEmail?.value ?? null},
    general_email_class = ${bestEmail?.classification ?? null},
    phone = ${phone},
    updated_at = now()
    where id = ${companyId} and user_id = ${userId}`;
}
async function runCrawl(sql, userId, runId, companyId, url, seed) {
	if (!await loadCompany(sql, userId, companyId)) return;
	const runRows = await sql`select criteria from search_runs where id = ${runId} and user_id = ${userId}`;
	const roles = runRows[0]?.criteria?.roles ?? ["ceo", "sales_director"];
	const deep = runRows[0]?.criteria?.depth === "deep";
	const crawlBudget = deep ? DEEP_CRAWL_BUDGET : CRAWL_BUDGET;
	let origin;
	try {
		origin = new URL(url);
	} catch {
		return;
	}
	const robots = await readRobots(origin.origin);
	if (!robotsAllows(robots.body, origin.pathname)) {
		await sql`insert into crawl_pages (id, user_id, company_id, url, robots_allowed, error)
      values (${nid()}, ${userId}, ${companyId}, ${url}, ${false}, ${"Blocked by robots.txt"})
      on conflict (user_id, company_id, url) do update set error = excluded.error, robots_allowed = false`;
		await bumpSource(sql, userId, "website", "fail", { error: `robots.txt blocked ${origin.pathname}` });
		await enqueueJob(sql, userId, "score", {
			runId,
			companyId
		});
		return;
	}
	try {
		const page = await crawlPage(url, roles);
		await sql`insert into crawl_pages (id, user_id, company_id, url, final_url, status_code, content_type, language, content_hash, excerpt, structured, robots_allowed)
      values (
        ${nid()}, ${userId}, ${companyId}, ${url}, ${page.finalUrl}, ${page.status}, ${page.contentType}, ${page.language},
        ${page.hash}, ${page.excerpt}, ${JSON.stringify({
			title: page.meta.title,
			jsonLd: page.jsonLd.raw.slice(0, 8),
			quality: page.quality,
			tech: page.technologies
		})}::jsonb,
        ${true}
      )
      on conflict (user_id, company_id, url) do update set
        final_url = excluded.final_url, status_code = excluded.status_code, excerpt = excluded.excerpt, content_hash = excluded.content_hash, fetched_at = now()`;
		if (seed && page.meta.title) {
			const money = extractFinancialMentions(page.text);
			await sql`update companies set description = coalesce(description, ${page.excerpt.slice(0, 500)}),
        technologies = ${JSON.stringify(page.technologies)}::jsonb,
        website_quality = ${JSON.stringify(page.quality)}::jsonb,
        revenue = coalesce(revenue, ${money.revenue}),
        profit = coalesce(profit, ${money.profit})
        where id = ${companyId} and user_id = ${userId}`;
		}
		for (const e of page.emails) await upsertContact(sql, userId, companyId, {
			kind: "email",
			value: e.value,
			classification: e.classification,
			sourceId: "website",
			sourceUrl: page.finalUrl,
			evidence: "Extracted from public HTML",
			confidence: e.classification === "published" ? 80 : 65
		});
		for (const p of page.phones) await upsertContact(sql, userId, companyId, {
			kind: "phone",
			value: p.value,
			classification: "published",
			sourceId: "website",
			sourceUrl: page.finalUrl,
			evidence: "Extracted from public HTML",
			confidence: 75
		});
		for (const person of page.people) await upsertPerson(sql, userId, companyId, person);
		if (page.hiring) await sql`insert into signals (id, user_id, company_id, kind, title, source_id, source_url, confidence, evidence)
        values (${nid()}, ${userId}, ${companyId}, ${"hiring"}, ${"Hiring language on public page"}, ${"website"}, ${page.finalUrl}, ${70}, ${"Keyword match on page text"})`;
		if (page.ecommerce) await sql`insert into signals (id, user_id, company_id, kind, title, source_id, source_url, confidence, evidence)
        values (${nid()}, ${userId}, ${companyId}, ${"ecommerce"}, ${"E-commerce markers on website"}, ${"website"}, ${page.finalUrl}, ${75}, ${"Cart/shop markers"})`;
		if (page.quality.likelyWeak) await sql`insert into signals (id, user_id, company_id, kind, title, detail, source_id, source_url, confidence, evidence)
        values (${nid()}, ${userId}, ${companyId}, ${"website_weak"}, ${"Website quality flags"}, ${page.quality.notes.join("; ")}, ${"website"}, ${page.finalUrl}, ${60}, ${page.quality.notes.join("; ")})`;
		const orgEmail = page.jsonLd.orgs.find((o) => o.email)?.email;
		if (orgEmail) await upsertContact(sql, userId, companyId, {
			kind: "email",
			value: String(orgEmail).replace(/^mailto:/, ""),
			classification: "published",
			sourceId: "website",
			sourceUrl: page.finalUrl,
			evidence: "JSON-LD Organization.email",
			confidence: 85
		});
		const crawled = await sql`select url from crawl_pages where user_id = ${userId} and company_id = ${companyId}`;
		const already = new Set(crawled.map((r) => r.url));
		if (seed) {
			try {
				const extras = await discoverSitemapUrls(origin.origin, 4);
				for (const u of extras) if (!already.has(u)) already.add(u);
				for (const u of extras) {
					if (already.size > crawlBudget) break;
					await enqueueJob(sql, userId, "crawl", {
						runId,
						companyId,
						payload: {
							url: u,
							seed: false
						}
					});
				}
			} catch {}
			for (const path of CONTACT_SEED_PATHS.slice(0, deep ? 20 : 8)) {
				if (already.size >= crawlBudget) break;
				const seedUrl = new URL(path, origin.origin).toString();
				if (already.has(seedUrl)) continue;
				if (!robotsAllows(robots.body, path)) continue;
				already.add(seedUrl);
				await enqueueJob(sql, userId, "crawl", {
					runId,
					companyId,
					payload: {
						url: seedUrl,
						seed: false
					}
				});
			}
		}
		if (already.size < crawlBudget) {
			const next = pickNextUrls(origin.hostname, page.links, already, crawlBudget - already.size);
			for (const u of next) await enqueueJob(sql, userId, "crawl", {
				runId,
				companyId,
				payload: {
					url: u,
					seed: false
				}
			});
		}
		if (!((await sql`select count(*)::int as n from jobs where user_id = ${userId} and run_id = ${runId} and company_id = ${companyId} and type = 'crawl' and status = 'queued'`)[0]?.n ?? 0)) await enqueueJob(sql, userId, "score", {
			runId,
			companyId
		});
		await bumpSource(sql, userId, "website", "enrich", { confidence: 80 });
	} catch (err) {
		const msg = err instanceof Error ? err.message : "crawl failed";
		await sql`insert into crawl_pages (id, user_id, company_id, url, robots_allowed, error)
      values (${nid()}, ${userId}, ${companyId}, ${url}, ${true}, ${msg})
      on conflict (user_id, company_id, url) do update set error = excluded.error`;
		await bumpSource(sql, userId, "website", "fail", { error: msg });
		await enqueueJob(sql, userId, "score", {
			runId,
			companyId
		});
	}
}
async function runSignals(sql, userId, companyId, _runId) {
	const co = await loadCompany(sql, userId, companyId);
	if (!co) return;
	const name = String(co.name);
	const ted = await tedSearch(name);
	if (ted.ok) {
		for (const s of ted.data) await sql`insert into signals (id, user_id, company_id, kind, title, detail, source_id, source_url, confidence, evidence)
        values (${nid()}, ${userId}, ${companyId}, ${s.kind}, ${s.title}, ${s.detail ?? null}, ${"ted"}, ${s.sourceUrl ?? null}, ${s.confidence}, ${s.evidence ?? null})`;
		for (const c of ted.contacts ?? []) await upsertContact(sql, userId, companyId, {
			kind: c.kind,
			value: c.value,
			classification: c.classification,
			sourceId: "ted",
			sourceUrl: c.sourceUrl ?? void 0,
			evidence: c.evidence ?? "TED notice",
			confidence: c.confidence
		});
		if (ted.data.length) await bumpSource(sql, userId, "ted", "enrich", { confidence: 70 });
	} else await bumpSource(sql, userId, "ted", "fail", { error: ted.error });
	const hilma = await hilmaSearch(name);
	if (hilma.ok) {
		for (const s of hilma.data) await sql`insert into signals (id, user_id, company_id, kind, title, detail, source_id, source_url, confidence, evidence)
        values (${nid()}, ${userId}, ${companyId}, ${s.kind}, ${s.title}, ${s.detail ?? null}, ${"hilma"}, ${s.sourceUrl ?? null}, ${s.confidence}, ${s.evidence ?? null})`;
		if (hilma.data.length) await bumpSource(sql, userId, "hilma", "enrich", { confidence: 68 });
	} else await bumpSource(sql, userId, "hilma", "fail", { error: hilma.error });
}
async function runScore(sql, userId, runId, companyId) {
	const co = await loadCompany(sql, userId, companyId);
	if (!co) return;
	const run = (await sql`select criteria from search_runs where id = ${runId} and user_id = ${userId}`)?.[0];
	if (!run) return;
	const peopleN = (await sql`select count(*)::int as n from people where user_id = ${userId} and company_id = ${companyId} and deleted_at is null`)[0]?.n ?? 0;
	const emails = await sql`select value, classification from contacts where user_id = ${userId} and company_id = ${companyId} and kind = 'email'`;
	const phones = await sql`select count(*)::int as n from contacts where user_id = ${userId} and company_id = ${companyId} and kind = 'phone'`;
	const sigs = await sql`select kind from signals where user_id = ${userId} and company_id = ${companyId}`;
	const kinds = new Set(sigs.map((s) => s.kind));
	const obs = await sql`select source_reliability from observations where user_id = ${userId} and entity_id = ${companyId}`;
	const relAvg = obs.length ? obs.reduce((a, r) => a + r.source_reliability, 0) / obs.length : 50;
	const domain = co.website_domain ?? normalizeDomain(co.website);
	if (domain) {
		const mx = await mxCheck(domain);
		await insertObservations(sql, userId, "company", companyId, "rdap", `dns:mx:${domain}`, "dns_rdap", [{
			field: "mx",
			rawValue: mx.hosts.join(",") || "none",
			normalisedValue: mx.mx ? "valid" : "none",
			confidence: mx.mx ? 80 : 40,
			sourceReliability: 75,
			extractionMethod: "dns_mx",
			verificationStatus: mx.mx ? "verified" : "failed"
		}]);
		const published = emails.filter((e) => e.classification === "published").map((e) => e.value);
		const people = await sql`select id, full_name from people where user_id = ${userId} and company_id = ${companyId} and deleted_at is null`;
		for (const p of people) {
			const inferred = inferEmail({
				domain,
				fullName: p.full_name,
				publishedEmails: published
			});
			if (inferred) await upsertContact(sql, userId, companyId, {
				kind: "email",
				value: inferred.value,
				classification: "inferred",
				sourceId: "website",
				derivationMethod: inferred.derivationMethod,
				confidence: inferred.confidence,
				evidence: inferred.derivationMethod,
				personId: p.id,
				mxValid: mx.mx
			});
		}
	}
	const quality = co.website_quality ?? null;
	const websiteIntel = websiteIntelFromStored(co.website_quality);
	const sigHiring = kinds.has("hiring") || Boolean(websiteIntel && /hiring/i.test(websiteIntel.notes.join(" ")));
	const intel = buildCompanyIntel({
		registrationDate: co.registration_date ?? null,
		revenue: co.revenue != null ? Number(co.revenue) : null,
		revenueSource: co.revenue != null ? "stored" : null,
		profit: co.profit != null ? Number(co.profit) : null,
		employeeCount: co.employee_count ?? null,
		industryCode: co.industry_code ?? null,
		industryLabel: co.industry_label ?? null,
		description: co.description ?? null,
		website: websiteIntel,
		hiring: kinds.has("hiring") || sigHiring,
		expansion: kinds.has("expansion"),
		procurement: kinds.has("procurement"),
		criteria: run.criteria
	});
	try {
		await sql`update companies set
      intel = ${JSON.stringify(intel)}::jsonb,
      website_score = ${intel.website?.score ?? null},
      seo_score = ${intel.website?.seoScore ?? null},
      digital_maturity = ${intel.website?.digitalMaturity ?? null},
      commercial_opportunity = ${intel.scores.commercialOpportunity},
      company_age_years = ${intel.companyAgeYears},
      match_score = ${intel.match.score}
      where id = ${companyId} and user_id = ${userId}`;
	} catch {}
	const breakdown = scoreCompany({
		criteria: run.criteria,
		industryCode: co.industry_code ?? null,
		municipality: co.municipality ?? null,
		country: co.country ?? null,
		hasWebsite: Boolean(co.website),
		websiteWeak: Boolean(quality?.likelyWeak) || Boolean(intel.website?.likelyWeak),
		employeeCount: co.employee_count ?? null,
		revenue: co.revenue != null ? Number(co.revenue) : null,
		hasDecisionMaker: peopleN > 0,
		hasPublishedEmail: emails.some((e) => e.classification === "published"),
		hasPublishedPhone: (phones[0]?.n ?? 0) > 0,
		hasHiring: kinds.has("hiring"),
		hasProcurement: kinds.has("procurement"),
		hasFunding: kinds.has("funding"),
		hasExpansion: kinds.has("expansion"),
		hasProjects: kinds.has("projects"),
		lastVerifiedAt: co.last_verified_at ?? null,
		sourceReliabilityAvg: relAvg,
		confidenceFloor: Number(valuesOf(run.criteria, "confidence_min")[0] ?? 0)
	});
	const overall = targetHasConstraint(run.criteria.target) ? intel.match.score : intel.scores.commercialOpportunity ?? breakdown.score;
	await sql`insert into company_scores (id, user_id, company_id, run_id, score, explanation, weights)
    values (${nid()}, ${userId}, ${companyId}, ${runId}, ${overall}, ${JSON.stringify({
		...breakdown,
		intel,
		match: intel.match,
		text: [explanationText(breakdown), intel.match.why.join("; ")].filter(Boolean).join("\n")
	})}::jsonb, ${JSON.stringify(DEFAULT_WEIGHTS)}::jsonb)`;
	const minC = Number(valuesOf(run.criteria, "confidence_min")[0] ?? 0);
	const targetReject = shouldRejectForTarget(intel, run.criteria);
	const missingSite = valuesOf(run.criteria, "website_required").some(Boolean) && !co.website;
	const rejected = Boolean((minC && overall < minC) || targetReject || missingSite);
	const rejectReason = missingSite
		? "website missing"
		: targetReject
			? targetReject
			: rejected
				? intel.match.missed.join("; ") || `Score ${overall} below threshold ${minC}`
				: null;
	const hasSomeContact = emails.length > 0 || (phones[0]?.n ?? 0) > 0 || peopleN > 0;
	await sql`update companies set overall_confidence = ${overall}, record_status = ${rejected ? "rejected" : hasSomeContact ? "verified" : "enriched"},
    reject_reason = ${rejectReason}, last_verified_at = now()
    where id = ${companyId} and user_id = ${userId}`;
	try { await freezeRunRanking(sql, userId, runId, run.criteria); } catch {}
}

async function enqueueCrawl(sql, userId, runId, companyId, url, seed) {
	const w = canonicalCompanyWebsite(url);
	if (!w || isDirectoryHost(w)) return;
	await enqueueJob(sql, userId, "crawl", { runId, companyId, payload: { url: w, seed: Boolean(seed) } });
}

async function runScrape(sql, userId, runId, companyId) {
	const co = await loadCompany(sql, userId, companyId);
	if (!co) return;
	const name = String(co.name ?? "").trim();
	if (name.length < 2) return;
	const pages = await findCompanyPages({
		name,
		municipality: co.municipality ?? null,
		businessId: co.business_id ?? null,
		country: co.country ?? "FI",
	});
	const site = canonicalCompanyWebsite(pages.website ?? co.website);
	if (site && !isDirectoryHost(site)) {
		await sql`update companies set website = coalesce(website, ${site}), website_domain = coalesce(website_domain, ${normalizeDomain(site)})
      where id = ${companyId} and user_id = ${userId}`;
		await enqueueCrawl(sql, userId, runId, companyId, site, true);
	}
	for (const e of pages.emails ?? []) {
		const value = typeof e === "string" ? e : e.value;
		if (!value) continue;
		await upsertContact(sql, userId, companyId, {
			kind: "email",
			value,
			classification: e.classification ?? "published",
			sourceId: "search_api",
			evidence: e.evidence ?? "Public web search",
			confidence: e.confidence ?? 60,
		});
	}
	for (const p of pages.phones ?? []) {
		const value = typeof p === "string" ? p : p.value;
		if (!value) continue;
		await upsertContact(sql, userId, companyId, {
			kind: "phone",
			value,
			classification: "published",
			sourceId: "search_api",
			evidence: "Public web search",
			confidence: 60,
		});
	}
	for (const person of pages.people ?? []) await upsertPerson(sql, userId, companyId, person);
	const extra = contactsFromHits(pages.hits ?? []);
	for (const e of extra.emails ?? []) {
		await upsertContact(sql, userId, companyId, {
			kind: "email",
			value: e.value,
			classification: e.classification ?? "published",
			sourceId: "search_api",
			evidence: e.evidence ?? "Search snippet",
			confidence: e.confidence ?? 50,
		});
	}
}

async function stealStaleJobs(sql, userId, runId) {
	await sql`update jobs set status = ${"queued"}, locked_at = null, run_after = now(), updated_at = now(), last_error = ${"stolen stale lock"}
    where user_id = ${userId} and status = ${"running"}
      and (
        locked_at is null
        or locked_at < now() - make_interval(secs => ${RUNTIME.jobStealSeconds})
        or updated_at < now() - interval '15 seconds'
      )
      and (${runId ?? null}::text is null or run_id = ${runId ?? null})`;
}

async function claimNextJob(sql, userId, runId, opts) {
	const skipDiscover = Boolean(opts?.skipDiscover);
	const live = (await sql`select count(*)::int as n from jobs where user_id = ${userId} and status = ${"running"}`)[0]?.n ?? 0;
	if (Number(live) >= 4) return null;
	const job = (await sql`
    select id from jobs
    where user_id = ${userId} and status = 'queued' and run_after <= now()
      and (${runId ?? null}::text is null or run_id = ${runId ?? null})
      and (${!skipDiscover} or type <> ${"discover"})
      and (
        run_id is null
        or type = ${"email"}
        or exists (
          select 1 from search_runs r
          where r.id = jobs.run_id and r.user_id = ${userId}
            and r.status in ('running','queued')
        )
      )
    order by case type
        when 'discover' then 0
        when 'email' then 1
        when 'enrich' then 2
        when 'scrape' then 3
        when 'score' then 4
        when 'crawl' then 5
        when 'signals' then 6
        else 7 end, created_at asc
      limit 1`)[0];
	if (!job) return null;
	const claimed = (await sql`
      update jobs set status = ${"running"}, attempts = attempts + 1, locked_at = now(), updated_at = now()
      where id = ${job.id} and user_id = ${userId} and status = ${"queued"}
      returning id, type, company_id, run_id, payload`)[0];
	return claimed ?? null;
}

async function processNextJob(sql, userId, runId, opts) {
	if (runId) {
		const run = (await sql`
      select pause_requested, cancel_requested, status from search_runs where id = ${runId} and user_id = ${userId}`)?.[0];
		if (!run) return { did: false };
		if (run.cancel_requested) {
			await sql`update jobs set status = ${"cancelled"} where user_id = ${userId} and run_id = ${runId} and status in ('queued','running')`;
			await sql`update search_runs set status = ${"cancelled"}, finished_at = now() where id = ${runId} and user_id = ${userId}`;
			return { did: false };
		}
		if (run.pause_requested) {
			await sql`update search_runs set status = ${"paused"} where id = ${runId} and user_id = ${userId}`;
			return { did: false };
		}
	}
	const job = await claimNextJob(sql, userId, runId, opts);
	if (!job) {
		if (runId) await updateRunStats(sql, userId, runId);
		return { did: false };
	}
	try {
		if (job.type === "discover" && job.run_id) {
			const run = (await sql`select criteria from search_runs where id = ${job.run_id} and user_id = ${userId}`)?.[0];
			if (run) {
				const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
				const disc = await Promise.race([
					runDiscover(sql, userId, job.run_id, run.criteria, { cursor: payload.ytjCursor ?? null }),
					new Promise<{ complete: false; cursor: unknown; discovered: number; timedOut: true }>((resolve) => {
						setTimeout(() => resolve({ complete: false, cursor: payload.ytjCursor ?? null, discovered: 0, timedOut: true }), Math.max(16_000, RUNTIME.discoverBudgetMs + 4_000));
					}),
				]);
				if (!disc.complete) {
					await sql`update jobs set status = ${"queued"}, attempts = greatest(attempts - 1, 0), run_after = now(), last_error = ${"discover continue"}, locked_at = null, payload = ${JSON.stringify({ ...payload, ytjCursor: disc.cursor ?? payload.ytjCursor ?? null, discoverExhausted: false, ytjScannedAll: false })}::jsonb, updated_at = now()
            where id = ${job.id} and user_id = ${userId}`;
					return { did: true, type: job.type, incomplete: true };
				}
				await sql`update jobs set payload = ${JSON.stringify({ ...payload, ytjCursor: disc.cursor ?? null, discoverExhausted: Boolean(disc.exhausted), ytjScannedAll: Boolean(disc.exhausted) })}::jsonb
            where id = ${job.id} and user_id = ${userId}`;
			}
		} else if (job.type === "enrich" && job.company_id && job.run_id) await runEnrich(sql, userId, job.run_id, job.company_id);
		else if (job.type === "email" && job.company_id && job.run_id) await runEnrich(sql, userId, job.run_id, job.company_id, { emailRecovery: true });
		else if (job.type === "scrape" && job.company_id) await runScrape(sql, userId, job.run_id, job.company_id);
		else if (job.type === "crawl" && job.company_id && job.payload?.url) {
			const already = (await sql`select general_email from companies where id = ${job.company_id} and user_id = ${userId}`)?.[0];
			if (already?.general_email) { /* hive: skip crawl when CORE_SALES email exists */ }
			else await runCrawl(sql, userId, job.run_id, job.company_id, job.payload.url, Boolean(job.payload.seed));
		}
		else if (job.type === "signals" && job.company_id) {
			const runRow = (await sql`select criteria from search_runs where id = ${job.run_id} and user_id = ${userId}`)?.[0];
			const plan = hivePlan({ criteria: runRow?.criteria, depth: runRow?.criteria?.depth, country: runRow?.criteria?.country ?? "FI" });
			if (!hiveSkipSignals(plan)) await runSignals(sql, userId, job.company_id, job.run_id);
		}
		else if (job.type === "score" && job.company_id && job.run_id) {
			const scored = (await sql`select match_score from companies where id = ${job.company_id} and user_id = ${userId}`)?.[0];
			if (scored?.match_score == null) {
			const slice = await sql`select type, status from jobs where user_id = ${userId} and run_id = ${job.run_id} and company_id = ${job.company_id}`;
			const gate = scoreMayProceed(slice);
			if (gate !== "score") {
				if (gate === "enqueue_scrape") await ensureScrapeJob(sql, userId, job.run_id, job.company_id);
				await sql`update jobs set status = ${"queued"}, attempts = greatest(attempts - 1, 0), run_after = now() + interval '4 seconds', last_error = ${"waiting for scrape"}, locked_at = null, updated_at = now()
          where id = ${job.id} and user_id = ${userId}`;
				return { did: true, type: job.type, incomplete: true };
			}
			await runScore(sql, userId, job.run_id, job.company_id);
			}
		}
		else if (job.type === "refresh" && job.company_id) await runRefresh(sql, userId, job.company_id);
		else {
			await sql`update jobs set status = ${"failed"}, last_error = ${"Unknown job type"}, updated_at = now()
        where id = ${job.id} and user_id = ${userId}`;
			return { did: true, type: job.type, error: "Unknown job type" };
		}
		await sql`update jobs set status = ${"done"}, updated_at = now() where id = ${job.id} and user_id = ${userId}`;
		if (job.company_id && job.run_id && job.type === "scrape") {
			await enqueueScore(sql, userId, job.run_id, job.company_id);
		}
		if (job.run_id) await updateRunStats(sql, userId, job.run_id);
		return { did: true, type: job.type };
	} catch (err) {
		const msg = err instanceof Error ? err.message : "job failed";
		if (msg === "SCRAPE_REQUIRED") {
			if (job.company_id && job.run_id) await ensureScrapeJob(sql, userId, job.run_id, job.company_id);
			await sql`update jobs set status = ${"queued"}, attempts = greatest(attempts - 1, 0), run_after = now() + interval '4 seconds', last_error = ${"waiting for scrape"}, locked_at = null, updated_at = now()
        where id = ${job.id} and user_id = ${userId}`;
			return { did: true, type: job.type, incomplete: true };
		}
		const jobRow = (await sql`select attempts, max_attempts from jobs where id = ${job.id}`)?.[0];
		await sql`update jobs set status = ${(jobRow?.attempts ?? 1) >= (jobRow?.max_attempts ?? 3) ? "failed" : "queued"}, last_error = ${msg}, run_after = now() + interval '2 seconds', locked_at = null, updated_at = now()
      where id = ${job.id} and user_id = ${userId}`;
		if (job.run_id) await updateRunStats(sql, userId, job.run_id);
		return { did: true, type: job.type, error: msg };
	}
}

export async function resumeDiscoverIfStarved(sql, userId, runId) {
	if (!runId) return false;
	const run = (await sql`select criteria, status, pause_requested, cancel_requested from search_runs where id = ${runId} and user_id = ${userId}`)?.[0];
	if (!run) return false;
	const want = Math.max(1, Number(run.criteria?.maxResults ?? 100));
	const skipSeen = skipPreviouslyShown(run.criteria ?? {});
	let kept = 0;
	try {
		kept = (await sql`select count(*)::int as n from run_companies rc
      join companies c on c.id = rc.company_id
      where rc.user_id = ${userId} and rc.run_id = ${runId}
        and c.deleted_at is null
        and c.record_status is distinct from 'rejected'
        and (${!skipSeen} or coalesce(rc.seen_before, false) = false)`)[0]?.n ?? 0;
	} catch {
		try {
			kept = (await sql`select count(*)::int as n from run_companies where user_id = ${userId} and run_id = ${runId} and coalesce(seen_before, false) = false`)[0]?.n ?? 0;
		} catch {
			return false;
		}
	}
	const open = await sql`select id from jobs where user_id = ${userId} and run_id = ${runId} and type = ${"discover"} and status in ('queued','running') limit 1`;
	const done = await sql`select id, payload from jobs where user_id = ${userId} and run_id = ${runId} and type = ${"discover"} order by updated_at desc limit 1`;
	const payload = done[0]?.payload && typeof done[0].payload === "object" ? done[0].payload : {};
	if (!shouldResumeDiscover({
		status: String(run.status ?? ""),
		pauseRequested: Boolean(run.pause_requested),
		cancelRequested: Boolean(run.cancel_requested),
		kept,
		want,
		discoverOpen: Boolean(open[0]),
		registerScannedAll: Boolean(payload.ytjScannedAll),
		resumeCount: Number(payload.resumeCount ?? 0),
	})) return false;
	if (!done[0]) return false;
	await sql`update jobs set status = ${"queued"}, run_after = now(), last_error = ${"discover continue"}, attempts = 0, locked_at = null, payload = ${JSON.stringify({ ...payload, discoverExhausted: false, ytjScannedAll: false, resumeCount: Number(payload.resumeCount ?? 0) + 1 })}::jsonb, updated_at = now()
    where id = ${done[0].id} and user_id = ${userId}`;
	await sql`update search_runs set status = ${"running"}, finished_at = null where id = ${runId} and user_id = ${userId} and status in ('completed','running','queued')`;
	return true;
}

export async function processJobsFor(sql, userId, runId, opts) {
	if (!opts?.skipSchema) {
		try { await ensureOpsSchema(sql); } catch { /* */ }
	}
	try { if (runId) await resumeDiscoverIfStarved(sql, userId, runId); } catch { /* */ }
	const maxMs = opts?.maxMs ?? RUNTIME.workerMaxMs;
	const concurrency = clampConcurrency(opts?.concurrency);
	const t0 = Date.now();
	let processed = 0;
	let emptyWaves = 0;
	const running = new Set();
	const launch = () => {
		const task = processNextJob(sql, userId, runId, opts).then((r) => {
			running.delete(task);
			return r;
		});
		running.add(task);
	};
	while (Date.now() - t0 < maxMs) {
		if (maxMs - (Date.now() - t0) < 150) break;
		if (!running.size) {
			try { await stealStaleJobs(sql, userId, runId); } catch { /* */ }
		}
		while (running.size < concurrency && Date.now() - t0 < maxMs) launch();
		if (!running.size) break;
		const r = await Promise.race(running);
		if (r.did) {
			processed += 1;
			emptyWaves = 0;
			continue;
		}
		if (running.size) continue;
		emptyWaves += 1;
		if (emptyWaves >= 2) break;
		await new Promise((res) => setTimeout(res, 60));
	}
	if (running.size) {
		await Promise.race([
			Promise.all(running),
			new Promise((res) => setTimeout(res, 250)),
		]);
	}
	return processed;
}

/** Run-page pump: no schema DDL. Steal stale locks, then process this run. */
const pumpLocks = new Map();
export async function pumpSearch(sql, userId, runId) {
	if (!runId || !userId) return 0;
	const now = Date.now();
	if (now - (pumpLocks.get(runId) ?? 0) < 8_000) return 0;
	pumpLocks.set(runId, now);
	try { await stealStaleJobs(sql, userId, null); } catch { /* */ }
	return processJobsFor(sql, userId, runId, { maxMs: 10_000, concurrency: 2, skipSchema: true });
}

const kickLocks = new Map();
export async function kickSearchExecution(sql, userId, runId, opts) {
	if (!runId) return 0;
	const now = Date.now();
	const prev = kickLocks.get(runId) ?? 0;
	if (now - prev < 4000) return 0;
	kickLocks.set(runId, now);
	try {
		const run = (await sql`select status, pause_requested, cancel_requested from search_runs where id = ${runId} and user_id = ${userId}`)?.[0];
		if (!run || run.pause_requested || run.cancel_requested) return 0;
		if (run.status !== "running" && run.status !== "queued") return 0;
		const queued = await sql`select id from jobs where user_id = ${userId} and run_id = ${runId} and status in (${"queued"}, ${"running"}) and (run_after is null or run_after <= now()) limit 1`;
		if (!queued[0]) return 0;
		return await processJobsFor(sql, userId, runId, { maxMs: opts?.maxMs ?? 8_000, concurrency: 8 });
	} catch (err) {
		console.error("[norf] kickSearchExecution", err);
		return 0;
	}
}

export async function processDueSchedules(sql, userId) {
	const due = await sql`
    select id, name, criteria from search_profiles
    where user_id = ${userId} and schedule_enabled = true and next_run_at is not null and next_run_at <= now()`;
	let started = 0;
	for (const p of due) {
		if (!(await assertSearchQuota(sql, userId)).ok) {
			await sql`update search_profiles set next_run_at = now() + interval '1 day', updated_at = now()
        where id = ${p.id} and user_id = ${userId}`;
			continue;
		}
		const runId = nid();
		await sql`insert into search_runs (id, user_id, profile_id, status, criteria) values (${runId}, ${userId}, ${p.id}, ${"queued"}, ${JSON.stringify(p.criteria)}::jsonb)`;
		await enqueueJob(sql, userId, "discover", { runId, payload: { scheduled: true } });
		await sql`update jobs set status = ${"running"}, locked_at = now(), updated_at = now()
      where user_id = ${userId} and run_id = ${runId} and type = ${"discover"} and status = ${"queued"}`;
		await sql`update search_profiles set last_run_at = now(), next_run_at = now() + interval '1 day' where id = ${p.id} and user_id = ${userId}`;
		const disc = await runDiscover(sql, userId, runId, p.criteria);
		if (disc.complete) {
			await sql`update jobs set status = ${"done"}, payload = ${JSON.stringify({ ytjCursor: disc.cursor ?? null, discoverExhausted: Boolean(disc.exhausted), ytjScannedAll: Boolean(disc.exhausted) })}::jsonb, updated_at = now()
        where user_id = ${userId} and run_id = ${runId} and type = ${"discover"}`;
		} else {
			await sql`update jobs set status = ${"queued"}, run_after = now(), last_error = ${"discover continue"}, payload = ${JSON.stringify({ ytjCursor: disc.cursor ?? null, discoverExhausted: false, ytjScannedAll: false })}::jsonb, updated_at = now()
        where user_id = ${userId} and run_id = ${runId} and type = ${"discover"}`;
		}
		started += 1;
	}
	return started;
}

async function runRefresh(sql, userId, companyId) {
	const co = await loadCompany(sql, userId, companyId);
	if (!co) return;
	const bid = co.business_id ?? null;
	if (bid && co.country === "FI") {
		const r = await ytjFetchById(bid);
		if (r.ok) {
			await insertObservations(sql, userId, "company", companyId, "ytj", r.sourceUrl, "official_register", r.observations);
			await sql`update companies set
        name = ${r.data.name},
        website = coalesce(${r.data.website ?? null}, website),
        website_domain = coalesce(${normalizeDomain(r.data.website ?? null)}, website_domain),
        municipality = coalesce(${r.data.municipality ?? null}, municipality),
        street = coalesce(${r.data.street ?? null}, street),
        last_verified_at = now(), updated_at = now()
        where id = ${companyId} and user_id = ${userId}`;
			await bumpSource(sql, userId, "ytj", "ok");
		} else await bumpSource(sql, userId, "ytj", "fail", { error: r.error });
	}
}
async function refreshStale(sql, userId, limit = 1) {
	const stale = await sql`
    select id from companies
    where user_id = ${userId} and deleted_at is null
      and (last_verified_at is null or last_verified_at < now() - interval '90 days')
    order by last_verified_at nulls first
    limit ${limit}`;
	for (const row of stale) await enqueueJob(sql, userId, "refresh", { companyId: row.id });
	return stale.length;
}
async function applyRetention(sql, userId) {
	return (await sql`
    update companies set deleted_at = now()
    where user_id = ${userId} and deleted_at is null and created_at < now() - (${(await sql`select retention_days from workspaces where user_id = ${userId} limit 1`)[0]?.retention_days ?? 730} * interval '1 day')
    returning id`).length;
}
async function collapseBranchDuplicates(sql, userId) {
	const rows = await sql`
    select id, name, business_id, website_domain, created_at
    from companies where user_id = ${userId} and deleted_at is null`;
	const groups = /* @__PURE__ */ new Map();
	for (const row of rows) {
		const core = coreCompanyName(row.name);
		if (!isDistinctiveCoreName(core)) continue;
		const list = groups.get(core) ?? [];
		list.push(row);
		groups.set(core, list);
	}
	for (const [, members] of groups) {
		if (members.length < 2) continue;
		const bids = new Set(members.map((m) => m.business_id).filter(Boolean));
		if (bids.size > 1) continue;
		const domains = new Set(members.map((m) => m.website_domain).filter(Boolean));
		if (bids.size === 0 && domains.size !== 1) continue;
		if (bids.size === 1 && members.some((m) => !m.business_id) && domains.size > 1) continue;
		const scored = [...members].sort((a, b) => {
			const score = (c) => (c.business_id ? 100 : 0) + (coreCompanyName(c.name) === normalizeName(c.name) ? 40 : 0) + (c.website_domain ? 10 : 0) - normalizeName(c.name).length;
			return score(b) - score(a);
		});
		const keep = scored[0];
		for (const drop of scored.slice(1)) await mergeCompanyRecords(sql, userId, keep.id, drop.id);
		const row = (await sql`
      select name, website, business_id from companies where id = ${keep.id} and user_id = ${userId}`)[0];
		if (row) {
			const display = row.business_id ? row.name : stripPlaceSuffixDisplay(row.name) || row.name;
			const site = canonicalCompanyWebsite(row.website);
			await sql`update companies set
        name = ${display},
        name_normalized = ${normalizeName(display)},
        website = ${site},
        website_domain = ${normalizeDomain(site)},
        updated_at = now()
        where id = ${keep.id} and user_id = ${userId}`;
			await refreshCompanyContactFields(sql, userId, keep.id);
		}
	}
}
async function backfillCompanyContacts(sql, userId) {
	await collapseBranchDuplicates(sql, userId);
	await sql`update people set deleted_at = now()
    where user_id = ${userId} and deleted_at is null
      and (
        full_name ~* '(olemme|mukaan|toimihenkil|yhteystied|yritysosto|henkilöstö|henkilosto)'
        or full_name !~ '^[A-ZÅÄÖ]'
        or char_length(full_name) > 48
      )`;
	await sql`delete from contacts
    where user_id = ${userId} and kind = 'email' and (
      split_part(value_normalized, '@', 2) in (
        'kollektor.fi', 'erin.posti.com', 'posti.com', 'fennoa.com', 'fennoa.fi',
        'maventa.com', 'maventa.fi', 'apix.fi', 'verkkolaskuosoite.fi', 'logium.fi',
        'laskumappi.fi', 'netbox.fi'
      )
      or split_part(value_normalized, '@', 2) like '%.posti.com'
      or split_part(value_normalized, '@', 2) like '%.kollektor.fi'
      or split_part(value_normalized, '@', 1) ~* '(invoice|lasku|laskutus|billing|einvoice|e-invoice|verkkolasku|^fennoa[._])'
    )`;
	const emails = await sql`
    select id, value from contacts where user_id = ${userId} and kind = 'email'`;
	for (const row of emails) {
		const cleaned = cleanExtractedEmail(row.value);
		if (!cleaned || cleaned.template || isJunkEmail(cleaned.value) || isBillingEmail(cleaned.value)) {
			await sql`delete from contacts where id = ${row.id} and user_id = ${userId}`;
			continue;
		}
		if (cleaned.value !== row.value.toLowerCase()) await sql`update contacts set value = ${cleaned.value}, value_normalized = ${cleaned.value} where id = ${row.id} and user_id = ${userId}`;
	}
	await sql`update people set work_email = null
    where user_id = ${userId} and work_email is not null and (
      work_email ~* '%|etunimi|sukunimi|firstname|lastname|toimipaik'
      or work_email ~* '@(kollektor\\.fi|erin\\.posti\\.com|fennoa\\.com|fennoa\\.fi|maventa\\.com|apix\\.fi)$'
      or work_email ~* '(invoice|lasku|fennoa\\.)'
    )`;
	const sites = await sql`
    select id, website from companies where user_id = ${userId} and deleted_at is null`;
	for (const c of sites) {
		const site = canonicalCompanyWebsite(c.website);
		if (site !== c.website) await sql`update companies set website = ${site}, website_domain = ${normalizeDomain(site)}, updated_at = now()
        where id = ${c.id} and user_id = ${userId}`;
		await refreshCompanyContactFields(sql, userId, c.id);
	}
}


export { refreshStale, applyRetention, backfillCompanyContacts };
