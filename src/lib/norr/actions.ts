// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import type { Json, JsonMap, SearchCriteria } from "./types.ts";
import { ROLE_ALIASES } from "./types.ts";
import { emptyCriteria, estimateScope } from "./criteria.ts";
import { INDUSTRIES, MUNICIPALITIES, LEGAL_FORMS } from "./finland.ts";
import { compileCriteria } from "./filter-dsl.ts";
import {
  SOURCE_CATALOG,
  coreCatalog,
  engineSnapshot,
  publicSourceView,
  displayState,
  initialState,
  productLabel,
} from "./sources/catalog.ts";
import { ytjFetchById, ytjHealth } from "./sources/ytj.ts";
import {
  brregSearch,
  cvrSearch,
  gleifLookup,
  hilmaSearch,
  nominatimGeocode,
  tedSearch,
  viesValidate,
  wikidataLookup,
  rdapDomain,
} from "./sources/open.ts";
import {
  hunterDomainSearch,
  openCorporatesSearch,
  companiesHouseSearch,
  configuredSearch,
} from "./sources/licensed.ts";
import { wikipediaCompany, domainCandidates, isDirectoryHost } from "./sources/webdiscover.ts";
import {
  audit,
  ensureWorkspace,
  enqueueJob,
  insertCompany,
  insertObservations,
  mergeCompanyRecords,
  updateRunStats,
  seedSourceHealth,
} from "./repo.ts";
import {
  processDueSchedules,
  processJobsFor,
  runDiscover,
  refreshStale,
  applyRetention,
  backfillCompanyContacts,
  resumeDiscoverIfStarved,
  kickSearchExecution,
} from "./pipeline.ts";
import {
  assertSearchQuota,
  refundSearchQuota,
  assertCompanyQuota,
  ensurePlatformIdentity,
  readPlatformIdentity,
  ensurePlatformSchema,
  stripeCheckoutReady,
  createStripeCheckout,
  createStripePortal,
  resolveCheckoutOrigin,
  normalizePlanId,
  isPlatformAdmin,
  inviteAdmin,
  revokeAdmin,
  generateBlogPost,
  upsertBlogPost,
  pullStripePlanForUser,
  ENGINE_SEARCH_CEILING,
} from "./platform.ts";
import { ensureWorker } from "./worker.ts";
import { compareEntities } from "./dedupe.ts";
import { isRecruitingEmail, isBillingEmail, isJunkEmail } from "./contacts.ts";
import { cleanPersonName } from "./extract.ts";
import { rowsToCsv, rowsToXlsx, rowsToCrmCsv } from "./exporters.ts";
import { interpretTargetPrompt, applyPresetToCriteria } from "./targeting/parser.ts";
import { OPPORTUNITY_PRESETS } from "./targeting/spec.ts";
import { normalizeBusinessId, normalizeDomain, isJunkCompanyWebsite } from "./normalize.ts";
import { scoped } from "./tenant.ts";
import { snapshotQueueDepth, drainStuckUserWork } from "./queue-monitor.ts";
import { isoTime } from "@/lib/format.ts";
import { buildSalesBrief } from "./sales-brief.ts";
import { classifyHiring, classifyHiringCategory, hiringFreshness } from "./hiring-signal.ts";
import { compileIcp } from "./icp-compiler.ts";
import { blockingIssue } from "./query-validation.ts";
import { explainMatch } from "./match-explain.ts";
import { websiteOpportunityFromIntel } from "./website-observations.ts";
import { offerFamilyFromText, pickRelevantPerson } from "./role-relevance.ts";
import { offerFromCriteria } from "./ranking-v2.ts";
import { exportSearchUnits } from "./quota-ledger.ts";
import { diagnoseCoverage, tallyRejection, type CoverageCounts } from "./coverage-diagnostics.ts";
import { startTrace, markStage, endStage } from "./observability.ts";
import { compileExecution, recommendCapacity, classifyStall } from "./fabric.ts";
import { resolveRoute } from "./route-registry.ts";
import { interactiveBudgetMs, vercelRuntimeInfo } from "./hybrid.ts";
import { cacheStats } from "./intel-cache.ts";
import { dispatchVercelExecution, executionPlane } from "./vercel-executor.ts";
import { createQueuedSearch } from "./search-intake.ts";
import { apifyConfigured } from "./sources/apify.ts";
import {
  decideLeadsFinder,
  leadsFinderSourceReport,
} from "./sources/leads-finder.ts";
import { buildProductionHealth } from "./production-health.ts";
import {
  roleFromIdentity,
  assertCapability,
  canDeepSearch,
  canBulkExport,
} from "./authz.ts";
import {
  sanitizeCompany,
  sanitizePerson,
  sanitizeContact,
  sanitizeSignal,
  sanitizeCrawlPage,
  sanitizeRunList,
  sanitizeAudit,
  sanitizeNote,
  sanitizeJob,
  sanitizeObservation,
  sanitizeScoreRow,
} from "./dto.ts";
import {
  listPageCap,
  listOffsetCap,
  exportWatermark,
  exportRowCap,
  exportDailyCap,
  queryCost,
  allowSort,
  clampInt,
  boundedString,
  boundedArray,
  sanitizeUserText,
  stripSecrets,
  sanitizeSourceReport,
  rateLimit,
  rateLimitMessage,
  noteExtraction,
  enumerationRisk,
  persistExtractionCounters,
  persistSecurityEvent,
  ensureSecuritySchema,
  bumpAbuse,
  assertNotAbusive,
  requireAdmin,
  mintApiToken,
  reenrichCap,
  runReenrichCap,
} from "./security.ts";
import { ssrfBlockCount } from "./ssrf.ts";
import { clientIp, requestOrigin } from "./request-meta.server.ts";
import {
  queryFingerprint,
  searchLabel,
  encodeRunCursor,
  decodeRunCursor,
  uniqueIds,
  compareRunSets,
  RANKING_VERSION,
} from "./fingerprint.ts";
import { limitedNewWarning, emptyNewLeadsMessage, skipPreviouslyShown, showEmptyNewBanner } from "./novelty.ts";
import { runProgress, displayRunStatus } from "./progress.ts";
import { faceRegisterDiagnosis } from "./face-diagnosis.ts";
import { parseLeadPrefs, parseListRules } from "./prefs.ts";
import { listPlatformUsers, createPlatformUser, giftWorkspacePlan, grantAdminByUserId } from "./admin-users.ts";
import {
  ensureSearchHardeningSchema,
  freezeRunRanking,
  recordDelivered,
  recordExported,
  recordOpened,
  writeSearchHealth,
} from "./exposure.ts";


function publicWebsite(raw) {
  if (!raw) return null;
  if (isDirectoryHost(String(raw)) || isJunkCompanyWebsite(String(raw))) return null;
  return raw;
}

async function clientMeta() {
  try {
    return { ip: clientIp(), origin: requestOrigin() };
  } catch {
    return { ip: null, origin: null };
  }
}

async function ctxSql(context) {
  const s = await scoped(context);
  context.actorId = s.actor;
  context.userId = s.uid;
  return s.sql;
}

async function gate(sql, userId, op, opts) {
  await ensureSecuritySchema(sql);
  const identity = await ensurePlatformIdentity(sql, userId);
  const role = roleFromIdentity({
    isAdmin: identity.isAdmin,
    plan: identity.plan,
  });
  const blocked = await assertNotAbusive(sql, userId, identity.isAdmin);
  const meta = await clientMeta();
  if (!blocked.ok) return { ok: false, error: blocked.error, identity, role, ip: meta.ip };
  if (opts?.capability) {
    const cap = assertCapability(role, opts.capability);
    if (!cap.ok) return { ok: false, error: cap.error, identity, role, ip: meta.ip };
  }
  if (identity.isAdmin) return { ok: true, identity, role, ip: meta.ip };
  const rl = rateLimit(`u:${userId}:${op}`, opts?.max ?? 60, opts?.windowMs ?? 6e4);
  if (!rl.ok) {
    await persistSecurityEvent(sql, { userId, action: `rate.${op}`, risk: "suspicious", ip: meta.ip, detail: { op } });
    await bumpAbuse(sql, userId, 4, "suspicious", { ip: meta.ip });
    return { ok: false, error: rateLimitMessage(rl.retryAfterMs), identity, role, ip: meta.ip };
  }
  if (meta.ip) {
    const ipRl = rateLimit(`ip:${meta.ip}:${op}`, (opts?.max ?? 60) * 4, opts?.windowMs ?? 6e4);
    if (!ipRl.ok) {
      await persistSecurityEvent(sql, { userId, action: `rate.ip.${op}`, risk: "high", ip: meta.ip, detail: { op } });
      return { ok: false, error: rateLimitMessage(ipRl.retryAfterMs), identity, role, ip: meta.ip };
    }
  }
  return { ok: true, identity, role, ip: meta.ip };
}

export const getBootstrap = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const fallback = {
    workspace: {
      id: "",
      onboarded_at: null,
      name: "Workspace",
      lawful_basis: null,
      purpose: null,
      retention_days: 730,
      country_allowlist: "FI"
    },
    counts: {
      companies: 0,
      people: 0,
      runs: 0,
      openReview: 0,
      jobsRunning: 0,
      contacts: 0,
      sourcesConnected: 0,
      sourcesTotal: coreCatalog().length
    },
    recentRuns: [],
    recentCompanies: [],
    isAdmin: false,
    plan: "free",
    searchesUsed: 0,
    searchesLimit: 50,
    seedOpen: true,
    hasStripeCustomer: false,
    stripeReady: false
  };
  try {
    const sql = await getSql();
    const ws = await ensureWorkspace(sql, context.userId);
    const identity = await readPlatformIdentity(sql, context.userId);
    const [companies, people, runs, openReview, jobsRunning, contacts, sources, recentRuns, recentCompanies] = await Promise.all([
      sql`select count(*)::int as n from companies where user_id = ${context.userId} and deleted_at is null`.then((r) => r[0]),
      sql`select count(*)::int as n from people where user_id = ${context.userId} and deleted_at is null`.then((r) => r[0]),
      sql`select count(*)::int as n from search_runs where user_id = ${context.userId}`.then((r) => r[0]),
      sql`select count(*)::int as n from review_items where user_id = ${context.userId} and status = 'open'`.then((r) => r[0]).catch(() => ({ n: 0 })),
      sql`select count(*)::int as n from jobs j
        join search_runs r on r.id = j.run_id
        where j.user_id = ${context.userId} and j.status = ${"running"}
          and r.status in ('running','queued')`.then((r) => r[0]).catch(() => ({ n: 0 })),
      sql`select count(*)::int as n from contacts where user_id = ${context.userId}`.then((r) => r[0]).catch(() => ({ n: 0 })),
      sql`select source_id, state, enabled from source_health where user_id = ${context.userId}`.catch(() => []),
      sql`select id, status, created_at, stats from search_runs where user_id = ${context.userId} order by created_at desc limit 8`.catch(() => []),
      sql`select id, name, municipality, industry_label, overall_confidence, record_status, website
    from companies where user_id = ${context.userId} and deleted_at is null order by updated_at desc limit 8`.catch(() => []),
    ]);
    let hasStripeCustomer = false;
    try {
      const cust = await sql`select stripe_customer_id from workspaces where user_id = ${context.userId} limit 1`;
      hasStripeCustomer = Boolean(cust[0]?.stripe_customer_id);
    } catch {
      hasStripeCustomer = false;
    }
    const payload = {
      workspace: ws,
      counts: {
        companies: companies?.n ?? 0,
        people: people?.n ?? 0,
        runs: runs?.n ?? 0,
        openReview: openReview?.n ?? 0,
        jobsRunning: jobsRunning?.n ?? 0,
        contacts: contacts?.n ?? 0,
        sourcesConnected: sources.filter((s) => s.state === "connected" && s.enabled && coreCatalog().some((c) => c.id === s.source_id)).length,
        sourcesTotal: coreCatalog().length
      },
      recentRuns,
      recentCompanies,
      isAdmin: identity.isAdmin,
      plan: identity.plan,
      searchesUsed: identity.searchesUsed,
      searchesLimit: identity.searchesLimit,
      seedOpen: identity.seedOpen,
      hasStripeCustomer,
      stripeReady: stripeCheckoutReady()
    };
    return payload;
  } catch (err) {
    console.error("[norf] bootstrap", err);
    return fallback;
  }
});

export const saveOnboarding = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  await sql`update workspaces set name = ${sanitizeUserText(data.name, 80)}, lawful_basis = ${sanitizeUserText(data.lawfulBasis, 80)}, purpose = ${sanitizeUserText(data.purpose, 500)},
  retention_days = ${clampInt(data.retentionDays, 30, 3650, 730)}, onboarded_at = now(), updated_at = now() where user_id = ${context.userId}`;
  await audit(sql, context.userId, "workspace.onboard", "workspace", undefined, { lawfulBasis: sanitizeUserText(data.lawfulBasis, 80) });
  return { ok: true };
});

export const getReference = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async () => ({
  industries: INDUSTRIES,
  municipalities: MUNICIPALITIES,
  legalForms: LEGAL_FORMS,
  roles: Object.keys(ROLE_ALIASES),
  emptyCriteria: emptyCriteria()
}));

export const previewScope = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const compiled = compileCriteria(data.criteria);
  if (!compiled.ok) return {
    ok: false,
    error: compiled.error
  };
  const g = await gate(await ctxSql(context), context.userId, "preview", {
    max: 60,
    windowMs: 6e4
  });
  if (!g.ok) return {
    ok: false,
    error: g.error
  };
  return {
    ok: true,
    ...estimateScope(compiled.criteria)
  };
});

export const startSearch = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  try {
    return await createQueuedSearch({
      userId: context.userId,
      criteria: data.criteria,
      name: data.name,
      profileId: data.profileId,
    });
  } catch (err) {
    console.error("[norf] startSearch", err);
    return { ok: false, error: "Search could not start. Try again.", runId: "", discovered: 0 };
  }
});

export const interpretPrompt = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const prompt = boundedString(data.prompt, 2e3);
  const g = await gate(await ctxSql(context), context.userId, "interpret", {
    max: 40,
    windowMs: 36e5
  });
  if (!g.ok) return {
    ok: false,
    error: g.error,
    summary: [],
    spec: {},
    criteria: emptyCriteria(),
    preset: null,
    diagnostics: { parsed: [], supported: [], unsupported: [], unknown: [] }
  };
  const base = emptyCriteria();
  if (data.country) base.country = boundedString(data.country, 8);
  const interpreted = interpretTargetPrompt(prompt, base);
  const compiled = compileCriteria(interpreted.criteria);
  const icp = compileIcp(prompt, interpreted.criteria);
  return {
    ok: compiled.ok,
    error: compiled.ok ? undefined : compiled.error,
    summary: interpreted.summary,
    spec: interpreted.spec,
    criteria: interpreted.criteria,
    preset: interpreted.preset ?? null,
    diagnostics: interpreted.diagnostics,
    icp: {
      offerFamily: icp.offerFamily,
      criteriaList: icp.criteriaList,
      unsupported: icp.unsupported,
      issues: icp.issues,
      sourcePlan: { reasons: icp.sourcePlan.reasons, unsupported: icp.sourcePlan.unsupported },
    },
  };
});

export const applyOpportunityPreset = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const g = await gate(await ctxSql(context), context.userId, "interpret", {
    max: 60,
    windowMs: 6e4
  });
  if (!g.ok) return {
    ok: false,
    error: g.error,
    criteria: emptyCriteria(),
    label: "",
    blurb: "",
    spec: undefined
  };
  let c = emptyCriteria();
  if (data.country) c.country = boundedString(data.country, 8);
  c = applyPresetToCriteria(c, data.preset);
  if (data.municipality) c.groups.rules.push({
    id: nid(),
    field: "municipality",
    op: "eq",
    value: sanitizeUserText(data.municipality, 80)
  });
  const compiled = compileCriteria(c);
  if (!compiled.ok) return {
    ok: false,
    error: compiled.error,
    criteria: emptyCriteria(),
    label: "",
    blurb: "",
    spec: undefined
  };
  const def = OPPORTUNITY_PRESETS[data.preset];
  return {
    ok: true,
    criteria: compiled.criteria,
    label: def.label,
    blurb: def.blurb,
    spec: compiled.criteria.target
  };
});

export const tickSearch = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "tick", {
    max: 90,
    windowMs: 6e4
  });
  if (!g.ok) return {
    processed: 0,
    error: g.error
  };
  try { await drainStuckUserWork(sql, context.userId); } catch { /* keep */ }
  const processed = await processJobsFor(sql, context.userId, data.runId, {
    maxMs: data.runId ? 8e3 : 10e3,
    concurrency: data.runId ? 4 : 6,
  });
  if (data.runId) {
    try { await resumeDiscoverIfStarved(sql, context.userId, data.runId); } catch { /* optional */ }
  }
  if (!data.runId) {
    await processDueSchedules(sql, context.userId);
    await refreshStale(sql, context.userId, 1);
    await applyRetention(sql, context.userId);
  }
  return { processed };
});

export const controlRun = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const action = String(data.action ?? "");
  const runId = boundedString(data.runId, 64);
  if (!runId || !["pause", "resume", "cancel"].includes(action)) return { ok: false, error: "Invalid control" };
  const owned = await sql`select id, status from search_runs where id = ${runId} and user_id = ${context.userId} limit 1`;
  if (!owned[0]) return { ok: false, error: "Search not found" };
  if (action === "pause") {
    await sql`update search_runs set pause_requested = true, status = ${"paused"} where id = ${runId} and user_id = ${context.userId} and status <> ${"cancelled"}`;
    await sql`update jobs set status = ${"queued"}, locked_at = null, run_after = now(), updated_at = now()
      where run_id = ${runId} and user_id = ${context.userId} and status = ${"running"}`;
  } else if (action === "resume") {
    await sql`update search_runs set pause_requested = false, cancel_requested = false, status = ${"running"}, finished_at = null
      where id = ${runId} and user_id = ${context.userId} and status <> ${"cancelled"}`;
    dispatchVercelExecution({ userId: context.userId, runId, reason: "search.resume" });
  } else {
    await sql`update search_runs set cancel_requested = true, pause_requested = false, status = ${"cancelled"}, finished_at = now()
      where id = ${runId} and user_id = ${context.userId}`;
    await sql`update jobs set status = ${"cancelled"}, locked_at = null, updated_at = now()
      where run_id = ${runId} and user_id = ${context.userId} and status in ('queued','running')`;
  }
  await audit(sql, context.userId, `search.${action}`, "search_run", runId);
  return { ok: true, status: action === "pause" ? "paused" : action === "resume" ? "running" : "cancelled" };
});

export const getRun = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const runHead = (await sql`select status from search_runs where id = ${data.runId} and user_id = ${context.userId}`)?.[0];
  if (!runHead) return { ok: false, error: "Not found" };
  const run = (await sql`select id, status, criteria, stats, source_report, error, created_at, started_at, finished_at, pause_requested, cancel_requested,
      query_fingerprint, ranking_version, name, new_leads_count, previously_seen_count, excluded_count, search_exhaustion_score
    from search_runs where id = ${data.runId} and user_id = ${context.userId}`)?.[0];
  if (!run) return { ok: false, error: "Not found" };
  let jobs = await sql`
    select id, type, status, last_error, company_id, updated_at from jobs where user_id = ${context.userId} and run_id = ${data.runId} order by created_at asc`;
  const limit = clampInt(data.limit, 1, listPageCap(), 100);
  const cursor = decodeRunCursor(data.cursor);
  const companies = await sql`select c.id, c.name, c.business_id, c.municipality, c.industry_code, c.industry_label, c.website, c.overall_confidence,
      c.record_status, c.general_email, c.general_email_class, c.phone, rc.is_new,
      c.website_score, c.seo_score, c.digital_maturity, c.commercial_opportunity, c.match_score, c.company_age_years, c.intel,
      c.intel #>> '{website,adPlatforms,meta}' as meta_ads,
      coalesce(rc.seen_before, false) as seen_before,
      coalesce(rc.times_seen_before, 0) as times_seen_before,
      rc.last_shown_at, rc.rank_position, rc.novelty_score,
      (select p.full_name from people p where p.user_id = c.user_id and p.company_id = c.id and p.deleted_at is null
        and p.full_name ~ '^[A-ZÅÄÖ]'
        and p.full_name !~* '(olemme|mukaan|toimihenkil|yhteystied|yritysosto|henkilöstö|henkilosto|suomen )'
        and char_length(p.full_name) between 5 and 48
        order by case
          when coalesce(p.title,'') ~* 'toimitusjohtaja|managing director|verkställande|\\yceo\\y' then 0
          when coalesce(p.seniority,'') = 'executive' then 1
          when coalesce(p.title,'') ~* 'puheenjohtaja|chair' then 2
          else 3 end, p.confidence desc nulls last limit 1) as decision_maker,
      (select p.title from people p where p.user_id = c.user_id and p.company_id = c.id and p.deleted_at is null
        and p.full_name ~ '^[A-ZÅÄÖ]'
        and p.full_name !~* '(olemme|mukaan|toimihenkil|yhteystied|yritysosto|henkilöstö|henkilosto|suomen )'
        and char_length(p.full_name) between 5 and 48
        order by case
          when coalesce(p.title,'') ~* 'toimitusjohtaja|managing director|verkställande|\\yceo\\y' then 0
          when coalesce(p.seniority,'') = 'executive' then 1
          when coalesce(p.title,'') ~* 'puheenjohtaja|chair' then 2
          else 3 end, p.confidence desc nulls last limit 1) as decision_title
    from run_companies rc join companies c on c.id = rc.company_id
    where rc.user_id = ${context.userId} and rc.run_id = ${data.runId} and c.deleted_at is null
      and c.record_status is distinct from 'rejected'
      and (
        ${cursor == null} or
        coalesce(rc.rank_position, 999999) > ${cursor?.r ?? 0} or
        (coalesce(rc.rank_position, 999999) = ${cursor?.r ?? 0} and c.id > ${cursor?.i ?? ""})
      )
    order by coalesce(rc.rank_position, 999999) asc, c.id asc
    limit ${limit}`;
  const uniqueCompanies = uniqueIds(companies.map((c) => c.id)).map((id) => {
    const row = companies.find((c) => c.id === id);
    return { ...row, website: publicWebsite(row?.website) };
  });
  try {
    await recordDelivered(
      sql,
      context.userId,
      data.runId,
      uniqueCompanies.map((c) => ({ companyId: c.id, businessId: c.business_id })),
    );
  } catch {
    /* exposure table may still be migrating */
  }
  await updateRunStats(sql, context.userId, data.runId);
  const excluded = Number(run.excluded_count ?? 0);
  const requested = Math.min(Math.max(Number(run.criteria?.maxResults ?? uniqueCompanies.length) || 1, 1), ENGINE_SEARCH_CEILING);
  const warn = limitedNewWarning({
    requested,
    returned: uniqueCompanies.length,
    seenCount: uniqueCompanies.filter((c) => c.seen_before).length,
    newCount: uniqueCompanies.filter((c) => !c.seen_before).length,
  });
  const last = uniqueCompanies[uniqueCompanies.length - 1];
  const nextCursor = uniqueCompanies.length === limit && last
    ? encodeRunCursor(last.rank_position ?? 0, last.id)
    : null;
  const [runCount] = await sql`select count(*)::int as n from run_companies rc
    join companies c on c.id = rc.company_id
    where rc.user_id = ${context.userId} and rc.run_id = ${data.runId} and c.deleted_at is null
      and c.record_status is distinct from 'rejected'`;
  const [missingRow] = await sql`select count(*)::int as n from run_companies rc
    join companies c on c.id = rc.company_id
    where rc.user_id = ${context.userId} and rc.run_id = ${data.runId} and c.deleted_at is null
      and c.record_status is distinct from 'rejected'
      and c.general_email is null`;
  const companyCount = Number(runCount?.n ?? uniqueCompanies.length);
  const missingEmail = Number(missingRow?.n ?? uniqueCompanies.filter((c) => !c.general_email).length);
  const skipSeen = skipPreviouslyShown(run.criteria ?? {});
  const jobsLive = (jobs as Array<{ status?: string }>).some((j) => j.status === "running" || j.status === "queued");
  const viewStatus = displayRunStatus(String(run.status ?? ""), jobsLive);
  const emptyNew = showEmptyNewBanner({ excludeSeen: skipSeen, companyCount, status: viewStatus });
  let previousRunId = null;
  if (run.query_fingerprint) {
    try {
      const prev = await sql`select id from search_runs
        where user_id = ${context.userId} and query_fingerprint = ${run.query_fingerprint} and id <> ${data.runId}
        order by created_at desc limit 1`;
      previousRunId = prev[0]?.id ?? null;
    } catch {
      previousRunId = null;
    }
  }
  const report = sanitizeSourceReport(run.source_report);
  const diagnosis = faceRegisterDiagnosis(report, { companyCount, status: viewStatus });
  const progress = runProgress(jobs, viewStatus);
  const matched = Number(run.new_leads_count ?? 0) + Number(run.previously_seen_count ?? 0) || companyCount;
  let coverage = null;
  try {
    const rejected = await sql<{ reject_reason: string | null }>`
      select c.reject_reason from run_companies rc
      join companies c on c.id = rc.company_id
      where rc.user_id = ${context.userId} and rc.run_id = ${data.runId}
        and c.record_status = ${"rejected"}`;
    const counts: CoverageCounts = {
      candidates: companyCount + rejected.length,
      returned: companyCount,
      rejectedRevenueUnknown: 0,
      rejectedRevenueRange: 0,
      rejectedIndustry: 0,
      rejectedHiring: 0,
      rejectedOther: 0,
      sourceFailed: Array.isArray(report) && report.some((r: { ok?: boolean }) => r.ok === false),
      unsupported: Array.isArray(run.criteria?.target?.unsupported) ? run.criteria.target.unsupported : [],
    };
    for (const row of rejected) counts[tallyRejection(row.reject_reason)] += 1;
    coverage = diagnoseCoverage(counts);
    try {
      await sql`update search_runs set coverage = ${JSON.stringify({ ...counts, diagnosis: coverage })}::jsonb where id = ${data.runId} and user_id = ${context.userId}`;
    } catch { /* optional column */ }
  } catch {
    coverage = null;
  }
  return {
    ok: true,
    previousRunId,
    progress,
    run: {
      ...run,
      status: viewStatus,
      error: stripSecrets(run.error),
      source_report: report,
    },
    jobs,
    companies: uniqueCompanies,
    nextCursor,
    summary: {
      matched,
      newToYou: Number(run.new_leads_count ?? uniqueCompanies.filter((c) => !c.seen_before).length),
      seenBefore: Number(run.previously_seen_count ?? uniqueCompanies.filter((c) => c.seen_before).length),
      excluded,
      exhaustion: run.search_exhaustion_score ?? 0,
      rankingVersion: run.ranking_version ?? RANKING_VERSION,
      limitedNew: warn.show,
      limitedNewMessage: warn.message,
      emptyNew,
      emptyNewMessage: emptyNew ? emptyNewLeadsMessage(true) : "",
      missingEmail,
      diagnosis,
      coverage,
    },
  };
});


export const listCompanies = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d ?? {}).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "company_list", {
    max: 90,
    windowMs: 6e4
  });
  if (!g.ok) return {
    companies: [],
    queuedContactJobs: 0,
    error: g.error
  };
  const q = boundedString(data.q?.trim() ?? "", 80);
  const sortBy = allowSort(data.sortBy);
  const limit = clampInt(data.limit, 1, listPageCap(), listPageCap());
  const offset = clampInt(data.offset, 0, listOffsetCap(), 0);
  const rows = await sql`
  select c.id, c.name, c.business_id, c.municipality, c.industry_label, c.website, c.overall_confidence, c.record_status,
  c.general_email, c.general_email_class, c.phone, c.last_verified_at, c.country,
  c.website_score, c.seo_score, c.digital_maturity, c.commercial_opportunity, c.match_score, c.company_age_years, c.revenue,
  c.intel #>> '{website,adPlatforms,meta}' as meta_ads,
  dm.full_name as decision_maker, dm.title as decision_title
  from companies c
  left join lateral (
  select p.full_name, p.title
  from people p
  where p.user_id = c.user_id and p.company_id = c.id and p.deleted_at is null
  and p.full_name ~ '^[A-ZÅÄÖ]'
  and p.full_name !~* '(olemme|mukaan|toimihenkil|yhteystied|yritysosto|henkilöstö|henkilosto|suomen )'
  and char_length(p.full_name) between 5 and 48
  order by case
  when coalesce(p.title,'') ~* 'toimitusjohtaja|managing director|verkställande|\\yceo\\y' then 0
  when coalesce(p.seniority,'') = 'executive' then 1
  when coalesce(p.title,'') ~* 'puheenjohtaja|chair' then 2
  else 3 end, p.confidence desc nulls last
  limit 1
  ) dm on true
  where c.user_id = ${context.userId} and c.deleted_at is null
  and (${q} = '' or c.name ilike ${"%" + q + "%"} or coalesce(c.business_id,'') ilike ${"%" + q + "%"} or coalesce(c.municipality,'') ilike ${"%" + q + "%"})
  and (${data.status ?? ""} = '' or c.record_status = ${data.status ?? ""})
  and (${data.minScore ?? 0} = 0 or c.overall_confidence >= ${data.minScore ?? 0})
  and (${data.hasEmail ? 1 : 0} = 0 or c.general_email is not null)
  and (${data.publishedOnly ? 1 : 0} = 0 or c.general_email_class = 'published')
  and (${data.inferredOnly ? 1 : 0} = 0 or c.general_email_class = 'inferred')
  and (${data.listId ?? ""} = '' or c.id in (select company_id from list_members where user_id = ${context.userId} and list_id = ${data.listId ?? ""}))
  and (${data.tag ?? ""} = '' or c.id in (
  select ct.company_id from company_tags ct join tags t on t.id = ct.tag_id
  where ct.user_id = ${context.userId} and t.name = ${data.tag ?? ""}
  ))
  order by
  case ${sortBy}
  when 'commercial' then c.commercial_opportunity
  when 'website' then c.website_score
  when 'seo' then c.seo_score
  when 'digital' then c.digital_maturity
  when 'ads' then c.commercial_opportunity
  when 'age' then c.company_age_years
  when 'opportunity' then c.commercial_opportunity
  else coalesce(c.match_score, c.overall_confidence)
  end desc nulls last,
  c.updated_at desc, c.id
  limit ${limit} offset ${offset}`;
  const jobs = await sql`select count(*)::int as n from jobs where user_id = ${context.userId} and status in ('queued','running')`;
  const ext = noteExtraction(context.userId, "list", rows.map((r) => r.id));
  await persistExtractionCounters(sql, context.userId, {
    uniqueCompanies: ext.uniqueCompanies,
    ip: g.ip
  });
  if (ext.risk === "high" || ext.risk === "blocked") {
    await persistSecurityEvent(sql, {
      userId: context.userId,
      action: "extract.list",
      risk: ext.risk,
      ip: g.ip,
      detail: {
        unique: ext.uniqueCompanies,
        score: ext.score
      }
    });
    await bumpAbuse(sql, context.userId, ext.risk === "blocked" ? 20 : 8, ext.risk, {
      reason: "mass_list",
      ip: g.ip
    });
  }
  if (ext.risk === "blocked" && !g.identity.isAdmin) return {
    companies: [],
    queuedContactJobs: jobs[0]?.n ?? 0,
    error: "Workspace is temporarily restricted. Contact support."
  };
  return {
    companies: rows,
    queuedContactJobs: jobs[0]?.n ?? 0
  };
});

export const findWorkspace = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d ?? {}).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const q = boundedString(data?.q?.trim?.() ?? "", 80);
  if (q.length < 2) return { companies: [], people: [], runs: [] };
  const like = `%${q}%`;
  const companies = await sql`select id, name, business_id, municipality from companies
    where user_id = ${context.userId} and deleted_at is null
      and (name ilike ${like} or coalesce(business_id,'') ilike ${like})
    order by updated_at desc limit 8`;
  const people = await sql`select id, full_name, title, company_id from people
    where user_id = ${context.userId} and deleted_at is null and full_name ilike ${like}
    order by updated_at desc limit 6`;
  const runs = await sql`select id, name, status, created_at from search_runs
    where user_id = ${context.userId} and (coalesce(name,'') ilike ${like} or id ilike ${like})
    order by created_at desc limit 6`;
  return {
    companies: companies.map((c) => ({ id: c.id, name: c.name, business_id: c.business_id, municipality: c.municipality })),
    people: people.map((p) => ({ id: p.id, name: p.full_name, title: p.title, company_id: p.company_id })),
    runs: runs.map((r) => ({ id: r.id, name: r.name, status: r.status, created_at: isoTime(r.created_at) })),
  };
});

export const reEnrichCompanies = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  try {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "reenrich", {
    max: 80,
    windowMs: 36e5,
    capability: "company.reenrich"
  });
  if (!g.ok) return { ok: false, error: g.error, queued: 0, runId: null };
  const existingRunId = data.runId ? boundedString(data.runId, 64) : "";
  const fillingPaidRun = Boolean(existingRunId && data.missingOnly !== false);
  if (!fillingPaidRun) {
    const quota = await assertSearchQuota(sql, context.userId, queryCost("reenrich"));
    if (!quota.ok) return { ok: false, error: quota.error, queued: 0, runId: null };
  }
  const ids = boundedArray((data.ids ?? []).filter(Boolean).map((id) => boundedString(id, 64)), reenrichCap());
  let rows;
  let targetRunId = null;
  if (existingRunId) {
    const owned = await sql`select id from search_runs where id = ${existingRunId} and user_id = ${context.userId} limit 1`;
    if (!owned[0]) return { ok: false, error: "Search not found", queued: 0, runId: null };
    const cap = runReenrichCap();
    rows = await sql`
      select c.id, c.website
      from run_companies rc
      join companies c on c.id = rc.company_id
      where rc.user_id = ${context.userId} and rc.run_id = ${existingRunId}
        and c.user_id = ${context.userId} and c.deleted_at is null
        and (${data.missingOnly === false ? 1 : 0} = 1
          or c.general_email is null)
      order by rc.rank_position nulls last, c.updated_at desc
      limit ${cap}`;
    targetRunId = existingRunId;
  } else if (ids.length) {
    rows = [];
    for (const id of ids) {
      const hit = await sql`select id, website from companies where user_id = ${context.userId} and deleted_at is null and id = ${id} limit 1`;
      if (hit[0]) rows.push(hit[0]);
    }
  } else rows = await sql`
      select id, website from companies
      where user_id = ${context.userId} and deleted_at is null
        and (${data.missingOnly === false ? 1 : 0} = 1
          or website is null or general_email is null)
      order by updated_at desc
      limit ${reenrichCap()}`;
  if (!rows.length) return { ok: true, queued: 0, runId: targetRunId };
  let runId = targetRunId;
  if (!runId) {
    runId = nid();
    const criteria = emptyCriteria();
    criteria.maxResults = rows.length;
    criteria.roles = ["ceo", "chair", "sales_director", "cfo", "owner"];
    await sql`insert into search_runs (id, user_id, status, criteria)
      values (${runId}, ${context.userId}, ${"running"}, ${JSON.stringify(criteria)}::jsonb)`;
  }
  await sql`update search_runs set status = ${"running"}, finished_at = null, pause_requested = false where id = ${runId} and user_id = ${context.userId} and status <> ${"cancelled"}`;
  for (const row of rows) {
    if (row.website && (isDirectoryHost(row.website) || isJunkCompanyWebsite(row.website))) {
      await sql`update companies set website = null, website_domain = null, updated_at = now()
        where id = ${row.id} and user_id = ${context.userId}`;
    }
    if (!targetRunId) {
      await sql`insert into run_companies (user_id, run_id, company_id, match_reasons, is_new)
        values (${context.userId}, ${runId}, ${row.id}, ${JSON.stringify(["re-enrich"])}::jsonb, ${false})
        on conflict do nothing`;
    }
    await enqueueJob(sql, context.userId, "email", { runId, companyId: row.id });
  }
  dispatchVercelExecution({ userId: context.userId, runId, reason: "email.recovery" });
  try {
    await processJobsFor(sql, context.userId, runId, { maxMs: interactiveBudgetMs("enrich"), concurrency: 16, skipDiscover: true });
  } catch (err) {
    console.warn("[norf] reenrich tick", err);
  }
  await updateRunStats(sql, context.userId, runId);
  await audit(sql, context.userId, "search.reenrich", "search_run", runId, { queued: rows.length, existingRun: Boolean(targetRunId) });
  return { ok: true, queued: rows.length, runId };
  } catch (err) {
    console.error("[norf] reenrich", err);
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 180) : "Re-enrich failed", queued: 0, runId: null };
  }
});


export const getCompany = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "company_view", {
    max: 120,
    windowMs: 6e4
  });
  if (!g.ok) return {
    ok: false,
    error: g.error
  };
  const company = (await sql`
  select id, name, business_id, vat_id, lei, legal_form, registration_date, business_status,
  industry_code, industry_label, street, postal_code, municipality, website, general_email,
  general_email_class, phone, employee_count, revenue, profit, previous_revenue, equity, assets, liabilities, equity_ratio, financial_period, financial_source, financial_conflict, description, record_status,
  country, match_score, overall_confidence, website_score, seo_score, digital_maturity,
  commercial_opportunity, company_age_years, last_verified_at, intel
  from companies where id = ${boundedString(data.id, 64)} and user_id = ${context.userId} and deleted_at is null`)?.[0];
  if (!company) return {
    ok: false,
    error: "Not found"
  };
  try { await recordOpened(sql, context.userId, String(company.id)); } catch { /* exposure optional */ }
  try {
    await recordOpened(sql, context.userId, String(company.id));
  } catch {}
  const ext = noteExtraction(context.userId, "company", [String(company.id)]);
  await persistExtractionCounters(sql, context.userId, {
    uniqueCompanies: ext.uniqueCompanies,
    ip: g.ip
  });
  if (ext.risk === "blocked" && !g.identity.isAdmin) {
    await persistSecurityEvent(sql, {
      userId: context.userId,
      action: "extract.company",
      risk: "blocked",
      ip: g.ip
    });
    return {
      ok: false,
      error: "Workspace is temporarily restricted. Contact support."
    };
  }
  const observations = await sql`
  select id, field, normalised_value, confidence, verification_status, source_id, source_url, evidence, retrieved_at
  from observations where user_id = ${context.userId} and entity_type = 'company' and entity_id = ${data.id} order by retrieved_at desc limit 80`;
  const peopleRaw = await sql`
  select id, full_name, title, seniority, company_id, work_email, work_email_class, work_phone, confidence, source_page
  from people where user_id = ${context.userId} and company_id = ${data.id} and deleted_at is null order by confidence desc nulls last`;
  const contactsRaw = await sql`
  select id, kind, value, classification, company_id, person_id from contacts where user_id = ${context.userId} and company_id = ${data.id} order by classification, kind`;
  const people = peopleRaw.filter((p) => cleanPersonName(String(p.full_name ?? ""))).map((p) => sanitizePerson(p));
  const contacts = contactsRaw.filter((ct) => {
    if (String(ct.kind) !== "email") return true;
    const v = String(ct.value ?? "");
    return v && !isJunkEmail(v) && !isBillingEmail(v) && !isRecruitingEmail(v);
  }).map((ct) => sanitizeContact(ct));
  const signals = (await sql`
  select id, kind, title, evidence, observed_at, source_id, source_url from signals where user_id = ${context.userId} and company_id = ${data.id} order by observed_at desc limit 40`).map((s) => sanitizeSignal(s));
  const pages = (await sql`
  select id, url, final_url, status_code, language, excerpt, error, robots_allowed, fetched_at
  from crawl_pages where user_id = ${context.userId} and company_id = ${data.id} order by fetched_at desc limit 20`).map((p) => sanitizeCrawlPage(p));
  const scores = (await sql`
  select id, score, explanation, created_at from company_scores where user_id = ${context.userId} and company_id = ${data.id} order by created_at desc limit 5`).map((s) => sanitizeScoreRow(s));
  const notes = (await sql`
  select id, body, created_at, entity_id, entity_type from notes where user_id = ${context.userId} and entity_id = ${data.id} order by created_at desc limit 40`).map((n) => sanitizeNote(n));
  const tags = await sql`
  select t.id, t.name from tags t join company_tags ct on ct.tag_id = t.id
  where ct.user_id = ${context.userId} and ct.company_id = ${data.id}`;
  const hiringConfirmed = signals.filter((s) => String(s.kind) === "hiring_confirmed");
  const hiringLevel = classifyHiring({
    confirmedListings: hiringConfirmed.length,
    indicatedOnSite: signals.some((s) => String(s.kind) === "hiring_indicated" || String(s.kind) === "hiring"),
    newestConfirmedAt: hiringConfirmed[0]?.observed_at ? String(hiringConfirmed[0].observed_at) : null,
  });
  const intel = company.intel && typeof company.intel === "object" ? company.intel : null;
  let offer = offerFamilyFromText(String((intel as { personalized?: { offer?: string } } | null)?.personalized?.offer ?? ""));
  try {
    const run = await sql<{ criteria: { prompt?: string } | null }>`
      select sr.criteria from search_runs sr
      join run_companies rc on rc.run_id = sr.id and rc.user_id = sr.user_id
      where rc.company_id = ${data.id} and sr.user_id = ${context.userId}
      order by sr.created_at desc limit 1`;
    if (run[0]?.criteria) offer = offerFromCriteria(run[0].criteria);
  } catch {
    /* offer stays from stored intel */
  }
  const relevant = pickRelevantPerson(
    people.map((p) => ({ fullName: String(p.full_name ?? ""), title: p.title ? String(p.title) : null })),
    offer,
  );
  const brief = buildSalesBrief({
    name: String(company.name),
    industryLabel: company.industry_label,
    municipality: company.municipality,
    email: company.general_email,
    phone: company.phone,
    decisionMaker: relevant?.fullName ?? people[0]?.full_name ?? null,
    decisionMakerTitle: relevant?.title ?? people[0]?.title ?? null,
    people,
    intel,
    hiringLevel,
    hiringCategory: hiringConfirmed[0] ? classifyHiringCategory(String(hiringConfirmed[0].title ?? "")) : undefined,
    hiringFreshness: hiringConfirmed[0]?.observed_at ? hiringFreshness(String(hiringConfirmed[0].observed_at)) : undefined,
    hiringTitle: hiringConfirmed[0] ? String(hiringConfirmed[0].title ?? "") : null,
    offer,
  });
  const explanation = explainMatch({ intel, hiringLevel, brief });
  const websiteOpportunity = websiteOpportunityFromIntel(intel?.website ?? null);
  return {
    ok: true,
    company: sanitizeCompany(company),
    observations: observations.map((o) => sanitizeObservation(o)),
    people,
    contacts,
    signals,
    pages,
    scores,
    notes,
    tags,
    brief,
    explanation,
    websiteOpportunity,
  };
});

export const getPerson = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "company_view", {
    max: 120,
    windowMs: 6e4
  });
  if (!g.ok) return {
    ok: false,
    error: g.error
  };
  const person = (await sql`select id, full_name, title, seniority, company_id, work_email, work_email_class, work_phone, confidence, source_page from people where id = ${boundedString(data.id, 64)} and user_id = ${context.userId} and deleted_at is null`)?.[0];
  if (!person) return {
    ok: false,
    error: "Not found"
  };
  const company = (await sql`select id, name from companies where id = ${person.company_id} and user_id = ${context.userId}`)?.[0];
  const contacts = (await sql`select id, kind, value, classification, company_id, person_id from contacts where user_id = ${context.userId} and person_id = ${data.id}`).filter((ct) => {
    if (String(ct.kind) !== "email") return true;
    const v = String(ct.value ?? "");
    return v && !isJunkEmail(v) && !isBillingEmail(v) && !isRecruitingEmail(v);
  }).map((ct) => sanitizeContact(ct));
  return {
    ok: true,
    person: sanitizePerson(person),
    company,
    contacts
  };
});

export const listPeople = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  return { people: await (await ctxSql(context))`
    select p.id, p.full_name, p.title, p.company_id, c.name as company_name, p.work_email, p.work_email_class, p.confidence, p.source_page
    from people p join companies c on c.id = p.company_id
    where p.user_id = ${context.userId} and p.deleted_at is null
    and p.full_name ~ '^[A-ZÅÄÖ]'
    and p.full_name !~* '(olemme|mukaan|toimihenkil|yhteystied|yritysosto|henkilöstö|henkilosto|suomen )'
    and char_length(p.full_name) between 5 and 48
    order by p.discovered_at desc limit 200` };
  });

export const saveProfile = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    const v = compileCriteria(data.criteria);
    if (!v.ok) return {
      ok: false,
      error: v.error
    };
    const g = await gate(sql, context.userId, "preview", {
      max: 40,
      windowMs: 6e4
    });
    if (!g.ok) return {
      ok: false,
      error: g.error
    };
    const id = data.id ?? nid();
    const next = data.scheduleEnabled ? new Date(Date.now() + 864e5).toISOString() : null;
    if (data.id) await sql`update search_profiles set name = ${data.name}, criteria = ${JSON.stringify(data.criteria)}::jsonb,
    schedule_enabled = ${Boolean(data.scheduleEnabled)}, schedule_cron = ${data.scheduleCron ?? null}, next_run_at = ${next}, updated_at = now()
    where id = ${id} and user_id = ${context.userId}`;
    else await sql`insert into search_profiles (id, user_id, name, criteria, schedule_enabled, schedule_cron, next_run_at)
    values (${id}, ${context.userId}, ${data.name}, ${JSON.stringify(data.criteria)}::jsonb, ${Boolean(data.scheduleEnabled)}, ${data.scheduleCron ?? null}, ${next})`;
    await audit(sql, context.userId, "profile.save", "search_profile", id);
    return {
      ok: true,
      id
    };
  });

export const setSchedule = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    const next = data.enabled ? new Date(Date.now() + 864e5).toISOString() : null;
    await sql`update search_profiles set schedule_enabled = ${data.enabled}, next_run_at = ${next}, schedule_cron = ${data.enabled ? "daily" : null}, updated_at = now()
    where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const listProfiles = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
    const sql = await ctxSql(context);
    const profiles = await sql`select id, name, criteria, schedule_enabled, schedule_cron, next_run_at, updated_at from search_profiles where user_id = ${context.userId} order by updated_at desc`;
    const runs = await sql`
      select id, profile_id, status, name, created_at, stats
      from search_runs
      where user_id = ${context.userId} and profile_id is not null
      order by created_at desc
      limit 80`;
    const byProfile = new Map<string, Array<Record<string, unknown>>>();
    for (const r of runs) {
      const pid = String(r.profile_id ?? "");
      if (!pid) continue;
      const list = byProfile.get(pid) ?? [];
      if (list.length < 5) {
        list.push({
          id: r.id,
          status: r.status,
          name: r.name,
          created_at: isoTime(r.created_at),
          discovered: (r.stats as { discovered?: number } | null)?.discovered ?? 0,
        });
        byProfile.set(pid, list);
      }
    }
    return {
      profiles: profiles.map((p) => ({ ...p, recentRuns: byProfile.get(p.id) ?? [] })),
    };
  });

export const listRuns = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d ?? {}).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const q = boundedString(data?.q?.trim?.() ?? "", 80);
  const status = boundedString(data?.status ?? "", 24);
  const rows = await sql`
    select id, status, created_at, finished_at, stats, name, query_fingerprint, ranking_version,
      new_leads_count, previously_seen_count, excluded_count, search_exhaustion_score, criteria
    from search_runs
    where user_id = ${context.userId}
      and (${status} = '' or status = ${status})
      and (${q} = '' or coalesce(name,'') ilike ${"%" + q + "%"} or id ilike ${"%" + q + "%"})
    order by created_at desc
    limit 200`;
  return {
    runs: rows.map((r) => ({
      ...sanitizeRunList(r),
      name: r.name ?? null,
      query_fingerprint: r.query_fingerprint ?? null,
      ranking_version: r.ranking_version ?? null,
      new_leads_count: r.new_leads_count ?? null,
      previously_seen_count: r.previously_seen_count ?? null,
      excluded_count: r.excluded_count ?? null,
      search_exhaustion_score: r.search_exhaustion_score ?? null,
      criteria: r.criteria ?? {},
    })),
  };
});

export const listJobs = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  let drained = { cancelled: 0, closed: 0 };
  try { drained = await drainStuckUserWork(sql, context.userId); } catch { /* keep */ }
  const live = await sql`
    select id, type, status, last_error, attempts, created_at, updated_at, company_id, run_id
    from jobs where user_id = ${context.userId} and status in ('queued','running')
    order by case when status = 'running' then 0 else 1 end, created_at asc
    limit 80`;
  const byType = await sql`
    select type, count(*) filter (where status = 'queued')::int as queued,
      count(*) filter (where status = 'running')::int as running
    from jobs where user_id = ${context.userId} and status in ('queued','running')
    group by type order by count(*) desc`;
  const totals = await sql`
    select count(*) filter (where status = 'queued')::int as queued,
      count(*) filter (where status = 'running')::int as running,
      extract(epoch from (now() - min(created_at)))::int as oldest_s
    from jobs where user_id = ${context.userId} and status in ('queued','running')`;
  const runs = await sql`
    select r.id, r.status, r.created_at, r.name, r.stats,
      count(j.id) filter (where j.status in ('queued','running'))::int as live_jobs
    from search_runs r
    left join jobs j on j.run_id = r.id and j.user_id = ${context.userId} and j.status in ('queued','running')
    where r.user_id = ${context.userId}
    group by r.id
    order by case when r.status in ('running','queued') then 0 else 1 end, r.created_at desc
    limit 30`;
  const t = totals[0] ?? {};
  return {
    jobs: live.map((j) => sanitizeJob(j)),
    summary: {
      queued: t.queued ?? 0,
      running: t.running ?? 0,
      live: (t.queued ?? 0) + (t.running ?? 0),
      oldestS: t.oldest_s ?? null,
      byType,
      drained,
    },
    runs,
  };
});

export const getSources = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  await seedSourceHealth(sql, context.userId);
  const health = await sql`select source_id, state, last_latency_ms, last_success_at, last_test_ok, last_test_detail, last_test_at, enabled from source_health where user_id = ${context.userId}`;
  const engines = engineSnapshot();
  return {
    sources: SOURCE_CATALOG.filter((s) => s.open && s.implemented).map((s) => {
      const row = health.find((h) => h.source_id === s.id) ?? null;
      return publicSourceView(s, initialState(s), row);
    }),
    engines: engines.map((e) => ({
      id: e.id,
      label: e.label,
      blurb: e.blurb,
      core: e.core,
      online: e.online,
      total: e.total,
      status: e.status
    }))
  };
});

export const getNetworkSnapshot = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  await seedSourceHealth(sql, context.userId);
  return {
    engines: engineSnapshot().map((engine) => ({
      id: engine.id,
      label: engine.label,
      blurb: engine.blurb,
      core: engine.core,
      online: engine.online,
      total: engine.total,
      status: displayState(engine.status),
      product: productLabel(displayState(engine.status)),
      sources: engine.sources.map((s) => ({
        id: s.id,
        name: s.name,
        countries: s.countries,
        state: displayState(s.state),
        product: productLabel(displayState(s.state))
      }))
    })),
    generatedAt: (new Date()).toISOString()
  };
});

export const getAdminNetwork = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  if (!(await ensurePlatformIdentity(sql, context.userId)).isAdmin) return {
    ok: false,
    error: "Admin only"
  };
  await seedSourceHealth(sql, context.userId);
  const health = await sql`select source_id, state, last_latency_ms, last_success_at, last_test_ok, last_test_detail, last_test_at, enabled from source_health where user_id = ${context.userId}`;
  const sources = SOURCE_CATALOG.map((s) => ({
    id: s.id,
    name: s.name,
    countries: s.countries,
    licence: s.licence,
    open: s.open,
    implemented: s.implemented,
    productName: s.name,
    keyRequired: Boolean(s.credentialEnv),
    envPresent: s.credentialEnv ? Boolean(process.env[s.credentialEnv]?.trim()) : false,
    liveState: initialState(s),
    health: health.find((h) => h.source_id === s.id) ?? null
  }));
  return {
    ok: true,
    engines: engineSnapshot(),
    sources,
    generatedAt: (new Date()).toISOString()
  };
});

export const toggleSource = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  if (!await requireAdmin(sql, context.userId)) return {
    ok: false,
    error: "Admin only"
  };
  await sql`update source_health set enabled = ${data.enabled}, updated_at = now() where user_id = ${context.userId} and source_id = ${boundedString(data.sourceId, 64)}`;
  await persistSecurityEvent(sql, {
    userId: context.userId,
    action: "admin.source.toggle",
    risk: "normal",
    detail: {
      sourceId: data.sourceId,
      enabled: data.enabled
    }
  });
  return { ok: true };
});

export const testSource = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "test_source", {
    max: 20,
    windowMs: 36e5,
    capability: "admin.source_network"
  });
  if (!g.ok || !g.identity.isAdmin) return {
    ok: false,
    error: "Admin only"
  };
  const def = SOURCE_CATALOG.find((s) => s.id === boundedString(data.sourceId, 64));
  if (!def) return {
    ok: false,
    error: "Unknown source"
  };
  if (!def.implemented) {
    await sql`update source_health set last_test_at = now(), last_test_ok = false, last_test_detail = ${"Integration not implemented"}, state = ${"not_implemented"}
    where user_id = ${context.userId} and source_id = ${data.sourceId}`;
    return {
      ok: false,
      error: "Integration not implemented"
    };
  }
  const state0 = initialState(def);
  if (state0 === "optional_offline" || state0 === "missing_credentials") {
    await sql`update source_health set last_test_at = now(), last_test_ok = false, last_test_detail = ${"Optional connector is on standby"}, state = ${"optional_offline"}
    where user_id = ${context.userId} and source_id = ${data.sourceId}`;
    return {
      ok: false,
      error: "Optional connector is on standby. Search continues through the open network."
    };
  }
  let ok = false;
  let detail = "";
  const t0 = Date.now();
  try {
    if (data.sourceId === "ytj") {
      const h = await ytjHealth();
      ok = h.ok;
      detail = h.detail;
    } else if (data.sourceId === "wikidata") {
      const r = await wikidataLookup("Nokia Oyj", "0112038-9");
      ok = r.ok || r.state === "connected";
      detail = r.ok ? `qid ${r.data.qid ?? "ok"}` : r.error;
    } else if (data.sourceId === "gleif") {
      const r = await gleifLookup("Nokia Oyj", "FI");
      ok = r.ok || Boolean(r.error?.includes("No LEI"));
      detail = r.ok ? r.data.lei : r.error;
    } else if (data.sourceId === "vies") {
      const r = await viesValidate("FI01120389");
      ok = r.ok;
      detail = r.ok ? `valid=${r.data.valid}` : r.error;
    } else if (data.sourceId === "website") {
      ok = true;
      detail = "Crawler is local; test a company record to fetch a live page.";
    } else if (data.sourceId === "wikipedia") {
      const { wikipediaCompany } = await import("./worker-BqbK5aDV.js").then((n) => n.T);
      const r = await wikipediaCompany("YIT Oyj");
      ok = r.ok;
      detail = r.ok ? `${r.title ?? "ok"} people=${r.people.length}` : r.error ?? "no match";
    } else if (data.sourceId === "domain_guess") {
      const { domainCandidates } = await import("./worker-BqbK5aDV.js").then((n) => n.T);
      const c = domainCandidates("Nokia Oyj");
      ok = c.includes("nokia.fi") || c.includes("nokia.com");
      detail = c.slice(0, 4).join(", ");
    } else if (data.sourceId === "brreg") {
      const r = await brregSearch("Equinor");
      ok = r.ok;
      detail = r.ok ? `${r.data.length} hits` : r.error;
    } else if (data.sourceId === "cvr") {
      const r = await cvrSearch("Maersk");
      ok = r.ok;
      detail = r.ok ? r.data[0]?.name ?? "ok" : r.error;
    } else if (data.sourceId === "nominatim") {
      const r = await nominatimGeocode("Tampere, Finland");
      ok = r.ok;
      detail = r.ok ? `${r.data.lat},${r.data.lng}` : r.error;
    } else if (data.sourceId === "rdap") {
      const r = await rdapDomain("nokia.com");
      ok = r.ok || r.state === "connected";
      detail = r.ok ? r.data.ldhName ?? "ok" : r.error;
    } else if (data.sourceId === "ted") {
      const r = await tedSearch("Helsinki");
      ok = r.ok;
      detail = r.ok ? `${r.data.length} notices` : r.error;
    } else if (data.sourceId === "hilma") {
      const r = await hilmaSearch("Tampere");
      ok = r.ok;
      detail = r.ok ? `${r.data.length} notices` : r.error;
    } else if (data.sourceId === "user_upload") {
      ok = true;
      detail = "Seed lists are uploaded from New search. No remote call.";
    } else if (data.sourceId === "opencorporates" || data.sourceId === "hunter" || data.sourceId === "companies_house" || data.sourceId === "search_api") {
      const { openCorporatesSearch, hunterDomainSearch, companiesHouseSearch, configuredSearch } = await import("./worker-BqbK5aDV.js").then((n) => n.E);
      if (data.sourceId === "opencorporates") {
        const r = await openCorporatesSearch("Nokia", "fi");
        ok = r.ok;
        detail = r.ok ? `${r.data.length} hits` : r.error;
      } else if (data.sourceId === "hunter") {
        const r = await hunterDomainSearch("nokia.com");
        ok = r.ok;
        detail = r.ok ? `${r.data.length} emails` : r.error;
      } else if (data.sourceId === "companies_house") {
        const r = await companiesHouseSearch("Nokia");
        ok = r.ok;
        detail = r.ok ? `${r.data.length} hits` : r.error;
      } else {
        const r = await configuredSearch("Nokia Oyj Finland");
        ok = r.ok;
        detail = r.ok ? `${r.data.length} hits` : r.error;
      }
    } else {
      ok = true;
      detail = "Source module loaded. A live probe runs during search.";
    }
  } catch (e) {
    ok = false;
    detail = e instanceof Error ? e.message : "test failed";
  }
  const ms = Date.now() - t0;
  await sql`update source_health set last_test_at = now(), last_test_ok = ${ok}, last_test_detail = ${detail},
  last_latency_ms = ${ms}, state = ${ok ? "connected" : "temporarily_unavailable"},
  last_success_at = case when ${ok} then now() else last_success_at end,
  last_failure_at = case when ${ok} then last_failure_at else now() end,
  last_error = case when ${ok} then last_error else ${detail} end,
  updated_at = now()
  where user_id = ${context.userId} and source_id = ${data.sourceId}`;
  await persistSecurityEvent(sql, {
    userId: context.userId,
    action: "source.test",
    risk: "normal",
    detail: {
      sourceId: data.sourceId,
      ok
    }
  });
  await audit(sql, context.userId, "source.test", "source", data.sourceId, { ok });
  return {
    ok,
    detail: stripSecrets(detail) ?? (ok ? "ok" : "Source did not return a match"),
    latencyMs: ms
  };
});

export const listAudit = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  return { events: (await (await ctxSql(context))`select id, action, entity_type, entity_id, created_at from audit_events where user_id = ${context.userId} order by created_at desc limit 200`).map((e) => sanitizeAudit(e)) };
});

export const getQuality = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  const [c] = await sql`select count(*)::int as n from companies where user_id = ${context.userId} and deleted_at is null`;
  const [missingWeb] = await sql`select count(*)::int as n from companies where user_id = ${context.userId} and deleted_at is null and website is null`;
  const [missingEmail] = await sql`select count(*)::int as n from companies where user_id = ${context.userId} and deleted_at is null and general_email is null`;
  const [inferred] = await sql`select count(*)::int as n from contacts where user_id = ${context.userId} and classification = 'inferred'`;
  const [published] = await sql`select count(*)::int as n from contacts where user_id = ${context.userId} and classification = 'published'`;
  const [rejected] = await sql`select count(*)::int as n from companies where user_id = ${context.userId} and record_status = 'rejected'`;
  const [obs] = await sql`select count(*)::int as n from observations where user_id = ${context.userId}`;
  const [avg] = await sql`select avg(overall_confidence)::int as v from companies where user_id = ${context.userId} and deleted_at is null and overall_confidence is not null`;
  let prefs = {};
  try {
    const ws = await sql`select preferences from workspaces where user_id = ${context.userId} limit 1`;
    prefs = ws[0]?.preferences ?? {};
  } catch {
    prefs = {};
  }
  const lead = parseLeadPrefs(prefs);
  let matchingPrefs = c?.n ?? 0;
  try {
    const [m] = await sql`select count(*)::int as n from companies co
      where co.user_id = ${context.userId} and co.deleted_at is null
        and (${lead.requireWebsite ? 1 : 0} = 0 or co.website is not null)
        and (${lead.requireEmail ? 1 : 0} = 0 or co.general_email is not null)
        and (${lead.minRevenue ?? 0} = 0 or coalesce(co.revenue, 0) >= ${lead.minRevenue ?? 0})
        and (${lead.minConfidence} = 0 or coalesce(co.overall_confidence, 0) >= ${lead.minConfidence})
        and (${lead.requireDecisionMaker ? 1 : 0} = 0 or exists (
          select 1 from people p where p.user_id = co.user_id and p.company_id = co.id and p.deleted_at is null
        ))`;
    matchingPrefs = m?.n ?? 0;
  } catch {
    matchingPrefs = c?.n ?? 0;
  }
  return {
    companies: c?.n ?? 0,
    missingWebsite: missingWeb?.n ?? 0,
    missingEmail: missingEmail?.n ?? 0,
    inferredContacts: inferred?.n ?? 0,
    publishedContacts: published?.n ?? 0,
    rejected: rejected?.n ?? 0,
    observations: obs?.n ?? 0,
    avgConfidence: avg?.v ?? null,
    prefs: lead,
    matchingPrefs
  };
});

export const listReview = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  return { items: await (await ctxSql(context))`select id, kind, status, payload, created_at, resolved_at from review_items where user_id = ${context.userId} order by created_at desc limit 200` };
});

export const resolveReview = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "preview", {
    max: 40,
    windowMs: 6e4
  });
  if (!g.ok) return {
    ok: false,
    error: g.error
  };
  await sql`update review_items set status = ${data.status}, resolved_at = now(), resolved_by = ${context.userId}
  where id = ${data.id} and user_id = ${context.userId}`;
  return { ok: true };
});

export const scanDuplicates = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "scan_dupes", {
    max: 8,
    windowMs: 36e5
  });
  if (!g.ok) return {
    created: 0,
    error: g.error
  };
  const rows = await sql`
  select id, business_id, vat_id, lei, website_domain, name, country, phone, street, postal_code
  from companies where user_id = ${context.userId} and deleted_at is null
  limit 250`;
  const open = await sql`
  select payload->>'a' as a, payload->>'b' as b
  from review_items where user_id = ${context.userId} and kind = 'duplicate' and status = 'open'`;
  const seen = new Set(open.flatMap((r) => [`${r.a}:${r.b}`, `${r.b}:${r.a}`]));
  let created = 0;
  for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
    const key = `${rows[i].id}:${rows[j].id}`;
    if (seen.has(key)) continue;
    const d = compareEntities({
      id: rows[i].id,
      businessId: rows[i].business_id,
      vatId: rows[i].vat_id,
      lei: rows[i].lei,
      domain: rows[i].website_domain,
      name: rows[i].name,
      country: rows[i].country,
      phone: rows[i].phone,
      street: rows[i].street,
      postalCode: rows[i].postal_code
    }, {
      id: rows[j].id,
      businessId: rows[j].business_id,
      vatId: rows[j].vat_id,
      lei: rows[j].lei,
      domain: rows[j].website_domain,
      name: rows[j].name,
      country: rows[j].country,
      phone: rows[j].phone,
      street: rows[j].street,
      postalCode: rows[j].postal_code
    });
    if (d.action === "keep") continue;
    seen.add(key);
    await sql`insert into review_items (id, user_id, kind, payload)
    values (${nid()}, ${context.userId}, ${"duplicate"}, ${JSON.stringify({
        a: rows[i].id,
        b: rows[j].id,
        aName: rows[i].name,
        bName: rows[j].name,
        ...d
      })}::jsonb)`;
    created += 1;
    if (created >= 80) return { created };
  }
  return { created };
});

export const mergeCompanies = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "preview", {
    max: 30,
    windowMs: 6e4
  });
  if (!g.ok) return {
    ok: false,
    error: g.error
  };
  const keep = (await sql`select id from companies where id = ${data.keepId} and user_id = ${context.userId}`)?.[0];
  const drop = (await sql`select id from companies where id = ${data.dropId} and user_id = ${context.userId}`)?.[0];
  if (!keep || !drop) return {
    ok: false,
    error: "Not found"
  };
  await mergeCompanyRecords(sql, context.userId, data.keepId, data.dropId);
  await audit(sql, context.userId, "company.merge", "company", data.keepId, { dropped: data.dropId });
  return { ok: true };
});

export const addTag = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const existing = (await sql`select id from tags where user_id = ${context.userId} and name = ${sanitizeUserText(data.name, 40)}`)?.[0];
  const tagId = existing?.id ?? nid();
  if (!existing) await sql`insert into tags (id, user_id, name) values (${tagId}, ${context.userId}, ${sanitizeUserText(data.name, 40)})`;
  if (!(await sql`select id from companies where id = ${boundedString(data.companyId, 64)} and user_id = ${context.userId} and deleted_at is null`)?.[0]) return {
    ok: false,
    error: "Not found"
  };
  await sql`insert into company_tags (user_id, company_id, tag_id) values (${context.userId}, ${data.companyId}, ${tagId}) on conflict do nothing`;
  return { ok: true };
});

export const addNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const entityType = boundedString(data.entityType, 32);
  const entityId = boundedString(data.entityId, 64);
  if (entityType === "company") {
    if (!(await sql`select id from companies where id = ${entityId} and user_id = ${context.userId} and deleted_at is null`)?.[0]) return {
      ok: false,
      error: "Not found"
    };
  }
  await sql`insert into notes (id, user_id, entity_type, entity_id, body) values (${nid()}, ${context.userId}, ${entityType}, ${entityId}, ${sanitizeUserText(data.body, 4e3)})`;
  return { ok: true };
});

export const createList = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const g = await gate(sql, context.userId, "preview", {
    max: 40,
    windowMs: 6e4,
    capability: "watchlist.create"
  });
  if (!g.ok) return {
    id: "",
    error: g.error
  };
  const id = nid();
  const rulesJson = JSON.stringify(parseListRules(data.rules));
  try {
    await sql`insert into lists (id, user_id, name, description, rules) values (${id}, ${context.userId}, ${sanitizeUserText(data.name, 80)}, ${sanitizeUserText(data.description ?? "", 400) || null}, ${rulesJson}::jsonb)`;
  } catch {
    await sql`insert into lists (id, user_id, name, description) values (${id}, ${context.userId}, ${sanitizeUserText(data.name, 80)}, ${sanitizeUserText(data.description ?? "", 400) || null})`;
  }
  return { id };
});

export const listLists = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  return { lists: await (await ctxSql(context))`
    select l.id, l.name, l.description, l.rules, (select count(*)::int from list_members m where m.list_id = l.id and m.user_id = ${context.userId}) as n
    from lists l where l.user_id = ${context.userId} order by l.created_at desc` };
  });

export const addToList = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    const list = (await sql`select id from lists where id = ${boundedString(data.listId, 64)} and user_id = ${context.userId}`)?.[0];
    const company = (await sql`select id from companies where id = ${boundedString(data.companyId, 64)} and user_id = ${context.userId} and deleted_at is null`)?.[0];
    if (!list || !company) return {
      ok: false,
      error: "Not found"
    };
    await sql`insert into list_members (user_id, list_id, company_id) values (${context.userId}, ${data.listId}, ${data.companyId}) on conflict do nothing`;
    return { ok: true };
  });

export const addSuppression = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    await sql`insert into suppression (id, user_id, kind, value, reason) values (${nid()}, ${context.userId}, ${data.kind}, ${data.value}, ${data.reason ?? null})
    on conflict (user_id, kind, value) do nothing`;
    await audit(sql, context.userId, "privacy.suppress", "suppression", data.value, { kind: data.kind });
    return { ok: true };
  });

export const listSuppression = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
    return { rows: await (await ctxSql(context))`select id, kind, value, reason, created_at from suppression where user_id = ${context.userId} order by created_at desc limit 200` };
  });

export const deleteCompany = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    const g = await gate(sql, context.userId, "preview", {
      max: 40,
      windowMs: 6e4
    });
    if (!g.ok) return {
      ok: false,
      error: g.error
    };
    await sql`update companies set deleted_at = now() where id = ${boundedString(data.id, 64)} and user_id = ${context.userId}`;
    await audit(sql, context.userId, "company.delete", "company", data.id);
    return { ok: true };
  });

export const purgeWorkspace = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    if (data.confirm !== "DELETE") return {
      ok: false,
      error: "Type DELETE to confirm"
    };
    const sql = await ctxSql(context);
    const uid = context.userId;
    await sql`delete from contacts where user_id = ${uid}`;
    await sql`delete from people where user_id = ${uid}`;
    await sql`delete from observations where user_id = ${uid}`;
    await sql`delete from signals where user_id = ${uid}`;
    await sql`delete from crawl_pages where user_id = ${uid}`;
    await sql`delete from company_scores where user_id = ${uid}`;
    await sql`delete from run_companies where user_id = ${uid}`;
    await sql`delete from jobs where user_id = ${uid}`;
    await sql`delete from search_runs where user_id = ${uid}`;
    await sql`delete from notes where user_id = ${uid}`;
    await sql`delete from company_tags where user_id = ${uid}`;
    await sql`delete from list_members where user_id = ${uid}`;
    await sql`delete from review_items where user_id = ${uid}`;
    await sql`delete from companies where user_id = ${uid}`;
    await audit(sql, uid, "privacy.purge", "workspace");
    return { ok: true };
  });

export const createDsar = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    const id = nid();
    await sql`insert into dsar_requests (id, user_id, subject_name, subject_email, request_type, notes)
    values (${id}, ${context.userId}, ${data.subjectName ?? null}, ${data.subjectEmail ?? null}, ${data.requestType}, ${data.notes ?? null})`;
    await audit(sql, context.userId, "privacy.dsar", "dsar", id, { type: data.requestType });
    return { id };
  });

export const listDsar = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
    return { rows: await (await ctxSql(context))`select id, subject_name, subject_email, request_type, status, notes, created_at from dsar_requests where user_id = ${context.userId} order by created_at desc limit 100` };
  });

export const saveWorkspace = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    await (await ctxSql(context))`update workspaces set name = ${sanitizeUserText(data.name, 80)}, retention_days = ${clampInt(data.retentionDays, 30, 3650, 730)}, country_allowlist = ${sanitizeUserText(data.countryAllowlist, 40)},
    purpose = ${sanitizeUserText(data.purpose ?? "", 500) || null}, lawful_basis = ${sanitizeUserText(data.lawfulBasis ?? "", 80) || null}, updated_at = now()
    where user_id = ${context.userId}`;
    return { ok: true };
  });

export const listExports = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
    return { rows: await (await ctxSql(context))`select id, format, filename, row_count, created_at, scope, run_id from exports where user_id = ${context.userId} order by created_at desc limit 50` };
  });

export const importSeeds = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const ids = [...new Set(data.identifiers.map((x) => normalizeBusinessId(x)).filter((x) => Boolean(x)))].slice(0, 20);
    if (!ids.length) return {
      ok: false,
      error: "No valid Finnish Business IDs in the seed list"
    };
    const sql = await ctxSql(context);
    const g = await gate(sql, context.userId, "seed", {
      max: 10,
      windowMs: 36e5
    });
    if (!g.ok) return {
      ok: false,
      error: g.error
    };
    const quota = await assertSearchQuota(sql, context.userId, queryCost("seed"));
    if (!quota.ok) return {
      ok: false,
      error: quota.error
    };
    const companiesQuota = await assertCompanyQuota(sql, context.userId);
    if (!companiesQuota.ok) return {
      ok: false,
      error: companiesQuota.error
    };
    const uploadId = nid();
    await sql`insert into seed_uploads (id, user_id, filename, row_count, identifiers)
    values (${uploadId}, ${context.userId}, ${data.filename ?? "paste"}, ${ids.length}, ${JSON.stringify(ids)}::jsonb)`;
    const criteria = {
      country: "FI",
      maxResults: ids.length,
      roles: ["ceo", "sales_director"],
      groups: {
        id: "root",
        combinator: "and",
        rules: ids.map((bid) => ({
          id: nid(),
          field: "business_id",
          op: "eq",
          value: bid
        }))
      }
    };
    const runId = nid();
    await sql`insert into search_runs (id, user_id, status, criteria)
    values (${runId}, ${context.userId}, ${"running"}, ${JSON.stringify(criteria)}::jsonb)`;
    let kept = 0;
    for (const bid of ids) {
      const r = await ytjFetchById(bid);
      if (!r.ok) continue;
      const companyId = await insertCompany(sql, context.userId, {
        ...r.data,
        websiteDomain: normalizeDomain(r.data.website ?? null)
      });
      await insertObservations(sql, context.userId, "company", companyId, "ytj", r.sourceUrl, "official_register", r.observations);
      await insertObservations(sql, context.userId, "company", companyId, "user_upload", undefined, "user_upload", [{
        field: "business_id",
        rawValue: bid,
        normalisedValue: bid,
        confidence: 90,
        sourceReliability: 50,
        extractionMethod: "seed_list",
        verificationStatus: "published",
        evidence: data.filename ?? "pasted identifiers"
      }]);
      await sql`insert into run_companies (user_id, run_id, company_id, match_reasons, is_new)
      values (${context.userId}, ${runId}, ${companyId}, ${JSON.stringify(["seed", bid])}::jsonb, ${true}) on conflict do nothing`;
      await enqueueJob(sql, context.userId, "enrich", {
        runId,
        companyId
      });
      kept += 1;
    }
    await updateRunStats(sql, context.userId, runId);
    await audit(sql, context.userId, "seed.import", "seed_upload", uploadId, {
      kept,
      ids: ids.length
    });
    return {
      ok: true,
      runId,
      discovered: kept
    };
  });

export const buildExport = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    const g = await gate(sql, context.userId, "export", {
      max: 12,
      windowMs: 36e5,
      capability: "company.export"
    });
    if (!g.ok) return {
      filename: "",
      mime: "text/plain",
      body: "",
      rowCount: 0,
      error: g.error
    };
    const requested = boundedArray((data.ids ?? []).filter(Boolean).map((id) => boundedString(id, 64)), 2e3);
    const cap = exportRowCap(g.identity.plan, g.identity.isAdmin);
    if (requested.length === 0 || requested.length > 50) {
      if (!canBulkExport(g.role, g.identity.isAdmin) && !g.identity.isAdmin && g.identity.plan === "free") {}
    }
    const cost = exportSearchUnits(requested.length);
    const quota = cost > 0 ? await assertSearchQuota(sql, context.userId, cost) : { ok: true };
    if (!quota.ok) return {
      filename: "",
      mime: "text/plain",
      body: "",
      rowCount: 0,
      error: quota.error
    };
    let exportedToday = 0;
    try {
      exportedToday = (await sql`
      select coalesce(sum(row_count),0)::int as n from exports
      where user_id = ${context.userId} and created_at > now() - interval '1 day'`)[0]?.n ?? 0;
    } catch {
      exportedToday = 0;
    }
    const daily = exportDailyCap(g.identity.plan, g.identity.isAdmin);
    if (exportedToday >= daily) return {
      filename: "",
      mime: "text/plain",
      body: "",
      rowCount: 0,
      error: "Daily export quota reached."
    };
    const remaining = Math.max(0, Math.min(cap, daily - exportedToday));
    if (remaining <= 0) return {
      filename: "",
      mime: "text/plain",
      body: "",
      rowCount: 0,
      error: "Export quota reached."
    };
    const ids = requested.slice(0, remaining);
    const runId = boundedString(data.runId, 64);
    if (runId) {
      const ownedRun = (await sql`select id from search_runs where id = ${runId} and user_id = ${context.userId}`)?.[0];
      if (!ownedRun) return { filename: "", mime: "text/plain", body: "", rowCount: 0, error: "Not found" };
    }
    const rows = ids.length ? await sql.query(`select id, name, business_id, vat_id, country, municipality, street, postal_code, website, website_domain, industry_code, industry_label, legal_form, record_status, overall_confidence, last_verified_at, revenue, website_score, seo_score, commercial_opportunity, match_score from companies where user_id = $1 and deleted_at is null and id in (${ids.map((_, i) => `$${i + 2}`).join(",")})`, [context.userId, ...ids]) : runId ? await sql`select c.id, c.name, c.business_id, c.vat_id, c.country, c.municipality, c.street, c.postal_code, c.website, c.website_domain, c.industry_code, c.industry_label, c.legal_form, c.record_status, c.overall_confidence, c.last_verified_at, c.revenue, c.website_score, c.seo_score, c.commercial_opportunity, c.match_score, rc.novelty_score, rc.seen_before
    from run_companies rc join companies c on c.id = rc.company_id
    where rc.user_id = ${context.userId} and rc.run_id = ${runId} and c.deleted_at is null
    order by coalesce(rc.rank_position, 999999), c.id
    limit ${remaining}` : (runId
      ? await sql`select c.id, c.name, c.business_id, c.vat_id, c.country, c.municipality, c.street, c.postal_code, c.website, c.website_domain, c.industry_code, c.industry_label, c.legal_form, c.record_status, c.overall_confidence, c.last_verified_at, c.revenue, c.website_score, c.seo_score, c.commercial_opportunity, c.match_score, rc.novelty_score, rc.seen_before
          from run_companies rc join companies c on c.id = rc.company_id
          where rc.user_id = ${context.userId} and rc.run_id = ${runId} and c.deleted_at is null
          order by coalesce(rc.rank_position, 999999), c.id
          limit ${remaining}`
      : await sql`select id, name, business_id, vat_id, country, municipality, street, postal_code, website, website_domain, industry_code, industry_label, legal_form, record_status, overall_confidence, last_verified_at, revenue, website_score, seo_score, commercial_opportunity, match_score from companies where user_id = ${context.userId} and deleted_at is null order by name limit ${remaining}`);
    const people = await sql`
    select company_id, full_name, title from people where user_id = ${context.userId} and deleted_at is null`;
    const contacts = await sql`
    select company_id, kind, value, classification from contacts where user_id = ${context.userId}`;
    const suppressed = await sql`select kind, value from suppression where user_id = ${context.userId}`;
    const block = new Set(suppressed.map((s) => `${s.kind}:${s.value.toLowerCase()}`));
    const allowed = rows.filter((c) => {
      const bid = String(c.business_id ?? "").toLowerCase();
      const domain = String(c.website_domain ?? "").toLowerCase();
      if (bid && block.has(`business_id:${bid}`)) return false;
      if (domain && block.has(`domain:${domain}`)) return false;
      if (runId && data.includeRejected !== true) {
        const st = String(c.record_status ?? "");
        if (st === "rejected" || st === "excluded" || st === "failed") return false;
        if (!(Number(c.match_score ?? 0) > 0)) return false;
      }
      return true;
    }).slice(0, remaining);
    const mapped = allowed.map((c) => {
      const id = String(c.id);
      const ppl = people.filter((p) => p.company_id === id);
      const cts = contacts.filter((x) => {
        if (x.company_id !== id) return false;
        if (x.kind === "email" && (block.has(`email:${x.value.toLowerCase()}`) || isRecruitingEmail(x.value))) return false;
        if (x.kind === "phone" && block.has(`phone:${x.value.toLowerCase()}`)) return false;
        return true;
      });
      const rec = {
        canonical_company_id: String(c.id ?? ""),
        name: String(c.name ?? ""),
        business_id: c.business_id ?? "",
        vat_id: c.vat_id ?? "",
        country: String(c.country ?? ""),
        municipality: c.municipality ?? "",
        street: c.street ?? "",
        postal_code: c.postal_code ?? "",
        website: c.website ?? "",
        industry_code: c.industry_code ?? "",
        industry_label: c.industry_label ?? "",
        legal_form: c.legal_form ?? "",
        status: String(c.record_status ?? ""),
        confidence: c.overall_confidence ?? "",
        revenue: typeof c.revenue === "number" && Number.isFinite(c.revenue) ? c.revenue : c.revenue != null && Number.isFinite(Number(c.revenue)) ? Number(c.revenue) : "",
        revenue_currency: c.revenue != null && c.revenue !== "" ? "EUR" : "",
        website_score: c.website_score ?? "",
        seo_score: c.seo_score ?? "",
        opportunity_score: c.commercial_opportunity ?? "",
        match_score: c.match_score ?? "",
        email_published: cts.filter((x) => x.kind === "email" && x.classification === "published").map((x) => x.value).join("; "),
        email_inferred: cts.filter((x) => x.kind === "email" && x.classification === "inferred").map((x) => x.value).join("; "),
        email_state: cts.some((x) => x.kind === "email" && x.classification === "published")
          ? "published"
          : cts.some((x) => x.kind === "email" && x.classification === "inferred")
            ? "inferred"
            : "UNKNOWN",
        phone: cts.filter((x) => x.kind === "phone").map((x) => x.value).join("; "),
        people: ppl.map((p) => `${p.full_name}${p.title ? " · " + p.title : ""}`).join("; "),
        last_verified: c.last_verified_at ?? "",
        run_id: boundedString(data.runId, 64) || "",
        exported_at: (new Date()).toISOString(),
        ranking_version: RANKING_VERSION,
        novelty_score: c.novelty_score ?? "",
        seen_before: c.seen_before ? "yes" : "no"
      };
      if (data.includeProvenance !== false) rec.source = "see company record for field-level provenance";
      return rec;
    });
    let filename = `${`norf-export-${(new Date()).toISOString().slice(0, 10)}`}.${data.format === "crm" || data.format === "csv" ? "csv" : data.format === "xlsx" ? "xml" : "json"}`;
    let body = "";
    let mime = "text/plain";
    const exportId = nid();
    const watermark = exportWatermark({
      exportId,
      userId: context.userId
    });
    if (data.format === "json") {
      body = JSON.stringify({
        companies: mapped,
        _trace: watermark
      }, null, 2);
      mime = "application/json";
    } else if (data.format === "crm") {
      const crm = [];
      for (const c of allowed) {
        const id = String(c.id);
        const ppl = people.filter((p) => p.company_id === id);
        const emails = contacts.filter((x) => x.company_id === id && x.kind === "email" && !block.has(`email:${x.value.toLowerCase()}`));
        const phones = contacts.filter((x) => x.company_id === id && x.kind === "phone");
        const push = (firstName, lastName, title) => {
          crm.push({
            company: String(c.name ?? ""),
            businessId: String(c.business_id ?? ""),
            firstName,
            lastName,
            title,
            email: emails.find((e) => e.classification === "published")?.value ?? "",
            emailClass: emails.find((e) => e.classification === "published")?.classification ?? "",
            phone: phones[0]?.value ?? String(c.phone ?? ""),
            website: String(c.website ?? ""),
            city: String(c.municipality ?? ""),
            country: String(c.country ?? "")
          });
        };
        if (!ppl.length) push("", "", "");
        else for (const p of ppl) {
          const parts = p.full_name.trim().split(/\s+/);
          push(parts[0] ?? "", parts.slice(1).join(" "), p.title ?? "");
        }
      }
      body = rowsToCrmCsv(crm);
      mime = "text/csv";
    } else if (data.format === "csv") {
      body = rowsToCsv(projectCsvRows(mapped, data.preset));
      mime = "text/csv";
    } else {
      body = rowsToXlsx(projectCsvRows(mapped, data.preset));
      mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    try {
      try {
        await recordExported(sql, context.userId, boundedString(data.runId, 64) || null, allowed.map((c) => ({
          companyId: String(c.id),
          businessId: c.business_id ?? null
        })));
      } catch {}
      await sql`insert into exports (id, user_id, format, scope, filename, row_count, include_provenance, watermark, ip, run_id)
      values (${exportId}, ${context.userId}, ${data.format}, ${data.scope ?? (ids.length ? "selected" : "all")}, ${filename}, ${mapped.length}, ${data.includeProvenance !== false}, ${watermark}, ${g.ip}, ${boundedString(data.runId, 64) || null})`;
    } catch {
      await sql`insert into exports (id, user_id, format, scope, filename, row_count, include_provenance)
      values (${exportId}, ${context.userId}, ${data.format}, ${data.scope ?? (ids.length ? "selected" : "all")}, ${filename}, ${mapped.length}, ${data.includeProvenance !== false})`;
    }
    noteExtraction(context.userId, "export");
    await persistSecurityEvent(sql, {
      userId: context.userId,
      action: "export.create",
      risk: mapped.length > 200 ? "suspicious" : "normal",
      ip: g.ip,
      detail: {
        rows: mapped.length,
        format: data.format,
        exportId
      }
    });
    await audit(sql, context.userId, "export.create", "export", exportId, {
      rows: mapped.length,
      format: data.format
    });
    if (mapped.length > 200) await bumpAbuse(sql, context.userId, 6, "suspicious", {
      reason: "large_export",
      ip: g.ip
    });
    await persistExtractionCounters(sql, context.userId, {
      exports: mapped.length,
      ip: g.ip
    });
    return {
      filename,
      mime,
      body,
      rowCount: mapped.length
    };
  });

export const startCheckout = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    const id = await ensurePlatformIdentity(sql, context.userId);
    const origin = resolveCheckoutOrigin(data.origin);
    if (!origin) return {
      ok: false,
      error: "Untrusted return URL for Stripe checkout"
    };
    let customerId = null;
    try {
      customerId = (await sql`select stripe_customer_id from workspaces where user_id = ${context.userId} limit 1`)[0]?.stripe_customer_id ?? null;
    } catch {
      customerId = null;
    }
    return createStripeCheckout({
      userId: context.userId,
      email: id.email,
      plan: normalizePlanId(data.plan),
      origin,
      customerId
    });
  });

export const startBillingPortal = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    const origin = resolveCheckoutOrigin(data.origin);
    if (!origin) return {
      ok: false,
      error: "Untrusted return URL"
    };
    let customerId = null;
    try {
      customerId = (await sql`select stripe_customer_id from workspaces where user_id = ${context.userId} limit 1`)[0]?.stripe_customer_id ?? null;
    } catch {
      customerId = null;
    }
    if (!customerId) return {
      ok: false,
      error: "No paid subscription on this workspace yet."
    };
    return createStripePortal({
      customerId,
      origin
    });
  });

export const getAdminState = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
    try {
      const sql = await ctxSql(context);
      await ensurePlatformSchema(sql);
      const id = await ensurePlatformIdentity(sql, context.userId);
      if (!id.isAdmin) return {
        isAdmin: false,
        seedOpen: id.seedOpen,
        admins: [],
        workspaceCount: 0
      };
      const admins = await sql`select user_id, email, role from platform_admins order by created_at`;
      const [ws] = await sql`select count(*)::int as n from workspaces`;
      let userCount = ws?.n ?? 0;
      let planMix: Array<{ plan: string; n: number }> = [];
      let searchesToday = 0;
      let searchesRunning = 0;
      let companiesTotal = 0;
      let jobsLive = 0;
      let securityHigh = 0;
      let findings: Array<{ severity: string; title: string; why: string; trail: string }> = [];
      try {
        userCount = (await sql`select count(*)::int as n from "user"`)[0]?.n ?? userCount;
        planMix = await sql`select coalesce(plan, 'free') as plan, count(*)::int as n from workspaces group by 1 order by n desc`;
        const sr = (await sql`
          select
            count(*) filter (where created_at > now() - interval '1 day')::int as today,
            count(*) filter (where status in ('running','queued'))::int as running
          from search_runs`)[0];
        searchesToday = sr?.today ?? 0;
        searchesRunning = sr?.running ?? 0;
        companiesTotal = (await sql`select count(*)::int as n from companies where deleted_at is null`)[0]?.n ?? 0;
        jobsLive = (await sql`select count(*)::int as n from jobs where status in ('queued','running')`)[0]?.n ?? 0;
        securityHigh = (await sql`select count(*)::int as n from security_events where created_at > now() - interval '1 day' and risk in ('high','blocked')`)[0]?.n ?? 0;
      } catch { /* optional stats */ }
      if (jobsLive > 200) findings.push({ severity: "threat", title: "Job queue overloaded", why: `${jobsLive} live jobs. Worker is not draining.`, trail: "/admin/search" });
      else if (jobsLive > 40) findings.push({ severity: "warning", title: "Job queue elevated", why: `${jobsLive} live jobs.`, trail: "/admin/search" });
      if (searchesRunning > 2) findings.push({ severity: "warning", title: "Searches stuck running", why: `${searchesRunning} searches still marked running.`, trail: "/admin/search" });
      if (securityHigh > 0) findings.push({ severity: "threat", title: "High-risk security events today", why: `${securityHigh} high/blocked events in 24h.`, trail: "/admin/security" });
      if (searchesToday === 0) findings.push({ severity: "missing", title: "No searches today", why: "No customer search started in the last 24 hours.", trail: "/admin/search" });
      return {
        isAdmin: true,
        seedOpen: id.seedOpen,
        admins,
        workspaceCount: ws?.n ?? 0,
        userCount,
        planMix,
        searchesToday,
        searchesRunning,
        companiesTotal,
        jobsLive,
        securityHigh,
        findings,
      };
    } catch (err) {
      console.error("[norf] admin-state", err);
      return {
        isAdmin: false,
        seedOpen: true,
        admins: [],
        workspaceCount: 0
      };
    }
  });

export const adminInvite = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    return inviteAdmin(sql, context.userId, data.email);
  });

export const adminRevoke = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    return revokeAdmin(sql, context.userId, data.userId);
  });

export const getAdminActivity = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  if (!(await ensurePlatformIdentity(sql, context.userId)).isAdmin) return { ok: false, error: "Admin only" };
  const searches = (await sql`
    select id, user_id, status, name, created_at, stats
    from search_runs order by created_at desc limit 25`).map((r) => ({
    id: r.id,
    user_id: String(r.user_id ?? "").slice(0, 12),
    status: r.status,
    name: r.name,
    created_at: isoTime(r.created_at),
    discovered: (r.stats as { discovered?: number } | null)?.discovered ?? 0,
  }));
  let security: Array<Record<string, unknown>> = [];
  try {
    security = (await sql`select id, action, risk, user_id, created_at from security_events order by created_at desc limit 30`).map((e) => ({
      id: e.id,
      action: e.action,
      risk: e.risk,
      user_id: String(e.user_id ?? "").slice(0, 12),
      created_at: isoTime(e.created_at),
    }));
  } catch { security = []; }
  let auditRows: Array<Record<string, unknown>> = [];
  try {
    auditRows = (await sql`select id, action, entity_type, user_id, created_at from audit_events order by created_at desc limit 30`).map((e) => ({
      id: e.id,
      action: e.action,
      entity_type: e.entity_type,
      user_id: String(e.user_id ?? "").slice(0, 12),
      created_at: isoTime(e.created_at),
    }));
  } catch { auditRows = []; }
  let signups: Array<Record<string, unknown>> = [];
  try {
    signups = (await sql`select id, email, name, "createdAt" as created_at from "user" order by "createdAt" desc limit 12`).map((u) => ({
      id: String(u.id ?? "").slice(0, 12),
      email: u.email,
      name: u.name,
      created_at: isoTime(u.created_at),
    }));
  } catch { signups = []; }
  return { ok: true, searches, security, audit: auditRows, signups };
});

export const adminDrainQueue = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  if (!(await ensurePlatformIdentity(sql, context.userId)).isAdmin) return { ok: false, error: "Admin only", pruned: 0 };
  const { snapshotQueueDepth, applyQueueImmune } = await import("./queue-monitor.ts");
  const snap = await snapshotQueueDepth(sql);
  const act = await applyQueueImmune(sql, snap);
  dispatchVercelExecution({ reason: "admin.drain" });
  await persistSecurityEvent(sql, {
    userId: context.userId,
    action: "admin.queue.drain",
    risk: "normal",
    detail: { pruned: act.pruned },
  });
  return { ok: true, pruned: act.pruned, stolen: act.stolen, depth: snap.depth };
});

export const adminListPosts = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
    const sql = await ctxSql(context);
    if (!await isPlatformAdmin(sql, context.userId)) return { posts: [] };
    return { posts: await sql`
      select id, title, status, locale, source, slug from blog_posts order by updated_at desc limit 80` };
    });

export const adminSavePost = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
      const sql = await ctxSql(context);
      if (!await isPlatformAdmin(sql, context.userId)) return {
        ok: false,
        error: "Admin only"
      };
      return {
        ok: true,
        ...await upsertBlogPost(sql, {
          ...data,
          authorId: context.userId,
          source: "human"
        })
      };
    });

export const adminGeneratePost = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
      const sql = await ctxSql(context);
      if (!await isPlatformAdmin(sql, context.userId)) return {
        ok: false,
        error: "Admin only"
      };
      return generateBlogPost(sql, {
        ...data,
        authorId: context.userId
      });
    });

export const getSecurityCenter = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
      const sql = await ctxSql(context);
      if (!await isPlatformAdmin(sql, context.userId)) return {
        ok: false,
        error: "Admin only"
      };
      await ensureSecuritySchema(sql);
      const events = (await sql`
      select id, user_id, action, risk, ip, created_at from security_events order by created_at desc limit 80`).map((e) => ({
        id: String(e.id ?? ""),
        user_id: String(e.user_id ?? ""),
        action: String(e.action ?? ""),
        risk: String(e.risk ?? "normal"),
        ip: e.ip ? String(e.ip) : null,
        created_at: isoTime(e.created_at),
      }));
      const abuse = (await sql`
        select user_id, score, classification, unique_companies, searches, exports_today, blocked_until, last_ip, updated_at
        from abuse_state order by score desc, updated_at desc limit 40`).map((r) => ({
        ...r,
        user_id: String(r.user_id ?? ""),
        blocked_until: isoTime(r.blocked_until),
        updated_at: isoTime(r.updated_at),
        last_ip: r.last_ip ? String(r.last_ip) : null,
      }));
      const exports = (await sql`
        select user_id, row_count, format, created_at, filename from exports order by created_at desc limit 40`).map((e) => ({
        ...e,
        user_id: String(e.user_id ?? ""),
        created_at: isoTime(e.created_at),
        filename: String(e.filename ?? ""),
      }));
      let sessions = 0;
      let users = 0;
      let blockedNow = 0;
      try {
        users = (await sql`select count(*)::int as n from "user"`)[0]?.n ?? 0;
        sessions = (await sql`select count(*)::int as n from "session" where "expiresAt" > now()`)[0]?.n ?? 0;
        blockedNow = (await sql`select count(*)::int as n from abuse_state where classification in ('blocked','high') and (blocked_until is null or blocked_until > now())`)[0]?.n ?? 0;
      } catch { /* optional */ }
      const highRisk = events.filter((e) => e.risk === "high" || e.risk === "blocked").length;
      return {
        ok: true,
        events,
        abuse,
        exports,
        rateBlocks: events.filter((e) => e.action.startsWith("rate.") || e.risk === "blocked" || e.risk === "high").length,
        ssrfBlocks: ssrfBlockCount(),
        users,
        sessions,
        blockedNow,
        highRisk,
        generatedAt: (new Date()).toISOString()
      };
    });

export const adminSetAbuse = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
      const sql = await ctxSql(context);
      if (!await isPlatformAdmin(sql, context.userId)) return {
        ok: false,
        error: "Admin only"
      };
      if (data.confirm !== "ADMIN") return {
        ok: false,
        error: "Re-confirm this privileged action."
      };
      const target = boundedString(data.userId, 64);
      if (!target) return {
        ok: false,
        error: "Not found"
      };
      await ensureSecuritySchema(sql);
      if (data.action === "clear") await sql`update abuse_state set score = 0, classification = ${"normal"}, blocked_until = null, updated_at = now() where user_id = ${target}`;
      else if (data.action === "throttle") await sql`
      insert into abuse_state (user_id, score, classification, blocked_until, reason, updated_at)
      values (${target}, 55, ${"high"}, now() + interval '2 hours', ${"admin_throttle"}, now())
      on conflict (user_id) do update set score = greatest(abuse_state.score, 55), classification = ${"high"}, blocked_until = now() + interval '2 hours', reason = ${"admin_throttle"}, updated_at = now()`;
      else await sql`
      insert into abuse_state (user_id, score, classification, blocked_until, reason, updated_at)
      values (${target}, 95, ${"blocked"}, now() + interval '24 hours', ${"admin_suspend"}, now())
      on conflict (user_id) do update set score = 95, classification = ${"blocked"}, blocked_until = now() + interval '24 hours', reason = ${"admin_suspend"}, updated_at = now()`;
      await persistSecurityEvent(sql, {
        userId: context.userId,
        action: `admin.abuse.${data.action}`,
        risk: "high",
        detail: { target }
      });
      await audit(sql, context.userId, `admin.abuse.${data.action}`, "user", target);
      return { ok: true };
    });

export const listMySessions = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
      const sql = await ctxSql(context);
      try {
        return { sessions: (await sql`
          select id, "createdAt" as created, "updatedAt" as updated, "expiresAt" as expires, "ipAddress" as ip, "userAgent" as ua
          from "session" where "userId" = ${context.userId} order by "updatedAt" desc limit 20`).map((r) => ({
          id: r.id,
          createdAt: r.created,
          lastActive: r.updated,
          expiresAt: r.expires,
          ip: r.ip,
          userAgent: r.ua ? r.ua.slice(0, 120) : null
        })) };
    } catch {
      return { sessions: [] };
    }
  });

export const revokeSession = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
    const sql = await ctxSql(context);
    try {
      await sql`delete from "session" where id = ${boundedString(data.sessionId, 128)} and "userId" = ${context.userId}`;
      await persistSecurityEvent(sql, {
        userId: context.userId,
        action: "session.revoke",
        risk: "normal",
        detail: { sessionId: data.sessionId }
      });
    } catch {
      return {
        ok: false,
        error: "Could not revoke session"
      };
    }
    return { ok: true };
  });

export const listApiTokens = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
    const sql = await ctxSql(context);
    await ensureSecuritySchema(sql);
    return { tokens: await sql`
      select id, name, prefix, scopes, created_at, last_used_at, revoked_at, expires_at from api_tokens where user_id = ${context.userId} order by created_at desc limit 40` };
    });

export const createApiToken = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
      const sql = await ctxSql(context);
      const g = await gate(sql, context.userId, "api_token", {
        max: 10,
        windowMs: 864e5,
        capability: "api.token.create"
      });
      if (!g.ok) return {
        ok: false,
        error: g.error
      };
      const allowed = /* @__PURE__ */ new Set([
      "company:read",
      "search:execute",
      "export:create"
      ]);
      const scopes = boundedString(data.scopes ?? "company:read", 80).split(",").map((s) => s.trim()).filter((s) => allowed.has(s));
      if (!scopes.length) return {
        ok: false,
        error: "Choose at least one valid scope."
      };
      const minted = mintApiToken();
      const id = nid();
      await sql`insert into api_tokens (id, user_id, name, prefix, key_hash, scopes)
      values (${id}, ${context.userId}, ${sanitizeUserText(data.name, 60) || "API token"}, ${minted.prefix}, ${minted.hash}, ${scopes.join(",")})`;
      await persistSecurityEvent(sql, {
        userId: context.userId,
        action: "api_token.create",
        risk: "normal",
        ip: g.ip,
        detail: {
          id,
          scopes
        }
      });
      await audit(sql, context.userId, "api_token.create", "api_token", id, { scopes });
      return {
        ok: true,
        id,
        token: minted.raw,
        prefix: minted.prefix
      };
    });

export const revokeApiToken = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
      const sql = await ctxSql(context);
      await sql`update api_tokens set revoked_at = now() where id = ${boundedString(data.id, 64)} and user_id = ${context.userId} and revoked_at is null`;
      await persistSecurityEvent(sql, {
        userId: context.userId,
        action: "api_token.revoke",
        risk: "normal",
        detail: { id: data.id }
      });
      return { ok: true };
    });

export const compareSearchRuns = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const prevId = boundedString(data.prevId, 64);
  const nextId = boundedString(data.nextId, 64);
  const owned = await sql`select id from search_runs where user_id = ${context.userId} and id in (${prevId}, ${nextId})`;
  if (owned.length < 2 && prevId !== nextId) return { ok: false, error: "Not found", added: [], removed: [], kept: [] };
  const prev = await sql`select company_id from run_companies where user_id = ${context.userId} and run_id = ${prevId}`;
  const next = await sql`select company_id from run_companies where user_id = ${context.userId} and run_id = ${nextId}`;
  const diff = compareRunSets(prev.map((r) => r.company_id), next.map((r) => r.company_id));
  return { ok: true, ...diff, prevCount: prev.length, nextCount: next.length };
});

export const getSearchHealth = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  if (!(await ensurePlatformIdentity(sql, context.userId)).isAdmin) return { ok: false, error: "Admin only" };
  await ensureSearchHardeningSchema(sql);
  const today = await sql`
    select
      count(*)::int as searches,
      count(*) filter (where status in ('completed','running'))::int as successful,
      count(*) filter (where status = 'failed')::int as failed,
      coalesce(avg(duration_ms),0)::int as avg_ms,
      coalesce(percentile_cont(0.95) within group (order by duration_ms),0)::int as p95_ms,
      coalesce(avg(duplicate_ratio),0)::float as duplicate_ratio,
      coalesce(avg(case when final_count > 0 then previously_seen_count::float / final_count else 0 end),0)::float as repeat_rate,
      count(*) filter (where exhausted)::int as exhausted
    from search_health_events
    where created_at > now() - interval '1 day'`;
  const csv = await sql`
    select count(*)::int as n,
      count(*) filter (where created_at > now() - interval '1 day')::int as today
    from exports`;
  const queue = await sql`select count(*)::int as n from jobs where status in ('queued','running')`;
  const cronConfigured = Boolean(process.env.CRON_SECRET?.trim());
  const recent = await sql`
    select e.id, e.run_id, e.duration_ms, e.candidate_count, e.final_count, e.new_leads_count, e.previously_seen_count,
      e.duplicate_ratio, e.novelty_avg, e.exhausted, coalesce(r.status, e.status) as status, e.created_at, e.ranking_version, e.query_fingerprint
    from search_health_events e
    left join search_runs r on r.id = e.run_id
    order by e.created_at desc limit 40`;
  const t = today[0] ?? {};
  let queueSnap = null;
  let queueHistory = [];
  try {
    queueSnap = await snapshotQueueDepth(sql);
    queueHistory = await sql`
      select taken_at, queued, running, depth, oldest_queued_ms, child_crawls, stale_running, users, runs, pressure, pruned, stolen, by_type
      from worker_queue_snapshots order by taken_at desc limit 12`;
  } catch { /* snapshots optional */ }
  let production = null;
  try {
    await sql`select 1`;
    production = buildProductionHealth({
      databaseOk: true,
      queuePressure: queueSnap?.pressure ?? null,
    });
  } catch {
    production = buildProductionHealth({ databaseOk: false, queuePressure: queueSnap?.pressure ?? null });
  }
  return {
    ok: true,
    searchesToday: t.searches ?? 0,
    successful: t.successful ?? 0,
    failed: t.failed ?? 0,
    avgLatencyMs: t.avg_ms ?? 0,
    p95LatencyMs: t.p95_ms ?? 0,
    duplicateRate: t.duplicate_ratio ?? 0,
    repeatedLeadRate: t.repeat_rate ?? 0,
    exhausted: t.exhausted ?? 0,
    csvToday: csv[0]?.today ?? 0,
    csvTotal: csv[0]?.n ?? 0,
    queueDepth: queueSnap?.depth ?? queue[0]?.n ?? 0,
    queue: queueSnap,
    queueHistory,
    cronConfigured,
    recent,
    production,
    fabric: {
      routeHealth: resolveRoute("/admin/search").ok,
      stall: classifyStall({
        queued: queueSnap?.queued ?? 0,
        running: queueSnap?.running ?? 0,
        workerHeartbeatMs: 1_000,
        sourceTimeoutRate: 0,
        discoverComplete: true,
      }),
      recommendations: recommendCapacity({
        p95Ms: Number(t.p95_ms ?? 0),
        queueDepth: queueSnap?.depth ?? 0,
        workerUtilization: queueSnap?.running ? Math.min(1, (queueSnap.running as number) / 16) : 0,
        sourceTimeoutRate: 0,
      }),
      load: {
        x1: { concurrentSearches: 1 },
      },
      vercel: { ...vercelRuntimeInfo(), ...executionPlane() },
      cache: cacheStats(),
    },
  };
});

export const confirmBilling = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await ctxSql(context);
  try {
    await pullStripePlanForUser(sql, context.userId, true);
  } catch {
    /* Stripe pull is best-effort */
  }
  return { ok: true };
});

export const saveLeadPrefs = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const prefs = parseLeadPrefs(data?.prefs);
  try {
    await sql`update workspaces set preferences = ${JSON.stringify(prefs)}::jsonb, updated_at = now() where user_id = ${context.userId}`;
  } catch (err) {
    return { ok: false, error: "Preferences could not be saved." };
  }
  return { ok: true, prefs };
});

export const getList = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const listId = boundedString(data.listId, 64);
  const list = (await sql`select id, name, description, rules from lists where id = ${listId} and user_id = ${context.userId}`)?.[0];
  if (!list) return { ok: false, error: "Not found", list: null, members: [] };
  const members = await sql`
    select c.id, c.name, c.municipality, c.business_id
    from list_members m join companies c on c.id = m.company_id
    where m.user_id = ${context.userId} and m.list_id = ${listId} and c.deleted_at is null
    order by c.name asc`;
  return { ok: true, list: { ...list, rules: parseListRules(list.rules) }, members };
});

export const updateList = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const listId = boundedString(data.listId, 64);
  const owned = (await sql`select id from lists where id = ${listId} and user_id = ${context.userId}`)?.[0];
  if (!owned) return { ok: false, error: "Not found" };
  const name = sanitizeUserText(data.name ?? "", 80);
  const description = sanitizeUserText(data.description ?? "", 400) || null;
  const rulesJson = JSON.stringify(parseListRules(data.rules));
  try {
    await sql`update lists set name = ${name || "List"}, description = ${description}, rules = ${rulesJson}::jsonb where id = ${listId} and user_id = ${context.userId}`;
  } catch {
    await sql`update lists set name = ${name || "List"}, description = ${description} where id = ${listId} and user_id = ${context.userId}`;
  }
  return { ok: true };
});

export const fillList = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  const listId = boundedString(data.listId, 64);
  const owned = (await sql`select id, rules from lists where id = ${listId} and user_id = ${context.userId}`)?.[0];
  if (!owned) return { ok: false, error: "Not found", added: 0, skipped: 0 };
  const runId = data.runId ? boundedString(data.runId, 64) : "";
  const rules = parseListRules(data.rules ?? owned.rules);
  const industry = boundedString(rules.industry, 40);
  const municipality = boundedString(rules.municipality, 80);
  const country = boundedString(rules.country, 8);
  const minRev = rules.minRevenue ?? 0;
  const minMatch = rules.minMatchScore ?? 0;
  let ids = [];
  if (runId) {
    const ownedRun = (await sql`select id from search_runs where id = ${runId} and user_id = ${context.userId}`)?.[0];
    if (!ownedRun) return { ok: false, error: "Search not found", added: 0, skipped: 0 };
    ids = await sql`select c.id from run_companies rc join companies c on c.id = rc.company_id
      where rc.user_id = ${context.userId} and rc.run_id = ${runId} and c.deleted_at is null
        and coalesce(c.name, '') <> ''
        and (${industry} = '' or c.industry_code like ${industry + "%"} or coalesce(c.industry_label,'') ilike ${"%" + industry + "%"})
        and (${municipality} = '' or coalesce(c.municipality,'') ilike ${"%" + municipality + "%"})
        and (${country} = '' or coalesce(c.country,'FI') = ${country})
        and (${rules.requireWebsite ? 1 : 0} = 0 or c.website is not null)
        and (${rules.requireEmail ? 1 : 0} = 0 or c.general_email is not null)
        and (${rules.requirePhone ? 1 : 0} = 0 or c.phone is not null)
        and (${minRev} = 0 or coalesce(c.revenue, 0) >= ${minRev})
        and (${minMatch} = 0 or coalesce(c.match_score, 0) >= ${minMatch})
        and (${rules.matchedOnly ? 1 : 0} = 0 or (
          coalesce(c.match_score, 0) > 0
          and coalesce(c.record_status,'') not in ('rejected','excluded','failed')
        ))
        and (${rules.requireDecisionMaker ? 1 : 0} = 0 or exists (
          select 1 from people p where p.user_id = c.user_id and p.company_id = c.id and p.deleted_at is null
        ))
      order by coalesce(c.match_score, 0) desc, c.updated_at desc
      limit 500`;
  } else {
    ids = await sql`select co.id from companies co
      where co.user_id = ${context.userId} and co.deleted_at is null
        and coalesce(co.name, '') <> ''
        and (${industry} = '' or co.industry_code like ${industry + "%"} or coalesce(co.industry_label,'') ilike ${"%" + industry + "%"})
        and (${municipality} = '' or coalesce(co.municipality,'') ilike ${"%" + municipality + "%"})
        and (${country} = '' or coalesce(co.country,'FI') = ${country})
        and (${rules.requireWebsite ? 1 : 0} = 0 or co.website is not null)
        and (${rules.requireEmail ? 1 : 0} = 0 or co.general_email is not null)
        and (${rules.requirePhone ? 1 : 0} = 0 or co.phone is not null)
        and (${minRev} = 0 or coalesce(co.revenue, 0) >= ${minRev})
        and (${minMatch} = 0 or coalesce(co.match_score, 0) >= ${minMatch})
        and (${rules.requireDecisionMaker ? 1 : 0} = 0 or exists (
          select 1 from people p where p.user_id = co.user_id and p.company_id = co.id and p.deleted_at is null
        ))
      order by co.updated_at desc
      limit 500`;
  }
  let added = 0;
  for (const row of ids) {
    const ins = await sql`insert into list_members (user_id, list_id, company_id) values (${context.userId}, ${listId}, ${row.id}) on conflict do nothing returning company_id`;
    if (ins[0]) added += 1;
  }
  return { ok: true, added, skipped: Math.max(0, ids.length - added) };
});

export const removeFromList = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  await sql`delete from list_members where user_id = ${context.userId} and list_id = ${boundedString(data.listId, 64)} and company_id = ${boundedString(data.companyId, 64)}`;
  return { ok: true };
});

export const adminListUsers = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d ?? {}).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  return listPlatformUsers(sql, context.userId, boundedString(data?.q ?? "", 80));
});

export const adminCreateUser = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  return createPlatformUser(sql, context.userId, data ?? {});
});

export const adminGiftPlan = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  return giftWorkspacePlan(sql, context.userId, data?.userId, data?.plan);
});

export const adminGrantAdmin = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const sql = await ctxSql(context);
  return grantAdminByUserId(sql, context.userId, data?.userId);
});
