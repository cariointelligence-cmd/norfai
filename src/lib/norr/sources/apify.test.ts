import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { initialState, SOURCE_CATALOG, reliability } from "./catalog.ts";
import { provenanceLabel, sanitizeSourceReport, stripSecrets } from "../security.ts";
import { sourceAllowed } from "../immune/flags.ts";
import {
  APIFY_FINDER_FI_FALLBACK_ID,
  APIFY_FINDER_FI_ID,
  APIFY_GOOGLE_PLACES_ID,
  APIFY_SOURCE_ID,
  APIFY_TOOLS,
  __replaceApifyToolsForTests,
  __resetApifyStateForTests,
  __setApifyTransportForTests,
  __tripApifyCircuitForTests,
  apifyCircuitOpen,
  apifyConfigured,
  apifyHealth,
  apifyItemMatchesCompany,
  apifyUsageSnapshot,
  applyApifyEnrichment,
  buildApprovedApifyInput,
  clampApifyRunInput,
  findApifyTool,
  hasEnabledApifyTools,
  listApifyTools,
  normalizeApifyItem,
  planApifyEnrichment,
  runApprovedApifyTool,
  scrubApifyText,
  selectPreferredFact,
  validateApifyInput,
  type ApifyToolDef,
} from "./apify.ts";
import type { HttpJson } from "../http.ts";

const TOKEN = "apify_api_TESTONLY_do_not_leak";

function sampleTool(over: Partial<ApifyToolDef> = {}): ApifyToolDef {
  return {
    connectorId: "test-actor",
    actorId: "example~website-scraper",
    name: "Test actor",
    useCases: ["contact_enrichment"],
    identityFields: ["businessId", "name", "domain"],
    inputMap: {},
    outputMap: {},
    requiredPermissions: [],
    costClass: "low",
    freshnessTtlMs: 60_000,
    timeoutMs: 20_000,
    retryMax: 1,
    maxItems: 10,
    sourceAuthority: 48,
    complianceNotes: "test only",
    enabled: true,
    ...over,
  };
}

function ok<T>(data: T, url = "https://api.apify.com/v2"): HttpJson<T> {
  return { ok: true, status: 200, url, data, latencyMs: 2 };
}

function fail(status: number, error: string): HttpJson<never> {
  return { ok: false, status, url: "https://api.apify.com/v2", error, latencyMs: 2 };
}

describe("apify platform adapter", () => {
  let restoreEnv: string | undefined;

  beforeEach(() => {
    restoreEnv = process.env.APIFY_API;
    delete process.env.APIFY_API;
    __resetApifyStateForTests();
  });

  afterEach(() => {
    __resetApifyStateForTests();
    if (restoreEnv === undefined) delete process.env.APIFY_API;
    else process.env.APIFY_API = restoreEnv;
  });

  it("catalog is implemented licensed, standby without a key, never Face-open", () => {
    const def = SOURCE_CATALOG.find((s) => s.id === "apify");
    assert.ok(def);
    assert.equal(def!.implemented, true);
    assert.equal(def!.open, false);
    assert.equal(def!.credentialEnv, "APIFY_API");
    assert.equal(initialState(def!, {}), "optional_offline");
    assert.equal(initialState(def!, { APIFY_API: TOKEN }), "connected");
    assert.equal(reliability("apify") < reliability("ytj"), true);
    assert.equal(reliability("apify") < reliability("website"), true);
  });

  it("ships three named Actors and stays Face-closed", () => {
    assert.equal(APIFY_TOOLS.length, 4);
    assert.equal(hasEnabledApifyTools(), true);
    const ids = listApifyTools().map((t) => t.connectorId);
    assert.deepEqual(ids, [APIFY_FINDER_FI_ID, APIFY_FINDER_FI_FALLBACK_ID, APIFY_GOOGLE_PLACES_ID, "leads-finder"]);
    assert.equal(findApifyTool(APIFY_FINDER_FI_ID)?.actorId, "solidcode~finder-fi-scraper");
    assert.equal(findApifyTool(APIFY_FINDER_FI_FALLBACK_ID)?.actorId, "agenscrape~finnish-business-finder-scraper");
    assert.equal(findApifyTool(APIFY_GOOGLE_PLACES_ID)?.actorId, "compass~crawler-google-places");
    assert.equal(findApifyTool(APIFY_GOOGLE_PLACES_ID)?.costClass, "high");
  });

  it("does not treat the adapter as a search engine or register", () => {
    assert.equal(provenanceLabel("apify"), "Public Web Evidence");
    assert.notEqual(provenanceLabel("apify"), provenanceLabel("ytj"));
  });

  it("redacts the secret from errors and sanitizer output", () => {
    const leaked = `Bearer ${TOKEN} APIFY_API failed`;
    const scrubbed = scrubApifyText(leaked, TOKEN);
    assert.equal(scrubbed.includes(TOKEN), false);
    assert.equal(scrubbed.includes("apify_api_"), false);
    assert.equal(scrubbed.includes("APIFY_API"), false);
    assert.equal(stripSecrets(`Missing credentials: ${TOKEN}`), "Internal detail withheld");
    assert.equal(stripSecrets("Missing APIFY_API"), "Internal detail withheld");
    const report = sanitizeSourceReport([
      { source: "apify", ok: false, error: `401 ${TOKEN}`, hits: 0 },
    ]);
    assert.equal(report[0]?.source, "Public Web Evidence");
    assert.equal(JSON.stringify(report).includes(TOKEN), false);
    assert.equal(JSON.stringify(report).includes("apify"), false);
    assert.equal(JSON.stringify(report).includes("APIFY_API"), false);
  });

  it("skips enrichment when contacts are already filled — no network call", async () => {
    process.env.APIFY_API = TOKEN;
    let calls = 0;
    __setApifyTransportForTests(async () => {
      calls += 1;
      return fail(500, "should not run");
    });
    const r = await applyApifyEnrichment({
      name: "Nokia Oyj",
      businessId: "0112038-9",
      website: "https://www.nokia.com",
      country: "FI",
      missing: { website: false, email: false, phone: false },
    });
    assert.equal("skipped" in r && r.skipped, true);
    if ("skipped" in r) assert.equal(r.reason, "already_filled");
    assert.equal(calls, 0);
    assert.equal(apifyUsageSnapshot().runs, 0);
  });

  it("refuses an unknown or disabled tool even with a secret", async () => {
    process.env.APIFY_API = TOKEN;
    let calls = 0;
    __setApifyTransportForTests(async () => {
      calls += 1;
      return fail(500, TOKEN);
    });
    const unknown = await runApprovedApifyTool({ connectorId: "not-registered", input: { q: "Nokia" } });
    assert.equal("skipped" in unknown && unknown.skipped, true);
    const restore = __replaceApifyToolsForTests([sampleTool({ enabled: false })]);
    try {
      const disabled = await runApprovedApifyTool({ connectorId: "test-actor", input: { q: "Nokia" } });
      assert.equal("skipped" in disabled && disabled.skipped, true);
    } finally {
      restore();
    }
    assert.equal(calls, 0);
  });

  it("honours the kill-switch without calling Apify", async () => {
    process.env.APIFY_API = TOKEN;
    const restore = __replaceApifyToolsForTests([sampleTool()]);
    let calls = 0;
    __setApifyTransportForTests(async () => {
      calls += 1;
      return fail(500, TOKEN);
    });
    try {
      const flags = new Map([["apify", { id: "apify", enabled: false, state: "connected" }]]);
      assert.equal(sourceAllowed(flags, APIFY_SOURCE_ID), false);
      const r = await runApprovedApifyTool({ connectorId: "test-actor", input: { q: "x" }, flags });
      assert.equal("skipped" in r && r.skipped, true);
      assert.equal(calls, 0);
    } finally {
      restore();
    }
  });

  it("does not start a run when the secret is missing", async () => {
    const restore = __replaceApifyToolsForTests([sampleTool()]);
    let calls = 0;
    __setApifyTransportForTests(async () => {
      calls += 1;
      return fail(500, "nope");
    });
    try {
      assert.equal(apifyConfigured(), false);
      const r = await runApprovedApifyTool({ connectorId: "test-actor", input: { q: "Nokia" } });
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.state, "optional_offline");
        assert.equal(JSON.stringify(r).includes(TOKEN), false);
        assert.equal(JSON.stringify(r).includes("APIFY_API"), false);
      }
      assert.equal(calls, 0);
    } finally {
      restore();
    }
  });

  it("opens the circuit and skips further runs", async () => {
    process.env.APIFY_API = TOKEN;
    const restore = __replaceApifyToolsForTests([sampleTool()]);
    let calls = 0;
    __setApifyTransportForTests(async () => {
      calls += 1;
      return fail(500, TOKEN);
    });
    try {
      __tripApifyCircuitForTests();
      assert.equal(apifyCircuitOpen(), true);
      const r = await runApprovedApifyTool({ connectorId: "test-actor", input: { q: "Nokia" } });
      assert.equal(r.ok, false);
      assert.equal(calls, 0);
      if (!r.ok) assert.equal(JSON.stringify(r).includes(TOKEN), false);
    } finally {
      restore();
    }
  });

  it("runs an approved tool through cache, provenance and secret-free output", async () => {
    process.env.APIFY_API = TOKEN;
    const restore = __replaceApifyToolsForTests([sampleTool()]);
    const calls: string[] = [];
    __setApifyTransportForTests(async (method, path) => {
      calls.push(`${method} ${path}`);
      if (method === "POST" && /\/runs/.test(path)) {
        return ok({ data: { id: "run-1" } });
      }
      if (method === "GET" && /actor-runs/.test(path)) {
        return ok({ data: { status: "SUCCEEDED", defaultDatasetId: "ds-1" } });
      }
      if (method === "GET" && /datasets/.test(path)) {
        return ok([
          { name: "Nokia Oyj", businessId: "0112038-9", website: "https://www.nokia.com" },
        ]);
      }
      return fail(404, `unexpected ${path} token=${TOKEN}`);
    });
    try {
      const first = await runApprovedApifyTool({
        connectorId: "test-actor",
        input: { startUrl: "https://www.nokia.com" },
      });
      assert.equal(first.ok, true);
      if (first.ok) {
        assert.equal(first.data.cached, false);
        assert.equal(first.data.items[0]?.businessId, "0112038-9");
        assert.equal(first.data.items[0]?.website, "https://www.nokia.com");
        assert.ok(first.observations.some((o) => o.field === "business_id"));
        assert.equal(first.observations[0]?.sourceReliability, reliability("apify"));
        assert.equal(JSON.stringify(first).includes(TOKEN), false);
        assert.equal(JSON.stringify(first).includes("APIFY_API"), false);
      }
      const second = await runApprovedApifyTool({
        connectorId: "test-actor",
        input: { startUrl: "https://www.nokia.com" },
      });
      assert.equal(second.ok, true);
      if (second.ok) assert.equal(second.data.cached, true);
      assert.equal(calls.filter((c) => c.startsWith("POST")).length, 1);
      assert.equal(apifyUsageSnapshot().cacheHits >= 1, true);
    } finally {
      restore();
    }
  });

  it("healthcheck is explicit and never leaks the token", async () => {
    const offline = await apifyHealth();
    assert.equal(offline.ok, false);
    assert.equal(offline.state, "optional_offline");
    process.env.APIFY_API = TOKEN;
    __setApifyTransportForTests(async (method, path) => {
      assert.equal(method, "GET");
      assert.equal(path, "/users/me");
      return ok({ data: { username: "norf", id: "u1" } });
    });
    const live = await apifyHealth();
    assert.equal(live.ok, true);
    assert.equal(live.detail.includes(TOKEN), false);
    assert.equal(JSON.stringify(live).includes(TOKEN), false);
  });

  it("drops junk sites and matches identity on business id", () => {
    const tool = sampleTool();
    const junk = normalizeApifyItem({ website: "https://fonts.googleapis.com/css2?family=Inter", name: "Nope" }, tool);
    assert.equal(junk?.website ?? null, null);
    const item = normalizeApifyItem(
      { name: "Nokia Oyj", businessId: "0112038-9", website: "https://www.nokia.com", email: "press@nokia.com" },
      tool,
    );
    assert.ok(item);
    const hit = apifyItemMatchesCompany(item!, { name: "Nokia Oyj", businessId: "0112038-9", website: "https://www.nokia.com" });
    assert.equal(hit.match, true);
    assert.equal(hit.rationale, "businessId");
    const miss = apifyItemMatchesCompany(item!, { name: "Asuntotekniikka Oy", businessId: "1234567-1" });
    assert.equal(miss.match, false);
  });

  it("never overwrites an official registry fact", () => {
    const clash = selectPreferredFact({ official: "Nokia Oyj", apify: "Nokia Inc", field: "name" });
    assert.equal(clash.value, "Nokia Oyj");
    assert.equal(clash.preferred, "official");
    assert.equal(clash.conflict, true);
    const fill = selectPreferredFact({ official: null, apify: "https://www.nokia.com", field: "website" });
    assert.equal(fill.preferred, "apify");
    assert.equal(fill.conflict, false);
  });

  it("plans Finder first and Maps only for a missing website, never both Finder Actors", () => {
    const gap = planApifyEnrichment({
      name: "Borenius Asianajotoimisto Oy",
      country: "FI",
      municipality: "Helsinki",
      missing: { website: true, email: true, phone: true },
    });
    assert.equal(gap.reason, "gap_fill");
    assert.deepEqual(gap.tools, [APIFY_FINDER_FI_ID, APIFY_GOOGLE_PLACES_ID]);
    assert.equal(gap.tools.includes(APIFY_FINDER_FI_FALLBACK_ID), false);
    const emailOnly = planApifyEnrichment({
      name: "Borenius Asianajotoimisto Oy",
      country: "FI",
      missing: { website: false, email: true, phone: false },
    });
    assert.deepEqual(emailOnly.tools, [APIFY_FINDER_FI_ID]);
    const se = planApifyEnrichment({
      name: "Volvo AB",
      country: "SE",
      missing: { website: true, email: true, phone: true },
    });
    assert.equal(se.reason, "out_of_coverage");
    assert.deepEqual(se.tools, []);
  });

  it("builds cost-capped Actor input and clamps a crawl-sized request", () => {
    const finder = findApifyTool(APIFY_FINDER_FI_ID)!;
    const input = buildApprovedApifyInput(finder, { name: "Nokia Oyj", municipality: "Espoo" });
    assert.deepEqual(input.keywords, ["Nokia Oyj"]);
    assert.equal(input.location, "Espoo");
    assert.equal(input.includePeople, false);
    assert.equal(input.maxResults, 3);
    const clamped = validateApifyInput(finder, {
      keywords: ["ravintola", "hotelli", "kahvila"],
      maxResults: 100000,
      includePeople: true,
    });
    assert.equal(clamped.ok, true);
    if (clamped.ok) {
      assert.deepEqual(clamped.value.keywords, ["ravintola"]);
      assert.equal(clamped.value.maxResults, 3);
      assert.equal(clamped.value.includePeople, false);
    }
    const places = findApifyTool(APIFY_GOOGLE_PLACES_ID)!;
    const maps = buildApprovedApifyInput(places, { name: "Nokia Oyj", municipality: "Espoo" });
    assert.deepEqual(maps.searchStringsArray, ["Nokia Oyj, Espoo"]);
    assert.equal(maps.maxCrawledPlacesPerSearch, 1);
    assert.equal(maps.scrapeContacts, false);
    assert.equal(maps.maxReviews, 0);
    assert.equal(maps.language, "fi");
    const mapsClamp = clampApifyRunInput(places, { searchStringsArray: ["a", "b"], maxCrawledPlacesPerSearch: 50, scrapeContacts: true });
    assert.equal(mapsClamp.maxCrawledPlacesPerSearch, 1);
    assert.equal(mapsClamp.scrapeContacts, false);
    assert.deepEqual(mapsClamp.searchStringsArray, ["a"]);
  });

  it("drops Finder listing URLs and Google Maps URLs as company websites", () => {
    const finder = findApifyTool(APIFY_FINDER_FI_ID)!;
    const listing = normalizeApifyItem({
      recordType: "company",
      name: "Nokia Oyj",
      businessId: "0112038-9",
      url: "https://www.finder.fi/Tietoliikenne/Nokia+Oyj/Espoo/yhteystiedot/123",
      website: "https://www.nokia.com",
      email: "press@nokia.com",
    }, finder);
    assert.equal(listing?.website, "https://www.nokia.com");
    const onlyListing = normalizeApifyItem({
      name: "Nokia Oyj",
      url: "https://www.finder.fi/Tietoliikenne/Nokia+Oyj/Espoo/yhteystiedot/123",
    }, finder);
    assert.equal(onlyListing?.website ?? null, null);
    const person = normalizeApifyItem({ recordType: "person", name: "Matti Meikalainen", email: "matti@nokia.com" }, finder);
    assert.equal(person, null);
    const maps = findApifyTool(APIFY_GOOGLE_PLACES_ID)!;
    const place = normalizeApifyItem({
      title: "Nokia Oyj",
      url: "https://www.google.com/maps/place/Nokia",
      website: "https://www.nokia.com",
      phoneUnformatted: "+358104448800",
      city: "Espoo",
      countryCode: "FI",
    }, maps);
    assert.equal(place?.name, "Nokia Oyj");
    assert.equal(place?.website, "https://www.nokia.com");
    assert.equal(place?.phone, "+358104448800");
  });

  it("runs Finder then skips Maps once a website is matched", async () => {
    process.env.APIFY_API = TOKEN;
    const posts: string[] = [];
    __setApifyTransportForTests(async (method, path) => {
      if (method === "POST" && /\/runs/.test(path)) {
        posts.push(path);
        return ok({ data: { id: `run-${posts.length}` } });
      }
      if (method === "GET" && /actor-runs/.test(path)) {
        return ok({ data: { status: "SUCCEEDED", defaultDatasetId: "ds-1" } });
      }
      if (method === "GET" && /datasets/.test(path)) {
        return ok([
          { name: "Nokia Oyj", businessId: "0112038-9", website: "https://www.nokia.com", email: "press@nokia.com" },
        ]);
      }
      return fail(404, `unexpected ${path}`);
    });
    const r = await applyApifyEnrichment({
      name: "Nokia Oyj",
      businessId: "0112038-9",
      country: "FI",
      municipality: "Espoo",
      missing: { website: true, email: true, phone: true },
    });
    assert.equal(r.ok, true);
    if (r.ok && !("skipped" in r && r.skipped)) {
      assert.equal(r.data[0]?.website, "https://www.nokia.com");
      assert.equal(r.data[0]?.email, "press@nokia.com");
    }
    assert.equal(posts.length, 1);
    assert.match(posts[0] ?? "", /solidcode~finder-fi-scraper/);
    assert.equal(posts.some((p) => /crawler-google-places|agenscrape/.test(p)), false);
  });

  it("falls back to the second Finder Actor only when the primary run fails", async () => {
    process.env.APIFY_API = TOKEN;
    const posts: string[] = [];
    __setApifyTransportForTests(async (method, path) => {
      if (method === "POST" && /\/runs/.test(path)) {
        posts.push(path);
        if (/solidcode~finder-fi-scraper/.test(path)) return fail(500, "primary down");
        return ok({ data: { id: "run-fb" } });
      }
      if (method === "GET" && /actor-runs/.test(path)) {
        return ok({ data: { status: "SUCCEEDED", defaultDatasetId: "ds-fb" } });
      }
      if (method === "GET" && /datasets/.test(path)) {
        return ok([
          { companyOfficialName: "Nokia Oyj", businessId: "0112038-9", companyUrl: "https://www.nokia.com", primaryPhone: "+358104448800" },
        ]);
      }
      return fail(404, "nope");
    });
    const r = await applyApifyEnrichment({
      name: "Nokia Oyj",
      businessId: "0112038-9",
      country: "FI",
      missing: { website: true, email: false, phone: true },
    });
    assert.equal(r.ok, true);
    if (r.ok && !("skipped" in r && r.skipped)) {
      assert.equal(r.data[0]?.website, "https://www.nokia.com");
      assert.equal(r.data[0]?.phone, "+358104448800");
    }
    assert.equal(posts.some((p) => /solidcode~finder-fi-scraper/.test(p)), true);
    assert.equal(posts.some((p) => /agenscrape~finnish-business-finder-scraper/.test(p)), true);
    assert.equal(posts.some((p) => /crawler-google-places/.test(p)), false);
  });
});
