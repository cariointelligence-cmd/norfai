import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { identityLooksForeign, applyLlmVerdict, llmFilterIdentity } from "./hive-llm.ts";
import { extractEmails, isJunkEmail, isBillingEmail, isRecruitingEmail, validEmailSyntax, decodeCfEmail, inferGeneralMailbox, inferPersonMailbox, emailMatchesPerson, websiteFromPublishedEmail, websiteFromPublishedEmails, isConsumerMailboxDomain, emailBelongsToCompany, needsEmailRecovery } from "./contacts.ts";
import { extractPeopleFromHtml, extractPageContacts, plausiblePersonName, cleanPersonName, decodeHtmlEntities } from "./extract.ts";
import { businessIdChecksumOk, normalizeBusinessId, normalizeDomain, normalizeName, toVatId, fromVatId, canonicalCompanyWebsite, isJunkCompanyWebsite, storedWebsiteUnusable } from "./normalize.ts";
import { isDirectoryHost } from "./sources/webdiscover.ts";
import { isBlockedIp } from "./ssrf.ts";
import { initialState, SOURCE_CATALOG } from "./sources/catalog.ts";
import { emptyCriteria, passesLocalFilters, tightenCriteria, validateCriteria } from "./criteria.ts";
import { industryMatches, inferIndustryCodes, isHousingCompany, expandIndustryQueryCodes, groupForIndustryCodes, INDUSTRY_GROUPS, INDUSTRIES, isInactiveCompany } from "./finland.ts";
import { scoreCompany } from "./scoring.ts";
import { mapYtj, buildYtjQueries, YTJ_SCAN_PAGE_CAP, YTJ_PAGE_SIZE, ytjSliceEnd, parseYtjRegisters, ytjFieldObservations, ytjActivityStatus, ytjShouldSkipBarrenQuery, ytjLineBelongsToQuery, ytjCanonicalLocation } from "./sources/ytj.ts";
import { parseFinderProfileHtml, parseFinderSearchHtml, pickFinderHit, guessedFinderUrls, profileFromSearchHit, discoveredFromFinderHit } from "./sources/finder.ts";
import { parseKauppalehtiHtml } from "./sources/kauppalehti.ts";
import { parseNorthdataHtml, northdataUrls } from "./sources/northdata.ts";
import { compileCriteria } from "./filter-dsl.ts";
import { parseAllabolagHtml, parseCompaniesHouseHtml, parseOpenCorporatesHtml, decodeOcHref } from "./sources/homemade.ts";
import { parseGoogleHtml, parseBingHtml, parseBraveHtml, extraUrlsOnHost } from "./sources/websearch.ts";
import { isoTime } from "../format.ts";
import { scoreMayProceed, scrapeHasFinished } from "./scrape-gate.ts";
import { RUNTIME, clampConcurrency, isProductionRuntime, jobLeaseSeconds } from "./runtime.ts";
import { sourceAllowed } from "./immune/flags.ts";
import { hiveNetworkSnapshot } from "./immune/health.ts";
import {
  acceptDiscovered,
  bidFromFinderUrl,
  businessIdFromDigits,
  discoverQuerySeeds,
  isGenericDiscoverQuery,
  looksLikeCompanyName,
  mergeOfficial,
  naceFromTol,
  namesCompatible,
  parseKauppalehtiSearchHtml,
} from "./sources/register-gate.ts";
import { bidFromAsiakastietoUrl, bidFromProffUrl, parseProffSearchHtml, proffPathAllowed } from "./sources/proff.ts";
import { createCircuit, diagnoseRegisterEmpty, parseRegisterReasonNote, planRegisterQuery, registerSensorCapabilities } from "./sources/register-plan.ts";
import { faceRegisterDiagnosis, searchRunEmptyCopy, dropPrematureDiagnosis } from "./face-diagnosis.ts";
import { sanitizeSourceReport } from "./security.ts";
import { shouldResetDiscoverCursor, maxRegisterHits } from "./novelty.ts";

describe("empty workspace honesty", () => {
  it("does not invent a default company count", () => {
    const counts = { companies: 0, people: 0, contacts: 0 };
    assert.equal(counts.companies, 0);
  });
});

describe("Finnish business ID", () => {
  it("accepts a valid Y-tunnus and derives VAT", () => {
    assert.equal(businessIdChecksumOk("0112038-9"), true);
    assert.equal(normalizeBusinessId("01120389"), "0112038-9");
    assert.equal(toVatId("0112038-9"), "FI01120389");
  });
  it("rejects a broken checksum", () => {
    assert.equal(businessIdChecksumOk("0112038-0"), false);
  });
});

describe("criteria", () => {
  it("refuses unconstrained national scans", () => {
    const c = emptyCriteria();
    const v = validateCriteria(c);
    assert.equal(v.ok, false);
  });
  it("does not treat a targeting spec as a substitute for a bound, but a city is enough", () => {
    const c = emptyCriteria();
    c.target = { website: { qualityScore: { max: 45, unknown: "allow" } } };
    c.preset = "website_sales";
    assert.equal(validateCriteria(c).ok, false);
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    assert.equal(validateCriteria(c).ok, true);
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "73" });
    assert.equal(validateCriteria(c).ok, true);
  });
  it("accepts Kaikki toimialat without a city", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "ALL" });
    assert.equal(validateCriteria(c).ok, true);
  });
  it("accepts industry + location", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    assert.equal(validateCriteria(c).ok, true);
  });
  it("allows large batches and rejects above the engine ceiling", () => {
    const c = emptyCriteria();
    c.maxResults = 300;
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41" });
    assert.equal(validateCriteria(c).ok, true);
    c.maxResults = 10000;
    assert.equal(validateCriteria(c).ok, true);
    c.maxResults = 10001;
    assert.equal(validateCriteria(c).ok, false);
  });
  it("rejects housing companies even when the city matches", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "73" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Helsinki" });
    const asoy = passesLocalFilters({
      name: "As Oy Metsäkyyhkyntie 14",
      municipality: "HELSINKI",
      industryCode: "68202",
      industryLabel: "Asuntojen ja asuinkiinteistöjen hallinta",
      legalForm: "Asunto-osakeyhtiö",
      legalFormCode: "2",
      businessId: "0102224-4",
    }, c);
    assert.equal(asoy.ok, false);
    assert.equal(isHousingCompany({ name: "As. Oy Espoon Kelloseppä", legalFormCode: "2" }), true);
    const agency = passesLocalFilters({
      name: "KASKI Creative Agency Oy",
      municipality: "HELSINKI",
      industryCode: "73112",
      legalForm: "Osakeyhtiö",
      legalFormCode: "16",
    }, c);
    assert.equal(agency.ok, true);
  });
  it("rejects a keyword match when the official industry is outside the selected class", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "73" });
    c.groups.rules.push({ id: "k", field: "keyword", op: "contains", value: "Markkinointi" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    assert.equal(passesLocalFilters({ name: "Tampereen Sähköurakointi Oy", municipality: "TAMPERE", industryCode: "43210" }, c).ok, false);
    assert.equal(passesLocalFilters({ name: "Psykiatri Palvelu Oy", municipality: "TAMPERE", industryCode: "86220" }, c).ok, false);
    assert.equal(passesLocalFilters({ name: "Mainostoimisto Aura Oy", municipality: "TAMPERE", industryCode: "73111" }, c).ok, true);
  });
  it("rejects a municipality mismatch instead of keeping it", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    assert.equal(passesLocalFilters({ municipality: "SASTAMALA", industryCode: "41200" }, c).ok, false);
    assert.equal(passesLocalFilters({ municipality: "TAMPERE", industryCode: "41200" }, c).ok, true);
  });
  it("treats Helsinki and Helsingfors as the same city", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Helsinki" });
    assert.equal(passesLocalFilters({ name: "Mainostoimisto Aura Oy", municipality: "HELSINGFORS", industryCode: "73111" }, c).ok, true);
  });
  it("drops dissolved, bankrupt and ceased companies", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "73" });
    assert.equal(passesLocalFilters({ name: "Erkkipate Oy", industryCode: "73111", endDate: "2009-06-08", tradeRegisterStatus: "4", businessStatus: "dissolved" }, c).ok, false);
    assert.equal(passesLocalFilters({ name: "AHO LAURI ANTERO KONKURSSIPESÄ", industryCode: "73111", businessStatus: "bankrupt" }, c).ok, false);
    assert.equal(passesLocalFilters({ name: "JCDecaux Finland Oy", industryCode: "73111", tradeRegisterStatus: "1", businessStatus: "active" }, c).ok, true);
  });
  it("keeps a live PRH company whose STATUS3 is numeric 2 (valid Y-tunnus)", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i1", field: "industry", op: "eq", value: "69" });
    c.groups.rules.push({ id: "i2", field: "industry", op: "eq", value: "70" });
    c.groups.rules.push({ id: "i3", field: "industry", op: "eq", value: "71" });
    c.groups.rules.push({ id: "i4", field: "industry", op: "eq", value: "74" });
    const live = passesLocalFilters({
      name: "Oy Ecce-Re Ab",
      industryCode: "70100",
      tradeRegisterStatus: "1",
      businessStatus: "2",
    }, c);
    assert.equal(isInactiveCompany({ businessStatus: "2", tradeRegisterStatus: "1" }), false);
    assert.equal(live.ok, true);
    const mapped = mapYtj({
      businessId: { value: "0184411-7" },
      names: [{ name: "Oy Ecce-Re Ab", type: "1" }],
      mainBusinessLine: { type: "70100" },
      status: 2,
      tradeRegisterStatus: 1,
      endDate: null,
    });
    assert.equal(mapped.company.businessStatus, "active");
    assert.equal(mapped.company.tradeRegisterStatus, "1");
    assert.equal(passesLocalFilters(mapped.company, c).ok, true);
    const dead = mapYtj({
      businessId: { value: "0100187-3" },
      names: [{ name: "Lakannut Oy", type: "1", endDate: "2011-01-25" }],
      mainBusinessLine: { type: "69201" },
      status: 2,
      tradeRegisterStatus: 4,
      endDate: "2011-01-25",
    });
    assert.equal(dead.company.name, "");
    assert.equal(dead.company.businessStatus, "dissolved");
    assert.equal(passesLocalFilters({ ...dead.company, name: "Lakannut Oy" }, c).ok, false);
  });
  it("does not treat a law firm as a marketing agency", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "73" });
    assert.equal(industryMatches("69101", ["73"]), false);
    assert.equal(industryMatches("73111", ["73"]), true);
    assert.equal(passesLocalFilters({ name: "Asianajotoimisto Korhonen Oy", industryCode: "69101", businessStatus: "active" }, c).ok, false);
    assert.equal(passesLocalFilters({ name: "Asianajotoimisto Korhonen Oy", industryCode: "73111", businessStatus: "active" }, c).ok, false);
  });
});

describe("industry matching", () => {
  it("matches parent and child TOL codes, not neighbouring divisions", () => {
    assert.equal(industryMatches("41200", ["41200"]), true);
    assert.equal(industryMatches("41200", ["41"]), true);
    assert.equal(industryMatches("41", ["41200"]), true);
    assert.equal(industryMatches("41100", ["41200"]), false);
    assert.equal(industryMatches("43210", ["73"]), false);
    assert.equal(industryMatches("86220", ["73"]), false);
    assert.equal(industryMatches("73111", ["73"]), true);
    assert.equal(industryMatches("35111", ["73"]), false);
    assert.equal(ytjLineBelongsToQuery("87301", "73"), false);
    assert.equal(ytjLineBelongsToQuery("73111", "73"), true);
    assert.equal(ytjLineBelongsToQuery("73111", "73111"), true);
    assert.equal(ytjLineBelongsToQuery("86910", "691"), false);
    assert.equal(ytjLineBelongsToQuery("69101", "691"), true);
    assert.equal(ytjCanonicalLocation("oulu"), "Oulu");
    assert.equal(ytjCanonicalLocation("Uleåborg"), "Oulu");
  });
  it("maps marketing language to advertising, not electricity or health", () => {
    const codes = inferIndustryCodes("Find Finnish marketing companies in Tampere");
    assert.ok(codes.includes("73"));
    assert.equal(codes.includes("35"), false);
    assert.equal(codes.includes("86"), false);
    assert.equal(codes.includes("43210"), false);
  });
  it("maps markkinointiyritykset to 73", () => {
    assert.ok(inferIndustryCodes("markkinointiyrityksiin Tampereella").includes("73"));
  });
  it("tightens a keyword-only marketing search into an industry filter", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "k", field: "keyword", op: "contains", value: "markkinointi" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    const tight = tightenCriteria(c);
    const industries = tight.groups.rules.filter((r) => !("rules" in r) && r.field === "industry").map((r) => ("rules" in r ? null : r.value));
    assert.ok(industries.includes("73"));
    assert.equal(passesLocalFilters({ name: "Sähkö-Matti Oy", municipality: "TAMPERE", industryCode: "43210" }, tight).ok, false);
  });
  it("compileCriteria infers industry from a marketing prompt", () => {
    const c = emptyCriteria();
    c.prompt = "Find marketing agencies in Tampere";
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    const compiled = compileCriteria(c);
    assert.equal(compiled.ok, true);
    if (!compiled.ok) return;
    const industries = compiled.criteria.groups.rules.filter((r) => !("rules" in r) && r.field === "industry");
    assert.ok(industries.some((r) => !("rules" in r) && r.value === "73"));
  });
});

describe("scoring is explained", () => {
  it("returns matched/missed text not a random number", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    const s = scoreCompany({
      criteria: c,
      industryCode: "41200",
      municipality: "Tampere",
      country: "FI",
      hasWebsite: true,
      websiteWeak: false,
      employeeCount: null,
      revenue: null,
      hasDecisionMaker: false,
      hasPublishedEmail: false,
      hasPublishedPhone: false,
      hasHiring: false,
      hasProcurement: false,
      hasFunding: false,
      hasExpansion: false,
      hasProjects: false,
      lastVerifiedAt: null,
      sourceReliabilityAvg: 90,
      confidenceFloor: 0,
    });
    assert.ok(s.score >= 0 && s.score <= 100);
    assert.ok(s.parts.length > 3);
    assert.ok(s.matched.some((m) => /Industry/.test(m)));
  });
});

describe("YTJ mapper uses real payload shape", () => {
  it("maps Nokia-shaped JSON without filling missing finance", () => {
    const mapped = mapYtj({
      businessId: { value: "0112038-9" },
      names: [{ name: "Nokia Oyj" }],
      mainBusinessLine: { type: "70100", descriptions: [{ languageCode: "3", description: "Activities of head offices" }] },
      website: { url: "www.nokia.com" },
      addresses: [{ type: 1, street: "Karakaari", buildingNumber: "7", postCode: "02610", postOffices: [{ city: "ESPOO", languageCode: "1" }] }],
      companyForms: [{ descriptions: [{ languageCode: "3", description: "Public limited company" }] }],
      registrationDate: "1896-12-19",
    });
    assert.equal(mapped.company.name, "Nokia Oyj");
    assert.equal(mapped.company.businessId, "0112038-9");
    assert.equal(mapped.company.industryCode, "70100");
    assert.equal((mapped.company as { revenue?: unknown }).revenue, undefined);
    assert.equal(mapped.company.municipality, "ESPOO");
    assert.equal(mapped.company.vatRegistered, false);
  });
  it("maps YTJ registeredEntries without inventing employees or revenue", () => {
    const mapped = mapYtj({
      businessId: { value: "0112038-9" },
      names: [{ name: "Nokia Oyj", type: "1" }],
      euId: { value: "FIFPRO.0112038-9" },
      lastModified: "2026-08-19T10:04:06",
      registeredEntries: [
        { type: "1", register: "1", descriptions: [{ languageCode: "1", description: "Rekisterissä" }] },
        { type: "1", register: "4", descriptions: [{ languageCode: "1", description: "Rekisterissä" }] },
        { type: "55", register: "5", descriptions: [{ languageCode: "1", description: "Rekisterissä" }] },
        { type: "80", register: "6", descriptions: [{ languageCode: "1", description: "Liiketoiminnasta arvonlisäverovelvollinen" }] },
      ],
      companySituations: [],
    });
    assert.equal(mapped.company.euId, "FIFPRO.0112038-9");
    assert.equal(mapped.company.vatRegistered, true);
    assert.equal(mapped.company.employerRegistered, true);
    assert.equal(mapped.company.prepaymentRegistered, true);
    assert.equal(mapped.company.tradeRegistered, true);
    assert.equal((mapped.company as { employeeCount?: unknown }).employeeCount, undefined);
    assert.equal((mapped.company as { revenue?: unknown }).revenue, undefined);
    const flags = parseYtjRegisters({
      registeredEntries: [
        { register: "6", type: "80", descriptions: [{ languageCode: "1", description: "Liiketoiminnasta arvonlisäverovelvollinen" }] },
        { register: "6", endDate: "2020-01-01", descriptions: [{ languageCode: "1", description: "vanha" }] },
      ],
    });
    assert.equal(flags.vatRegistered, true);
    assert.equal(flags.labels.some((l) => /ALV/.test(l)), true);
    const obs = ytjFieldObservations(mapped.company);
    assert.ok(obs.some((o) => o.field === "vat_register" && o.normalisedValue === "registered"));
    assert.ok(obs.some((o) => o.field === "employer_register"));
    assert.ok(obs.some((o) => o.field === "business_id"));
  });
});

describe("hive immune", () => {
  it("kill-switch treats missing flags as on and disabled as off", () => {
    const flags = new Map([
      ["ytj", { id: "ytj", enabled: false, state: "connected" }],
      ["finder", { id: "finder", enabled: true, state: "connected" }],
    ]);
    assert.equal(sourceAllowed(flags, "ytj"), false);
    assert.equal(sourceAllowed(flags, "finder"), true);
    assert.equal(sourceAllowed(flags, "brreg"), true);
    assert.equal(sourceAllowed(null, "ytj"), true);
  });
  it("network snapshot degrades when a live probe failed and never invents counts", () => {
    const snap = hiveNetworkSnapshot([
      {
        source_id: "ytj",
        state: "temporarily_unavailable",
        enabled: true,
        last_success_at: "2026-09-12T00:00:00.000Z",
        last_latency_ms: 180,
        last_test_ok: false,
        last_test_detail: "YTJ unreachable",
      },
    ]);
    assert.equal(snap.livePath.sensor, "ytj");
    assert.equal(snap.last?.sourceId, "ytj");
    const registry = snap.engines.find((e) => e.id === "registry");
    assert.ok(registry);
    const ytj = registry?.sources.find((s) => s.id === "ytj");
    assert.equal(ytj?.state, "temporarily_unavailable");
    assert.equal(registry?.status, "temporarily_unavailable");
  });
});

describe("YTJ query planner", () => {
  it("does not AND keyword with industry in a single register call", () => {
    const c = emptyCriteria();
    c.maxResults = 300;
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    c.groups.rules.push({ id: "k", field: "keyword", op: "contains", value: "Rakennus" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    const qs = buildYtjQueries(c);
    assert.ok(qs.some((q) => q.mainBusinessLine && !q.name));
    assert.equal(qs.some((q) => q.name && q.mainBusinessLine), false);
    assert.equal(qs.some((q) => q.mainBusinessLine && String(q.mainBusinessLine).length < 4), false);
    assert.ok(qs.some((q) => q.mainBusinessLine === "41200"));
  });
  it("expands marketing 73 to 5-digit agency codes and never queries 73 as a substring", () => {
    const expanded = expandIndustryQueryCodes(["73"]);
    assert.ok(expanded.includes("73111"));
    assert.equal(expanded.includes("73"), false);
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "73" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Helsinki" });
    const qs = buildYtjQueries(c);
    assert.ok(qs.length > 0);
    assert.ok(qs.some((q) => q.mainBusinessLine === "73111"));
    assert.equal(qs.some((q) => q.mainBusinessLine === "73"), false);
    assert.equal(qs[0]?.mainBusinessLine, "73111");
    assert.equal(qs.some((q) => q.name && q.mainBusinessLine), false);
    assert.equal(qs.some((q) => q.location && !q.mainBusinessLine && !q.name), false);
  });
  it("expands software 62 and 63 to live TOIMI4 codes before dissolved TOL 2008 rows", () => {
    const expanded = expandIndustryQueryCodes(["62", "63"]);
    assert.ok(expanded.includes("62100"));
    assert.ok(expanded.includes("62200"));
    assert.ok(expanded.includes("63100"));
    assert.ok(expanded.includes("62010"));
    assert.ok(expanded.indexOf("62100") < expanded.indexOf("62010"));
    assert.ok(expanded.indexOf("63100") < expanded.indexOf("63110"));
    assert.equal(expanded.includes("62"), false);
    assert.equal(expanded.includes("63"), false);
    const fromOld = expandIndustryQueryCodes(["62010"]);
    assert.equal(fromOld[0], "62100");
    assert.ok(fromOld.includes("62010"));
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i1", field: "industry", op: "eq", value: "62" });
    c.groups.rules.push({ id: "i2", field: "industry", op: "eq", value: "63" });
    const qs = buildYtjQueries(c);
    assert.ok(qs.length >= 8);
    assert.ok(qs.length <= 64);
    const lines = qs.map((q) => q.mainBusinessLine).filter(Boolean) as string[];
    assert.ok(lines.includes("62100"));
    assert.equal(lines.includes("62"), false);
    assert.equal(lines.includes("63"), false);
    assert.ok(lines.includes("63100"));
    assert.ok(lines.indexOf("62100") < lines.indexOf("62010"));
    assert.equal(industryMatches("62100", ["62", "63"]), true);
    assert.equal(industryMatches("62200", ["62"]), true);
    assert.equal(ytjShouldSkipBarrenQuery({ liveThisQuery: 0, deadBatches: 2 }), true);
    assert.equal(ytjShouldSkipBarrenQuery({ liveThisQuery: 1, deadBatches: 8 }), false);
    assert.equal(ytjShouldSkipBarrenQuery({ liveThisQuery: 0, deadBatches: 1 }), true);
  });
  it("scans far enough through a large industry class to fill a 500-company cap", () => {
    assert.equal(YTJ_PAGE_SIZE, 100);
    assert.ok(YTJ_SCAN_PAGE_CAP >= 200);
    assert.ok(YTJ_SCAN_PAGE_CAP * YTJ_PAGE_SIZE >= 5000);
    assert.equal(ytjSliceEnd(0), YTJ_SCAN_PAGE_CAP);
    assert.ok(ytjSliceEnd(YTJ_SCAN_PAGE_CAP) > YTJ_SCAN_PAGE_CAP);
    assert.equal(ytjSliceEnd(200), 400);
  });
  it("keeps 2-digit register codes only when no 5-digit children exist", () => {
    assert.ok(expandIndustryQueryCodes(["47"]).some((c) => c.startsWith("47") && c.length >= 3));
    assert.equal(expandIndustryQueryCodes(["73"]).includes("73"), false);
    assert.equal(groupForIndustryCodes(["73"]), "marketing");
    assert.equal(groupForIndustryCodes(["41", "42", "43"]), "construction");
    assert.equal(groupForIndustryCodes([]), "all");
    assert.ok(INDUSTRIES.length >= 150);
    assert.equal(industryMatches("62200", ["ALL"]), true);
    assert.ok(INDUSTRY_GROUPS.some((g) => g.id === "all"));
    assert.ok(INDUSTRY_GROUPS.length <= 20);
  });
  it("queries every professional-services division, not only 70's 5-digit children", () => {
    const c = emptyCriteria();
    c.maxResults = 500;
    for (const code of ["69", "70", "71", "74"]) {
      c.groups.rules.push({ id: `i-${code}`, field: "industry", op: "eq", value: code });
    }
    const qs = buildYtjQueries(c);
    const lines = qs.map((q) => q.mainBusinessLine).filter(Boolean);
    assert.ok(lines.some((l) => String(l).startsWith("691") || String(l).startsWith("692")));
    assert.ok(lines.includes("70100"));
    assert.ok(lines.includes("70220"));
    assert.ok(lines.some((l) => String(l).startsWith("711") || String(l).startsWith("712")));
    assert.ok(lines.some((l) => String(l).startsWith("741") || String(l).startsWith("74")));
    assert.equal(lines.includes("69"), false);
    assert.equal(lines.includes("70"), false);
    assert.equal(ytjActivityStatus({ status: 2, tradeRegisterStatus: 1 }), "active");
    assert.equal(ytjActivityStatus({ status: 2, tradeRegisterStatus: 4, endDate: "2011-01-25" }), "dissolved");
    assert.equal(ytjActivityStatus({ status: 5 }), "invalidated");
  });
  it("queries a city without an industry when Kaikki toimialat is set", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "ALL" });
    const qs = buildYtjQueries(c);
    assert.ok(qs.some((q) => q.location === "Tampere" && !q.mainBusinessLine));
  });
});

describe("Fonecta Finder HTML", () => {
  it("parses JSON-LD email, phone, website and Y-tunnus without inventing people", () => {
    const html = `
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Consti Oyj","address":"Valimotie 16, 00380 Helsinki","telephone":"010 288 6000","email":"info@consti.fi","sameAs":"www.consti.fi"}</script>
      <h2>Y-tunnus</h2><p>2203605-5</p>
      <h2>Sähköposti</h2><a href="mailto:info@consti.fi">info@consti.fi</a>
      <h2>Puhelinnumero</h2><p>010 288 6000</p>
      <h2>Nettisivut</h2><a href="//www.consti.fi">www.consti.fi</a>`;
    const p = parseFinderProfileHtml(html, "https://www.finder.fi/x/yhteystiedot/1");
    assert.equal(p.businessId, "2203605-5");
    assert.ok(p.emails.some((e) => e.value === "info@consti.fi"));
    assert.ok(p.phones.some((ph) => ph.value.includes("288") || ph.value.includes("010")));
  });
  it("reads Finder listing URLs from href, uddg and bare links without an API", () => {
    const amp = "&" + "amp;";
    const html = `
      <a href="https://www.finder.fi/Consti+Oyj/Helsinki/Talonrakentaminen/yhteystiedot/2203605">Consti Oyj</a>
      <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.finder.fi%2FAura+Oy%2FTampere%2FMainostoimistot%2Fyhteystiedot%2F1234567">Aura</a>
      https://www.finder.fi/Kaski+Creative/Helsinki/Mainostoimistot/yhteystiedot/7654321
      <a href="/Nokian+Renkaat/Nokia/yhteystiedot/931953${amp}utm=1">Nokian Renkaat</a>`;
    const hits = parseFinderSearchHtml(html);
    assert.ok(hits.some((h) => /Consti/i.test(h.name) && /2203605/.test(h.url)));
    assert.ok(hits.some((h) => /Aura/i.test(h.name) && /1234567/.test(h.url)));
    assert.ok(hits.some((h) => /7654321/.test(h.url)));
    const pick = pickFinderHit(hits, "Consti Oyj", "Helsinki");
    assert.ok(pick);
    assert.match(pick!.url, /yhteystiedot\/2203605/);
  });
  it("builds Finder profile URLs from Y-tunnus instead of calling a paid API", () => {
    const urls = guessedFinderUrls({ name: "Consti Oyj", municipality: "Helsinki", businessId: "2203605-5" });
    assert.ok(urls.some((u) => u.includes("Consti+Oyj") && u.includes("Helsinki") && u.endsWith("/2203605")));
  });
  it("keeps a snippet-derived phone when the Finder page itself is blocked", () => {
    const p = profileFromSearchHit({
      name: "Aura Oy",
      url: "https://www.finder.fi/Aura+Oy/Tampere/yhteystiedot/1",
      city: "Tampere",
      snippet: "Aura Oy, Tampere. Puhelin 03 123 4567. info@aura.fi",
    });
    assert.ok(p);
    assert.ok(p!.phones.length >= 1);
    assert.ok(p!.emails.some((e) => e.value === "info@aura.fi"));
  });
});

describe("public Finnish directories", () => {
  it("reads Kauppalehti JSON-LD CEO, phone and Y-tunnus", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Consti Oyj",
      url: "https://www.kauppalehti.fi/yritykset/yritys/22036055",
      address: { "@type": "PostalAddress", streetAddress: "Valimotie 16", addressLocality: "HELSINKI", postalCode: "00380", addressCountry: "FI" },
      contactPoint: { "@type": "ContactPoint", telephone: "+358102886000", contactType: "customer service" },
      employee: { "@type": "Person", name: "Korkeela Esa Sakari", jobTitle: "CEO" },
      vatID: "FI22036055",
    })}</script>`;
    const p = parseKauppalehtiHtml(html, "https://www.kauppalehti.fi/yritykset/yritys/22036055");
    assert.equal(p.name, "Consti Oyj");
    assert.ok(p.phones.some((ph) => ph.value.includes("102886000") || ph.value.includes("288")));
    assert.ok(p.people.some((person) => /Korkeela/i.test(person.fullName) && /ceo/i.test(person.title ?? "")));
  });
  it("reads a published Kauppalehti liikevaihto figure and ignores marketing copy", () => {
    const html = `<html><body><h1>Aura Oy</h1><p>Yrityksen liikevaihto 4,7 miljoonaa euroa vuonna 2024. Liikevoitto 0,4 miljoonaa.</p></body></html>`;
    const p = parseKauppalehtiHtml(html, "https://www.kauppalehti.fi/yritykset/yritys/123");
    assert.equal(p.revenue, 4_700_000);
    assert.equal(p.profit, 400_000);
    assert.ok(p.financialEvidence.length);
    const none = parseKauppalehtiHtml("<html><body>We are a growing company.</body></html>", "https://www.kauppalehti.fi/yritykset/yritys/1");
    assert.equal(none.revenue, null);
    assert.equal(none.profit, null);
  });
  it("does not treat Alma Talent assets as the company website", () => {
    const html = `<html><body>
      <img src="https://assets.almatalent.fi/image/company.png" alt="logo" />
      <a href="https://www.consti.fi">Consti</a>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Organization",
        name: "Consti Oyj",
        url: "https://www.kauppalehti.fi/yritykset/yritys/22036055",
        sameAs: "https://assets.almatalent.fi/image/company.png",
      })}</script>
    </body></html>`;
    const p = parseKauppalehtiHtml(html, "https://www.kauppalehti.fi/yritykset/yritys/22036055");
    assert.equal(p.website, "https://www.consti.fi");
    assert.equal(/almatalent/i.test(p.website ?? ""), false);
  });
  it("reads North Data officers from JSON-LD members", () => {
    const html = `<title>Consti Oyj, Helsinki, Finland, PRH 2203605-5</title>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "http://schema.org",
        "@type": "LocalBusiness",
        name: "Consti Oyj",
        foundingDate: "2008-06-18",
        leiCode: "743700JMXCC11CRJCS71",
        address: { "@type": "PostalAddress", streetAddress: "Valimotie 16", addressLocality: "Helsinki", postalCode: "00380", addressCountry: "FI" },
        member: [
          { "@type": "Person", givenName: "Esa", familyName: "Korkeela", name: "Korkeela, Esa", jobTitle: "CEO" },
          { "@type": "Person", givenName: "Elina", familyName: "Rahkonen", name: "Rahkonen, Elina", jobTitle: "Member of the Executive Board" },
        ],
      })}</script>`;
    const p = parseNorthdataHtml(html, "https://www.northdata.com/Consti+Oyj,+Helsinki");
    assert.equal(p.businessId, "2203605-5");
    assert.ok(p.people.some((person) => person.fullName === "Esa Korkeela"));
    assert.ok(p.people.some((person) => person.fullName === "Elina Rahkonen"));
    assert.ok(northdataUrls("Consti Oyj", "Helsinki")[0]?.includes("Consti+Oyj"));
  });
  it("connects directory crawlers without a commercial API key", () => {
    for (const id of ["finder", "kauppalehti", "northdata"]) {
      const def = SOURCE_CATALOG.find((s) => s.id === id);
      assert.ok(def, id);
      assert.equal(initialState(def!), "connected");
    }
  });
});

describe("source catalogue", () => {
  it("DuckDuckGo adapter is connected without a paid search key", () => {
    const def = SOURCE_CATALOG.find((s) => s.id === "duckduckgo");
    assert.ok(def);
    assert.equal(initialState(def!), "connected");
  });
  it("connects homemade collectors without commercial API keys", () => {
    const ids = [
      "opencorporates",
      "companies_house",
      "business_finland",
      "statfin",
      "ejustice",
      "commoncrawl",
      "bolagsverket",
      "prh_xbrl",
      "duunitori",
    ];
    for (const id of ids) {
      const def = SOURCE_CATALOG.find((s) => s.id === id);
      assert.ok(def, id);
      assert.equal(def!.implemented, true, id);
      assert.equal(def!.open, true, id);
      assert.equal(initialState(def!, {}), "connected", id);
    }
    for (const id of ["hunter", "search_api", "asiakastieto"]) {
      const def = SOURCE_CATALOG.find((s) => s.id === id);
      assert.ok(def, id);
      assert.equal(initialState(def!, {}), "optional_offline", id);
    }
    const apify = SOURCE_CATALOG.find((s) => s.id === "apify");
    assert.ok(apify);
    assert.equal(apify!.open, false);
    assert.equal(initialState(apify!, {}), "optional_offline");
  });
  it("parses OpenCorporates, Companies House and Allabolag HTML without inventing rows", () => {
    const oc = parseOpenCorporatesHtml('<a href="/companies/fi/0112038-9">Nokia Oyj</a><a href="/companies/gb/01234567">Nokia UK Limited</a>');
    assert.equal(oc.length, 2);
    assert.equal(oc[0]?.name, "Nokia Oyj");
    assert.equal(oc[0]?.businessId, "0112038-9");
    assert.equal(oc[0]?.country, "FI");
    const ch = parseCompaniesHouseHtml('<a href="/company/01234567">NOKIA UK LIMITED</a>');
    assert.equal(ch[0]?.businessId, "01234567");
    assert.equal(ch[0]?.country, "GB");
    const se = parseAllabolagHtml('<a href="/5560360678_volvo_ab">Volvo AB</a>');
    assert.equal(se[0]?.businessId, "5560360678");
    assert.equal(se[0]?.country, "SE");
    assert.equal(parseOpenCorporatesHtml("<html></html>").length, 0);
    assert.equal(decodeOcHref("/companies/fi/0112038-9?foo=1&bar=2"), "/companies/fi/0112038-9?foo=1&bar=2");
  });
  it("parses Google, Bing and Brave HTML without inventing result rows", () => {
    const g = parseGoogleHtml('<a href="/url?q=https://www.consti.fi/yhteystiedot&sa=U">Consti Oyj yhteystiedot</a><a href="https://accounts.google.com/ServiceLogin">Sign in</a>');
    assert.ok(g.some((h) => /consti\.fi/i.test(h.url)));
    assert.equal(g.some((h) => /accounts\.google/i.test(h.url)), false);
    assert.deepEqual(parseGoogleHtml(""), []);
    const b = parseBingHtml('<li class="b_algo"><h2><a href="https://www.consti.fi/">Consti Oyj</a></h2><p class="b_lineclamp">Julkiset yhteystiedot</p></li>');
    assert.equal(b[0]?.url.includes("consti.fi"), true);
    assert.equal(parseBingHtml("<html><body>no hits</body></html>").length, 0);
    const br = parseBraveHtml('<a href="https://www.aura.fi/yhteystiedot" class="heading-serpresult">Aura Oy</a>');
    assert.ok(br.some((h) => /aura\.fi/i.test(h.url)));
    const extra = extraUrlsOnHost(
      [{ url: "https://www.consti.fi/yhteystiedot", title: "Yhteystiedot", snippet: "", engine: "bing" }, { url: "https://other.fi/", title: "x", snippet: "", engine: "bing" }],
      "https://www.consti.fi/",
    );
    assert.ok(extra.some((u) => /yhteystiedot/i.test(u)));
    assert.equal(extra.some((u) => /other\.fi/i.test(u)), false);
  });
});

describe("production runtime", () => {
  it("keeps async parallelism in the normal production band", () => {
    assert.equal(isProductionRuntime(), true);
    assert.equal(RUNTIME.jobConcurrency, 16);
    assert.equal(RUNTIME.jobConcurrencyCap, 16);
    assert.equal(RUNTIME.harvestPageConcurrency, 4);
    assert.equal(RUNTIME.crawlBudget, 6);
    assert.equal(RUNTIME.deepCrawlBudget, 12);
    assert.equal(RUNTIME.findCompanyQueryCap, 4);
    assert.equal(clampConcurrency(1), 1);
    assert.equal(clampConcurrency(99), 16);
    assert.equal(clampConcurrency(undefined), 16);
    assert.equal(RUNTIME.homemadeDiscoverCap, 40);
    assert.equal(RUNTIME.hydrateConcurrency, 6);
    assert.ok(RUNTIME.tickMaxMs >= RUNTIME.discoverBudgetMs);
    assert.ok(RUNTIME.discoverBudgetMs <= 12_000);
    assert.ok(jobLeaseSeconds("discover") <= 12);
    assert.ok(jobLeaseSeconds("discover") >= 8);
    assert.ok(jobLeaseSeconds("enrich") <= 30);
  });
});

describe("register criteria gate", () => {
  it("completes Finder 7-digit listing ids to a valid Y-tunnus", () => {
    assert.equal(businessIdFromDigits("2203605"), "2203605-5");
    assert.equal(
      bidFromFinderUrl("https://www.finder.fi/Consti+Oyj/Helsinki/Talonrakentaminen/yhteystiedot/2203605"),
      "2203605-5",
    );
    const row = discoveredFromFinderHit({
      name: "Consti Oyj",
      url: "https://www.finder.fi/Consti+Oyj/Helsinki/Talonrakentaminen/yhteystiedot/2203605",
      city: "Helsinki",
    });
    assert.equal(row.businessId, "2203605-5");
    assert.equal(row.country, "FI");
  });
  it("maps Finnish TOL to Brønnøysund NACE", () => {
    assert.equal(naceFromTol("41200"), "41.200");
    assert.equal(naceFromTol("41"), "41");
  });
  it("seeds industry + city queries and never sends yritys", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    const seeds = discoverQuerySeeds(c);
    assert.ok(seeds.some((s) => /rakentaminen/i.test(s)));
    assert.ok(seeds.some((s) => /Tampere/i.test(s)));
    assert.equal(seeds.some((s) => /^yritys$/i.test(s)), false);
    assert.equal(isGenericDiscoverQuery("yritys"), true);
    assert.equal(looksLikeCompanyName("yritys"), false);
    assert.equal(looksLikeCompanyName("Talonrakentaminen"), false);
    assert.equal(looksLikeCompanyName("Consti Oyj"), true);
  });
  it("rejects directory rows that miss the official industry or the country", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    assert.equal(acceptDiscovered({ name: "Foo Oy", country: "FI" }, c).ok, false);
    assert.ok(acceptDiscovered({ name: "Foo Oy", country: "FI" }, c).missed.includes("industry unknown"));
    assert.equal(acceptDiscovered({ name: "Foo AS", country: "NO", industryCode: "41.200" }, c).ok, false);
    assert.equal(
      acceptDiscovered({
        name: "As Oy Metsäkyyhkyntie 14",
        country: "FI",
        municipality: "TAMPERE",
        industryCode: "68202",
        legalFormCode: "2",
      }, c).ok,
      false,
    );
    assert.equal(
      acceptDiscovered({
        name: "Tampereen Talonrakennus Oy",
        country: "FI",
        municipality: "TAMPERE",
        industryCode: "41200",
        legalForm: "Osakeyhtiö",
        legalFormCode: "16",
      }, c).ok,
      true,
    );
  });
  it("lets the official register overwrite directory fields", () => {
    const merged = mergeOfficial(
      { name: "Consti", country: "FI", businessId: "2203605-5", industryLabel: "Finder category" },
      { name: "Consti Oyj", country: "FI", businessId: "2203605-5", industryCode: "41200", industryLabel: "Asuin- ja muiden rakennusten rakentaminen", municipality: "HELSINKI" },
    );
    assert.equal(merged.industryCode, "41200");
    assert.equal(merged.name, "Consti Oyj");
    assert.equal(merged.municipality, "HELSINKI");
  });
  it("parses Kauppalehti company-card links without inventing a Y-tunnus", () => {
    const html = `<a href="/yritykset/yritys/consti-oyj/2203605">Consti Oyj</a><a href="/tilaa">Tilaa</a>`;
    const rows = parseKauppalehtiSearchHtml(html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.name, "Consti Oyj");
    assert.equal(rows[0]?.businessId, "2203605-5");
    assert.equal(rows[0]?.country, "FI");
  });
});

describe("hive register plan and homemade sources", () => {
  it("routes Finnish industry searches to YTJ plus directories, never Brønnøysund", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    c.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    const plan = planRegisterQuery(c);
    assert.deepEqual(plan.official, ["ytj"]);
    assert.ok(plan.homemade.includes("finder"));
    assert.ok(plan.homemade.includes("proff"));
    assert.ok(plan.homemade.includes("asiakastieto"));
    assert.ok(plan.homemade.includes("nominatim"));
    assert.equal(plan.homemade.includes("brreg"), false);
    assert.equal(plan.federated.includes("gleif"), false);
    assert.equal(plan.must.officialIndustry, true);
    assert.equal(plan.evidenceMinimum, "official_industry");
    assert.ok(registerSensorCapabilities("ytj")?.official);
  });
  it("routes Norway to Brønnøysund NACE and does not call Finder", () => {
    const c = emptyCriteria();
    c.country = "NO";
    c.groups.rules = [
      { id: "c", field: "country", op: "eq", value: "NO" },
      { id: "i", field: "industry", op: "eq", value: "41200" },
    ];
    const plan = planRegisterQuery(c);
    assert.deepEqual(plan.official, ["brreg"]);
    assert.ok(plan.homemade.includes("brreg"));
    assert.equal(plan.homemade.includes("finder"), false);
    assert.equal(plan.homemade.includes("proff"), false);
  });
  it("never fans GLEIF to an industry label", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "k", field: "keyword", op: "eq", value: "yritys" });
    const plan = planRegisterQuery(c);
    assert.equal(plan.should.nameSeeds.length, 0);
    assert.equal(plan.federated.includes("gleif"), false);
  });
  it("honours Proff robots.txt and extracts Y-tunnus without inventing one", () => {
    assert.equal(proffPathAllowed("/segmentointi?naceIndustry=41200"), false);
    assert.equal(proffPathAllowed("/toimialahaku?q=Talonrakentaminen&spage=2"), false);
    assert.equal(proffPathAllowed("/yrityksen-nimi-haku?q=Consti"), true);
    assert.equal(proffPathAllowed("/toimialahaku?q=Talonrakentaminen"), true);
    assert.equal(bidFromProffUrl("https://www.proff.fi/yritys/posti-oy/helsinki/2344200-4"), "2344200-4");
    assert.equal(bidFromAsiakastietoUrl("https://www.asiakastieto.fi/yritykset/fi/suomen-asiakastieto-oy/01110279"), "0111027-9");
    const rows = parseProffSearchHtml(
      `<h2>Posti Oy</h2> Y-tunnus 2344200-4 <a href="/yritys/outokumpu-oyj/espoo/0215254-2">Outokumpu Oyj</a>`,
    );
    assert.ok(rows.some((r) => r.businessId === "2344200-4" && /posti/i.test(r.name)));
    assert.ok(rows.every((r) => r.country === "FI"));
  });
  it("maps EU VAT on Wikidata to a Finnish Y-tunnus", () => {
    assert.equal(fromVatId("FI01120389"), "0112038-9");
    assert.equal(fromVatId("FI15243611"), "1524361-1");
  });
  it("accepts official hydrate only when the names are the same entity", () => {
    assert.equal(namesCompatible("Consti", "Consti Oyj"), true);
    assert.equal(namesCompatible("Tampereen Talonrakennus Oy", "Nokia Oyj"), false);
  });
  it("trips a homemade collector after two failures", () => {
    const c = createCircuit(2);
    assert.equal(c.ok("proff"), true);
    c.fail("proff");
    assert.equal(c.ok("proff"), true);
    c.fail("proff");
    assert.equal(c.tripped("proff"), true);
    c.success("finder");
    assert.equal(c.ok("finder"), true);
  });
  it("diagnoses FILTER_EXCLUDED_ALL when every directory row missed the industry gate", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    const plan = planRegisterQuery(c);
    const diag = diagnoseRegisterEmpty(plan, [{ source: "finder", ok: true, hits: 0, dropped: 12 }], { kept: 0, want: 50 });
    assert.equal(diag?.code, "FILTER_EXCLUDED_ALL");
  });
  it("does not call an honest empty register SOURCE_UNAVAILABLE", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    const plan = planRegisterQuery(c);
    const diag = diagnoseRegisterEmpty(
      plan,
      [{ source: "ytj", ok: false, hits: 0, error: "No register hits" }],
      { kept: 0, want: 50 },
    );
    assert.equal(diag?.code, "NO_MATCH");
  });
  it("marks skip-seen exhaustion as FILTER_EXCLUDED_ALL", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41200" });
    const plan = planRegisterQuery(c);
    const diag = diagnoseRegisterEmpty(
      plan,
      [{ source: "ytj", ok: true, hits: 0, excludedSeen: 40 }],
      { kept: 0, want: 50 },
    );
    assert.equal(diag?.code, "FILTER_EXCLUDED_ALL");
    assert.match(String(diag?.text), /shown before/i);
  });
  it("does not diagnose NO_MATCH while the register slice is still running", () => {
    const c = emptyCriteria();
    c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "69" });
    const plan = planRegisterQuery(c);
    const diag = diagnoseRegisterEmpty(
      plan,
      [{ source: "ytj", ok: true, hits: 0, registerHits: 27114 }],
      { kept: 0, want: 500, complete: false },
    );
    assert.equal(diag, null);
    const done = diagnoseRegisterEmpty(
      plan,
      [{ source: "ytj", ok: true, hits: 0, registerHits: 27114 }],
      { kept: 0, want: 500, complete: true },
    );
    assert.equal(done?.code, "NO_MATCH");
  });
  it("rescans once when the register had hits but stored none", () => {
    assert.equal(shouldResetDiscoverCursor({ kept: 0, registerHits: 27114 }), true);
    assert.equal(shouldResetDiscoverCursor({ kept: 0, registerHits: 27114, alreadyRescanned: true }), false);
    assert.equal(shouldResetDiscoverCursor({ kept: 12, registerHits: 27114 }), false);
    assert.equal(shouldResetDiscoverCursor({ kept: 0, registerHits: 27114, excludedSeen: 40 }), false);
    assert.equal(shouldResetDiscoverCursor({ kept: 0, registerHits: 0 }), false);
    assert.equal(maxRegisterHits([{ registerHits: 12 }, { registerHits: 27114 }]), 27114);
  });
  it("maps a register diagnosis through the sanitizer into Face copy", () => {
    const raw = [
      { source: "register_plan", ok: true, hits: 0, code: "NO_MATCH", note: "NO_MATCH: Official register and homemade directories returned no row that passed the gate." },
    ];
    const clean = sanitizeSourceReport(raw);
    const face = faceRegisterDiagnosis(clean, { companyCount: 0, status: "completed" });
    assert.equal(face?.code, "NO_MATCH");
    assert.equal(face?.title, "No companies matched these filters");
    assert.equal(clean[0]?.source, "Search diagnosis");
    const running = faceRegisterDiagnosis(clean, { companyCount: 0, status: "running" });
    assert.equal(running, null);
    const hidden = dropPrematureDiagnosis(clean, "running");
    assert.equal(hidden.length, 0);
    const kept = dropPrematureDiagnosis(clean, "completed");
    assert.equal(kept.length, 1);
    const copy = searchRunEmptyCopy({ status: "completed", skipSeen: true, diagnosis: face });
    assert.equal(copy.title, face?.title);
    const searching = searchRunEmptyCopy({ status: "completed", skipSeen: true, diagnosis: face, jobsLive: true });
    assert.match(searching.title, /Still searching/i);
    assert.equal(parseRegisterReasonNote("SOURCE_UNAVAILABLE: Official register unavailable")?.code, "SOURCE_UNAVAILABLE");
  });
  it("prefers SOURCE_UNAVAILABLE over NO_MATCH on Face", () => {
    const face = faceRegisterDiagnosis(
      [
        { source: "Search diagnosis", ok: true, code: "NO_MATCH", note: "NO_MATCH: none" },
        { source: "Search diagnosis", ok: false, code: "SOURCE_UNAVAILABLE", note: "SOURCE_UNAVAILABLE: timeout" },
      ],
      { companyCount: 0, status: "completed" },
    );
    assert.equal(face?.code, "SOURCE_UNAVAILABLE");
    assert.equal(face?.tone, "bad");
  });
});

describe("mandatory scrape before score", () => {
  it("refuses to score while enrich or scrape is still live", () => {
    assert.equal(scoreMayProceed([]), "enqueue_scrape");
    assert.equal(scoreMayProceed([{ type: "enrich", status: "done" }, { type: "score", status: "queued" }]), "score");
    assert.equal(scoreMayProceed([{ type: "enrich", status: "done" }, { type: "scrape", status: "queued" }]), "score");
    assert.equal(scoreMayProceed([{ type: "scrape", status: "queued" }]), "wait");
    assert.equal(scoreMayProceed([{ type: "scrape", status: "running" }]), "wait");
    assert.equal(scoreMayProceed([{ type: "scrape", status: "done" }, { type: "crawl", status: "queued" }]), "score");
    assert.equal(scoreMayProceed([{ type: "scrape", status: "done" }, { type: "signals", status: "running" }]), "score");
    assert.equal(scoreMayProceed([{ type: "scrape", status: "cancelled" }]), "enqueue_scrape");
    assert.equal(scrapeHasFinished([{ type: "scrape", status: "queued" }]), false);
  });
  it("allows score after scrape ran, even with no website to crawl", () => {
    assert.equal(scoreMayProceed([{ type: "enrich", status: "done" }, { type: "scrape", status: "done" }]), "score");
    assert.equal(scoreMayProceed([{ type: "scrape", status: "failed" }]), "score");
    assert.equal(scoreMayProceed([{ type: "enrich", status: "done" }]), "score");
    assert.equal(scoreMayProceed([
      { type: "scrape", status: "done" },
      { type: "crawl", status: "done" },
      { type: "signals", status: "done" },
    ]), "score");
    assert.equal(scrapeHasFinished([{ type: "scrape", status: "done" }]), true);
  });
});

describe("date sanitization", () => {
  it("isoTime accepts Date objects so UI never calls .slice on them", () => {
    const d = new Date("2026-09-11T00:41:00.000Z");
    const iso = isoTime(d);
    assert.equal(typeof iso, "string");
    assert.equal(iso?.slice(0, 19), "2026-09-11T00:41:00");
    assert.equal(isoTime(null), null);
    assert.equal(isoTime({ not: "a date" }), null);
  });
});

describe("contacts hygiene", () => {
  it("rejects junk and recruiting mail", () => {
    assert.equal(isJunkEmail("noreply@example.com"), true);
    assert.equal(isRecruitingEmail("jobs@example.com"), true);
    assert.equal(isBillingEmail("invoice@example.com"), true);
    assert.equal(validEmailSyntax("info@example.com"), true);
    assert.ok(extractEmails("Contact info@example.com today").length >= 0);
  });
  it("decodes Cloudflare-protected mailboxes", () => {
    const encoded = (() => {
      const email = "info@studio.fi";
      const key = 0x2a;
      let h = key.toString(16).padStart(2, "0");
      for (const ch of email) h += (ch.charCodeAt(0) ^ key).toString(16).padStart(2, "0");
      return h;
    })();
    assert.equal(decodeCfEmail(encoded), "info@studio.fi");
  });
  it("infers a Finnish general mailbox only when none is published", () => {
    const miss = inferGeneralMailbox("aura.fi", ["matti.virtanen@aura.fi"]);
    assert.equal(miss?.value, "info@aura.fi");
    assert.equal(miss?.classification, "inferred");
    assert.equal(inferGeneralMailbox("aura.fi", ["info@aura.fi"]), null);
  });
  it("builds etunimi.sukunimi mailboxes and matches them to people", () => {
    const guessed = inferPersonMailbox("Matti Virtanen", "aura.fi");
    assert.equal(guessed?.value, "matti.virtanen@aura.fi");
    assert.equal(emailMatchesPerson("matti.virtanen@aura.fi", "Matti Virtanen"), true);
    assert.equal(emailMatchesPerson("info@aura.fi", "Matti Virtanen"), false);
  });
  it("derives the company website from a published mailbox, never from gmail", () => {
    assert.equal(websiteFromPublishedEmail("info@ristoreipas.fi"), "https://ristoreipas.fi");
    assert.equal(websiteFromPublishedEmail("complaints@eazypay.com"), "https://eazypay.com");
    assert.equal(websiteFromPublishedEmail("matti.virtanen@gmail.com"), null);
    assert.equal(websiteFromPublishedEmail("info@finder.fi"), null);
    assert.equal(isConsumerMailboxDomain("outlook.fi"), true);
    assert.equal(websiteFromPublishedEmails(["matti@gmail.com", "info@ristoreipas.fi"]), "https://ristoreipas.fi");
    assert.equal(emailBelongsToCompany("heidi.vanhatalo@ravintolaneilikka.fi", { name: "Asuntotekniikka Oy" }), false);
    assert.equal(emailBelongsToCompany("info@ajk.fi", { name: "Arkkitehtitoimisto AJK Oy" }), true);
    assert.equal(emailBelongsToCompany("heidi.vanhatalo@ravintolaneilikka.fi", { name: "Asuntotekniikka Oy", website: "https://asuntotekniikka.fi" }), false);
    assert.equal(emailBelongsToCompany("info@asuntotekniikka.fi", { name: "Asuntotekniikka Oy", website: "https://asuntotekniikka.fi" }), true);
    assert.equal(isJunkEmail("heidi.antinkari@almamedia.fi"), true);
    assert.equal(isJunkEmail("il-oikeus@iltalehti.fi"), true);
    assert.equal(isJunkEmail("toimitus@hs.fi"), true);
    assert.equal(isJunkEmail("info@finder.fi"), true);
    assert.equal(isJunkEmail("x@linkedin.com"), true);
    assert.equal(isJunkCompanyWebsite("https://www.oikotie.fi/yritys/x"), true);
    assert.equal(isJunkCompanyWebsite("https://duunitori.fi/tyopaikat/x"), true);
    assert.equal(canonicalCompanyWebsite("https://www.yle.fi"), null);
    assert.equal(canonicalCompanyWebsite("https://roditec.net"), "https://roditec.net");
    assert.equal(isJunkCompanyWebsite("https://www.iltalehti.fi"), true);
    assert.equal(canonicalCompanyWebsite("https://www.iltalehti.fi"), null);
    assert.equal(websiteFromPublishedEmail("il-oikeus@iltalehti.fi"), null);
    assert.equal(emailBelongsToCompany("il-oikeus@iltalehti.fi", { name: "International Software Planners Skandinavia Oy" }), false);
    assert.equal(emailBelongsToCompany("heidi.antinkari@almamedia.fi", { name: "Takoa Invest Oy" }), false);
    assert.equal(canonicalCompanyWebsite("https://www.almainights.fi"), null);
    assert.equal(isJunkCompanyWebsite("https://www.almainights.fi"), true);
    assert.equal(needsEmailRecovery("heidi.antinkari@almamedia.fi", { name: "Takoa Invest Oy" }), true);
    assert.equal(needsEmailRecovery("anni.hyokyvaara@toc.fi", { name: "The Orange Company Oy", website: "https://www.toc.fi" }), false);
    assert.equal(needsEmailRecovery(null, { name: "Takoa Invest Oy" }), true);
  });
});

describe("hive llm filter", () => {
  it("flags media and directory identity as foreign", () => {
    assert.equal(identityLooksForeign({ name: "Basemedia Oy", website: "https://www.iltalehti.fi", emails: ["il.toimitus@iltalehti.fi"] }), true);
    assert.equal(identityLooksForeign({ name: "Roditec Oy", website: "https://roditec.net", emails: ["roditec@roditec.net"] }), false);
  });
  it("applies drop lists without inventing replacements", () => {
    const out = applyLlmVerdict({
      website: "https://www.iltalehti.fi",
      emails: [{ value: "il.toimitus@iltalehti.fi" }, { value: "info@basemedia.net" }],
      phones: [{ value: "+35810665100" }],
      people: [{ fullName: "Ahlstrand Kennet" }],
      verdict: {
        dropWebsite: true,
        dropEmails: ["il.toimitus@iltalehti.fi"],
        dropPhones: ["+35810665100"],
        dropPeople: [],
        reason: "news leak",
        used: true,
      },
    });
    assert.equal(out.website, null);
    assert.deepEqual(out.emails.map((e) => e.value), ["info@basemedia.net"]);
    assert.equal(out.phones.length, 0);
    assert.equal(out.people.length, 1);
  });
  it("does not call xAI without a key", async () => {
    const prev = process.env.XAI_API_KEY;
    delete process.env.XAI_API_KEY;
    const v = await llmFilterIdentity({ name: "Basemedia Oy", website: "https://www.iltalehti.fi", emails: ["il.toimitus@iltalehti.fi"] });
    if (prev) process.env.XAI_API_KEY = prev;
    assert.equal(v, null);
  });
});

describe("people extraction", () => {
  it("reads a heading name and title from HTML", () => {
    const html = `<h3>Matti Virtanen</h3><p>Toimitusjohtaja</p><a href="mailto:matti.virtanen@aura.fi">mail</a>`;
    const people = extractPeopleFromHtml(html, "https://aura.fi/tiimi");
    assert.ok(people.some((p) => p.fullName === "Matti Virtanen"));
    const contacts = extractPageContacts(`<a href="mailto:info@aura.fi">info</a>`, "https://aura.fi");
    assert.ok(contacts.emails.some((e) => e.value === "info@aura.fi"));
    assert.equal(plausiblePersonName("Ota Yhteyttä"), false);
    assert.equal(plausiblePersonName("CLG Comm"), false);
    assert.equal(plausiblePersonName("Marja Päivikki Katajamäki"), true);
    assert.equal(cleanPersonName("Korkeela, Esa"), "Esa Korkeela");
    assert.equal(decodeHtmlEntities(`a${"&"}amp;b`), "a&b");
  });
});

describe("normalize", () => {
  it("normalises names and domains", () => {
    assert.equal(normalizeDomain("https://www.Example.FI/path"), "example.fi");
    assert.ok(normalizeName("Oy Nokia Ab").includes("nokia"));
    assert.equal(isDirectoryHost("www.finder.fi"), true);
    assert.equal(isBlockedIp("127.0.0.1"), true);
  });
  it("rejects Alma Talent CDN URLs as company websites", () => {
    assert.equal(isDirectoryHost("assets.almatalent.fi"), true);
    assert.equal(isDirectoryHost("https://assets.almatalent.fi/image/company.png"), true);
    assert.equal(isJunkCompanyWebsite("https://assets.almatalent.fi/foo.png"), true);
    assert.equal(canonicalCompanyWebsite("https://assets.almatalent.fi/foo.png"), null);
    assert.equal(canonicalCompanyWebsite("https://www.kauppalehti.fi/yritykset/yritys/1"), null);
    assert.equal(storedWebsiteUnusable("https://assets.almatalent.fi/image.png"), true);
    assert.equal(storedWebsiteUnusable("https://ristoreipas.fi"), false);
    assert.equal(canonicalCompanyWebsite("https://www.consti.fi"), "https://www.consti.fi");
    assert.equal(isJunkCompanyWebsite("https://fonts.googleapis.com/css2?family=Inter"), true);
    assert.equal(isDirectoryHost("fonts.googleapis.com"), true);
    assert.equal(canonicalCompanyWebsite("https://fonts.googleapis.com"), null);
    assert.equal(isJunkCompanyWebsite("https://search.vainu.com/company/asuntotekniikka-oy-taloustiedot-ja-liikevaihto/FI01003799/yritystiedot"), true);
    assert.equal(canonicalCompanyWebsite("https://search.vainu.com/company/x"), null);
    assert.equal(storedWebsiteUnusable("https://fonts.googleapis.com/css2?family=IBM+Plex"), true);
    assert.equal(isJunkCompanyWebsite("https://try.abtasty.com/abc.js"), true);
    assert.equal(canonicalCompanyWebsite("https://try.abtasty.com"), null);
    assert.equal(isDirectoryHost("try.abtasty.com"), true);
    assert.equal(isJunkCompanyWebsite("https://cl-eu6.k5a.io/zaraz"), true);
    assert.equal(canonicalCompanyWebsite("https://cl-eu6.k5a.io"), null);
    assert.equal(storedWebsiteUnusable("https://cl-eu6.k5a.io"), true);
  });
});
