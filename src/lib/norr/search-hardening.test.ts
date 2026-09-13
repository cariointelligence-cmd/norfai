import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalIdentity, normalizeLei, normalizeVatId, shouldAutoMerge, sameCanonicalCompany } from "./identity.ts";
import { decodeRunCursor, encodeRunCursor, paginationDuplicates, queryFingerprint, querySimilarity, RANKING_VERSION, uniqueIds, compareRunSets, legacyRunMeta, searchLabel } from "./fingerprint.ts";
import { collectHardExcludeBids, discoverPoolSize, discoverSliceComplete, discoverFillTarget, diversityPenalty, emptyNewLeadsMessage, exhaustionScore, finalRankScore, limitedNewWarning, mergeSourceReports, noveltyScore, shouldHardExclude, shouldResumeDiscover, showEmptyNewBanner, skipPreviouslyShown } from "./novelty.ts";
import { emptyCriteria } from "./criteria.ts";
import { ENGINE_SEARCH_CEILING } from "./platform.ts";
import { escapeCsv, projectCsvRows, rowsToCsv } from "./exporters.ts";
import { compareEntities } from "./dedupe.ts";
import { normalizeName } from "./normalize.ts";

function construction(): ReturnType<typeof emptyCriteria> {
  const c = emptyCriteria();
  c.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41" });
  c.groups.rules.push({ id: "r1", field: "revenue_min", op: "gte", value: 1_000_000 });
  c.groups.rules.push({ id: "r2", field: "revenue_max", op: "lte", value: 10_000_000 });
  c.maxResults = 50;
  return c;
}

describe("canonical company identity", () => {
  it("merges the same Y-tunnus even when names differ", () => {
    assert.equal(
      shouldAutoMerge(
        { id: "a", businessId: "2203605-5", name: "Consti Oyj" },
        { id: "b", businessId: "22036055", name: "Consti" },
      ),
      true,
    );
    assert.equal(
      sameCanonicalCompany(
        { id: "a", businessId: "2203605-5" },
        { id: "b", businessId: "2203605-5", name: "Something Else Oy" },
      ),
      true,
    );
  });

  it("never merges two companies that only share a similar name", () => {
    assert.equal(
      shouldAutoMerge(
        { id: "a", name: "Example Oy", country: "FI" },
        { id: "b", name: "Example Oy", country: "FI" },
      ),
      false,
    );
    assert.equal(
      shouldAutoMerge(
        { id: "a", name: "Example Finland Oy", country: "FI" },
        { id: "b", name: "Example Oy", country: "FI" },
      ),
      false,
    );
  });

  it("keeps two firms with the same name and different business IDs", () => {
    const d = compareEntities(
      { id: "a", name: "Aura Oy", businessId: "0112038-9", country: "FI" },
      { id: "b", name: "Aura Oy", businessId: "2203605-5", country: "FI" },
    );
    assert.equal(d.action, "keep");
    assert.equal(
      shouldAutoMerge(
        { id: "a", name: "Aura Oy", businessId: "0112038-9" },
        { id: "b", name: "Aura Oy", businessId: "2203605-5" },
      ),
      false,
    );
  });

  it("treats Example Oy / EXAMPLE OY / Example Oy. as the same name token", () => {
    assert.equal(normalizeName("Example Oy"), normalizeName("EXAMPLE OY"));
    assert.equal(normalizeName("Example Oy."), normalizeName("Example   Oy"));
    assert.notEqual(normalizeName("Example Finland Oy"), normalizeName("Example Oy"));
  });

  it("prefers registry, then VAT, then LEI, then domain", () => {
    assert.equal(canonicalIdentity({ id: "1", businessId: "0112038-9" }).strength, "registry");
    assert.equal(canonicalIdentity({ id: "1", vatId: "FI01120389" }).strength, "vat");
    assert.equal(canonicalIdentity({ id: "1", lei: "743700JMXCC11CRJCS71" }).strength, "lei");
    assert.equal(canonicalIdentity({ id: "1", domain: "https://www.Example.FI", name: "Example Oy" }).strength, "domain");
    assert.equal(normalizeLei("743700JMXCC11CRJCS71"), "743700JMXCC11CRJCS71");
    assert.equal(normalizeVatId("fi 01120389"), "FI01120389");
  });

  it("rejects invalid LEI and does not merge same-domain subsidiaries without a hard id", () => {
    assert.equal(normalizeLei("short"), null);
    assert.equal(normalizeLei("not a lei value!!!!"), null);
    assert.equal(
      shouldAutoMerge(
        { id: "a", name: "Example Services Oy", domain: "example.fi" },
        { id: "b", name: "Example Holdings Oy", domain: "example.fi" },
      ),
      false,
    );
    assert.equal(
      sameCanonicalCompany(
        { id: "a", name: "Example Oy", domain: "example.fi" },
        { id: "b", name: "Example Oy", domain: "example.fi" },
      ),
      true,
    );
  });
});

describe("query fingerprint", () => {
  it("is stable regardless of rule order", () => {
    const a = construction();
    const b = emptyCriteria();
    b.maxResults = 50;
    b.groups.rules.push({ id: "r2", field: "revenue_max", op: "lte", value: 10_000_000 });
    b.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "41" });
    b.groups.rules.push({ id: "r1", field: "revenue_min", op: "gte", value: 1_000_000 });
    assert.equal(queryFingerprint(a), queryFingerprint(b));
  });

  it("changes when industry or revenue range changes", () => {
    const a = construction();
    const b = construction();
    b.groups.rules.push({ id: "x", field: "industry", op: "eq", value: "43" });
    assert.notEqual(queryFingerprint(a), queryFingerprint(b));
    const c = construction();
    c.groups.rules = c.groups.rules.map((r) => ("field" in r && r.field === "revenue_max" ? { ...r, value: 8_000_000 } : r));
    assert.notEqual(queryFingerprint(a), queryFingerprint(c));
  });

  it("detects related construction searches as similar", () => {
    const a = construction();
    a.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    const b = construction();
    b.groups.rules.push({ id: "m", field: "municipality", op: "eq", value: "Tampere" });
    b.groups.rules = b.groups.rules.map((r) => ("field" in r && r.field === "revenue_max" ? { ...r, value: 8_000_000 } : r));
    assert.ok(querySimilarity(a, b) >= 0.7);
    const other = emptyCriteria();
    other.groups.rules.push({ id: "i", field: "industry", op: "eq", value: "62" });
    assert.ok(querySimilarity(a, other) < 0.5);
  });

  it("does not put exclusion flags in the fingerprint", () => {
    const a = construction();
    const b = construction();
    b.excludeSeen = true;
    b.prioritizeNew = false;
    assert.equal(queryFingerprint(a), queryFingerprint(b));
  });

  it("labels pre-reform runs from stored filters and never invents a fingerprint without criteria", () => {
    const c = construction();
    const unnamed = legacyRunMeta({ name: null, criteria: c });
    assert.equal(unnamed.fingerprint, queryFingerprint(c));
    assert.equal(unnamed.name, searchLabel(c));
    assert.notEqual(unnamed.name, "");
    const kept = legacyRunMeta({ name: " Tampere construction ", criteria: c });
    assert.equal(kept.name, "Tampere construction");
    assert.equal(legacyRunMeta({ name: "", criteria: null }).fingerprint, null);
    assert.equal(legacyRunMeta({ name: "", criteria: { country: "FI" } }).name, "Search");
  });
});

describe("novelty and ranking", () => {
  it("scores never-seen companies at 1 and recent repeats much lower", () => {
    assert.equal(noveltyScore(null), 1);
    assert.equal(noveltyScore({ timesSeen: 0, lastSeenAt: null, timesExported: 0 }), 1);
    const recent = noveltyScore({ timesSeen: 5, lastSeenAt: new Date().toISOString(), timesExported: 0 });
    assert.ok(recent <= 0.3);
    const old = noveltyScore({ timesSeen: 1, lastSeenAt: new Date(Date.now() - 200 * 86400000).toISOString(), timesExported: 0 });
    assert.ok(old >= 0.5);
  });

  it("never lets novelty fully override a strong match", () => {
    const freshWeak = finalRankScore({ searchScore: 20, novelty: 1, prioritizeNew: true });
    const seenStrong = finalRankScore({ searchScore: 90, novelty: 0.05, prioritizeNew: true });
    assert.ok(seenStrong > freshWeak);
  });

  it("is deterministic", () => {
    const a = finalRankScore({ searchScore: 71, novelty: 0.8, prioritizeNew: true, diversityPenalty: 2 });
    const b = finalRankScore({ searchScore: 71, novelty: 0.8, prioritizeNew: true, diversityPenalty: 2 });
    assert.equal(a, b);
    assert.equal(RANKING_VERSION, "rank-v3-query-aware");
  });

  it("overfetches when excluding previously shown companies", () => {
    const c = construction();
    c.maxResults = 50;
    assert.ok(discoverPoolSize(c) >= 90);
    assert.ok(discoverPoolSize(c) > (c.maxResults ?? 50));
    c.excludeSeen = true;
    assert.ok(discoverPoolSize(c) >= 150);
    assert.ok(discoverPoolSize(c) <= ENGINE_SEARCH_CEILING);
  });

  it("lets unlimited batches oversample up to the engine ceiling", () => {
    const c = construction();
    c.maxResults = 4000;
    c.excludeSeen = true;
    assert.ok(discoverPoolSize(c) >= 4000);
    assert.ok(discoverPoolSize(c) <= ENGINE_SEARCH_CEILING);
    c.maxResults = ENGINE_SEARCH_CEILING;
    assert.equal(discoverPoolSize(c), ENGINE_SEARCH_CEILING);
  });

  it("shows LIMITED NEW RESULTS only when reuse is high", () => {
    const quiet = limitedNewWarning({ requested: 50, returned: 50, seenCount: 3, newCount: 47 });
    assert.equal(quiet.show, false);
    const loud = limitedNewWarning({ requested: 50, returned: 50, seenCount: 43, newCount: 7 });
    assert.equal(loud.show, true);
    assert.match(loud.message, /LIMITED NEW RESULTS/);
    assert.equal(loud.message.includes("\u2014"), false);
  });

  it("exhaustion is 0 when the pool is fresh and high when reused", () => {
    assert.equal(exhaustionScore({ requested: 50, newCount: 50, seenCount: 0 }), 0);
    assert.ok(exhaustionScore({ requested: 50, newCount: 0, seenCount: 50, excludedCount: 50 }) >= 80);
  });

  it("defaults prioritize new companies on", () => {
    const c = emptyCriteria();
    assert.equal(c.prioritizeNew, true);
    assert.equal(c.excludeSeen, true);
    assert.equal(c.excludeExported, false);
    assert.equal(skipPreviouslyShown(c), true);
  });

  it("does not secretly disable hard exclusion", () => {
    assert.match(emptyNewLeadsMessage(true), /excluded as requested/);
    const c = construction();
    c.excludeSeen = true;
    assert.equal(shouldHardExclude(c, { timesSeen: 2, lastSeenAt: new Date().toISOString(), timesExported: 0 }), "seen");
    assert.equal(shouldHardExclude(c, null), null);
    c.excludeSeen = false;
    c.prioritizeNew = false;
    c.excludeExported = true;
    assert.equal(shouldHardExclude(c, { timesSeen: 0, lastSeenAt: null, timesExported: 1 }), "exported");
    assert.equal(shouldHardExclude(c, { timesSeen: 4, lastSeenAt: new Date().toISOString(), timesExported: 0 }), null);
  });

  it("never pads a new-company search with previously shown rows", () => {
    const c = emptyCriteria();
    c.excludeSeen = false;
    c.prioritizeNew = true;
    assert.equal(skipPreviouslyShown(c), true);
    assert.equal(shouldHardExclude(c, { timesSeen: 1, lastSeenAt: new Date().toISOString(), timesExported: 0 }), "seen");
    c.prioritizeNew = false;
    assert.equal(skipPreviouslyShown(c), false);
    assert.equal(shouldHardExclude(c, { timesSeen: 3, lastSeenAt: new Date().toISOString(), timesExported: 0 }), null);
  });

  it("does not show the empty-new banner while discovery is still running", () => {
    assert.equal(showEmptyNewBanner({ excludeSeen: true, companyCount: 0, status: "running" }), false);
    assert.equal(showEmptyNewBanner({ excludeSeen: true, companyCount: 0, status: "queued" }), false);
    assert.equal(showEmptyNewBanner({ excludeSeen: true, companyCount: 0, status: "completed" }), true);
    assert.equal(showEmptyNewBanner({ excludeSeen: true, companyCount: 3, status: "completed" }), false);
    assert.equal(showEmptyNewBanner({ excludeSeen: false, companyCount: 0, status: "completed" }), false);
  });

  it("collects previously shown business ids so discover can skip them", () => {
    const c = construction();
    c.excludeSeen = true;
    const row = {
      company_id: "co1",
      business_id: "0202749-3",
      times_seen: 2,
      last_seen_at: new Date().toISOString(),
      times_exported: 0,
      last_exported_at: null,
    };
    const bids = collectHardExcludeBids([
      row,
      row,
      {
        company_id: "co2",
        business_id: "0112038-9",
        times_seen: 0,
        last_seen_at: null,
        times_exported: 0,
        last_exported_at: null,
      },
    ], c);
    assert.deepEqual(bids, ["0202749-3"]);
  });

  it("does not complete a discover slice under the requested cap unless the register is exhausted", () => {
    assert.equal(discoverSliceComplete({ kept: 78, want: 500, timedOut: false, quotaStopped: false, registerExhausted: false }), false);
    assert.equal(discoverSliceComplete({ kept: 78, want: 500, timedOut: true, quotaStopped: false, registerExhausted: false }), false);
    assert.equal(discoverSliceComplete({ kept: 78, want: 500, timedOut: false, quotaStopped: false, registerExhausted: true }), true);
    assert.equal(discoverSliceComplete({ kept: 500, want: 500, timedOut: false, quotaStopped: false, registerExhausted: false }), true);
    assert.equal(discoverSliceComplete({ kept: 40, want: 500, timedOut: false, quotaStopped: true, registerExhausted: false }), true);
  });

  it("asks the register only for the remaining cap plus a small attach buffer", () => {
    assert.equal(discoverFillTarget(0, 500), 560);
    assert.equal(discoverFillTarget(78, 500), 482);
    assert.equal(discoverFillTarget(500, 500), 1);
    assert.ok(discoverFillTarget(0, 500) < 2000);
  });

  it("reopens a completed underfilled search and ignores a stale exhausted flag", () => {
    assert.equal(shouldResumeDiscover({
      status: "completed",
      kept: 78,
      want: 500,
      discoverOpen: false,
      registerScannedAll: false,
    }), true);
    assert.equal(shouldResumeDiscover({
      status: "completed",
      kept: 78,
      want: 500,
      discoverOpen: false,
      registerScannedAll: true,
    }), false);
    assert.equal(shouldResumeDiscover({
      status: "running",
      kept: 78,
      want: 500,
      discoverOpen: true,
    }), false);
    assert.equal(shouldResumeDiscover({
      status: "cancelled",
      kept: 10,
      want: 500,
      discoverOpen: false,
    }), false);
    assert.equal(shouldResumeDiscover({
      status: "completed",
      kept: 500,
      want: 500,
      discoverOpen: false,
    }), false);
  });

  it("keeps earlier registry hits when a later discover slice stores zero", () => {
    const merged = mergeSourceReports(
      [{ source: "ytj", ok: true, hits: 78, registerHits: 4790 }],
      [{ source: "ytj", ok: true, hits: 0, registerHits: 4790 }, { source: "finder", ok: true, hits: 3 }],
    );
    const ytj = merged.find((r) => r.source === "ytj");
    const finder = merged.find((r) => r.source === "finder");
    assert.equal(ytj?.hits, 78);
    assert.equal(ytj?.ok, true);
    assert.equal(finder?.hits, 3);
  });

  it("applies a diversity penalty when one city dominates", () => {
    const picked = Array.from({ length: 10 }, () => ({ municipality: "Helsinki", industry: "41" }));
    const pen = diversityPenalty({ municipality: "Helsinki", industry: "41", picked });
    assert.ok(pen >= 4);
    assert.equal(diversityPenalty({ municipality: "Tampere", industry: "62", picked: [] }), 0);
  });
});

describe("pagination uniqueness", () => {
  it("encodes a stable cursor and rejects junk", () => {
    const token = encodeRunCursor(12, "abc");
    assert.deepEqual(decodeRunCursor(token), { r: 12, i: "abc" });
    assert.equal(decodeRunCursor("not-a-cursor"), null);
    assert.equal(decodeRunCursor(""), null);
    assert.equal(decodeRunCursor(encodeRunCursor(-1, "x")), null);
  });

  it("reports zero duplicates across ordered pages", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `c${String(i).padStart(3, "0")}`);
    const pages = [ids.slice(0, 10), ids.slice(10, 20), ids.slice(20, 30), ids.slice(30, 40)];
    assert.deepEqual(paginationDuplicates(pages), []);
    assert.equal(uniqueIds([...ids, "c001"]).length, 40);
  });

  it("flags a page-2 overlap", () => {
    assert.deepEqual(paginationDuplicates([["a", "b", "c"], ["c", "d"]]), ["c"]);
  });

  it("keeps uniqueness on a 1,000-id soak with repeats", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `id-${i % 800}`);
    const uniq = uniqueIds(ids);
    assert.equal(uniq.length, 800);
    const pages = [uniq.slice(0, 200), uniq.slice(200, 400), uniq.slice(400, 600), uniq.slice(600, 800)];
    assert.deepEqual(paginationDuplicates(pages), []);
  });
});

describe("csv export", () => {
  it("emits UTF-8 BOM, RFC 4180 quotes, and formula protection", () => {
    const csv = rowsToCsv([
      {
        name: 'Aura "Rakennus" Oy',
        business_id: "0112038-9",
        revenue: 5200000,
        city: "Tampere",
        note: "=cmd",
        letters: "ÄÖÅé",
      },
    ]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /Aura ""Rakennus"" Oy/);
    assert.match(csv, /5200000/);
    assert.match(csv, /'=cmd/);
    assert.match(csv, /ÄÖÅé/);
    assert.equal(escapeCsv("+profit"), "'+profit");
    assert.equal(escapeCsv("@sum"), "'@sum");
    assert.equal(escapeCsv("-1 weird"), "'-1 weird");
  });

  it("keeps commas inside quoted cells", () => {
    const csv = rowsToCsv([{ name: "A, B Oy", city: "Helsinki" }]);
    assert.match(csv, /"A, B Oy"/);
  });

  it("quotes newlines and long names", () => {
    const csv = rowsToCsv([{ name: "Line1\nLine2", city: "Espoo" }]);
    assert.match(csv, /"Line1\nLine2"/);
  });

  it("projects BASIC columns without dropping formula protection", () => {
    const full = [
      {
        name: "=HACK",
        canonical_company_id: "c1",
        business_id: "0112038-9",
        country: "FI",
        municipality: "Tampere",
        website: "https://example.fi",
        industry_label: "Construction",
        match_score: 81,
        revenue: 5200000,
        run_id: "run-1",
        exported_at: "2026-09-10T00:00:00.000Z",
      },
    ];
    const basic = projectCsvRows(full, "basic");
    assert.equal("revenue" in basic[0]!, false);
    assert.equal(basic[0]!.business_id, "0112038-9");
    const csv = rowsToCsv(basic);
    assert.match(csv, /'=HACK/);
    assert.equal(csv.includes("\u2014"), false);
  });
});

describe("no cross-user leak in ranking helpers", () => {
  it("compares run sets without mixing identities", () => {
    const userA = ["a1", "a2", "shared-name-but-id-a"];
    const userB = ["b1", "shared-name-but-id-b"];
    const diff = compareRunSets(userA, userB);
    assert.deepEqual(diff.kept, []);
    assert.ok(diff.added.includes("b1"));
    assert.ok(diff.removed.includes("a1"));
  });

  it("hard exclusion is evaluated per snapshot, never globally", () => {
    const c = construction();
    c.excludeSeen = true;
    const userA = { timesSeen: 20, lastSeenAt: new Date().toISOString(), timesExported: 0 };
    const userB = null;
    assert.equal(shouldHardExclude(c, userA), "seen");
    assert.equal(shouldHardExclude(c, userB), null);
  });
});
