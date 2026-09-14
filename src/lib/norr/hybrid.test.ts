import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyWorkload, interactiveBudgetMs, shouldBlockRequest, EXECUTION_TARGETS, vercelRuntimeInfo, scheduleBackground } from "./hybrid.ts";
import { cacheGet, cacheSet, cacheCoalesce, cacheGetStale, cacheStats, resetIntelCacheForTests, CACHE_TTL, STORE_CAP } from "./intel-cache.ts";

describe("vercel hybrid", () => {
  it("keeps discovery on the request and crawls off it", () => {
    assert.equal(classifyWorkload("discover"), "INTERACTIVE_FAST");
    assert.equal(shouldBlockRequest("discover"), true);
    assert.equal(classifyWorkload("crawl"), "LONG_BACKGROUND");
    assert.equal(shouldBlockRequest("crawl"), false);
    assert.equal(classifyWorkload("apify"), "EXTERNAL-INTEGRATION");
    assert.equal(shouldBlockRequest("apify"), false);
    assert.ok(interactiveBudgetMs("enrich") <= 2_000);
    assert.equal(EXECUTION_TARGETS.CONTACT_ENRICH.target, "VERCEL_FUNCTION");
    assert.equal(EXECUTION_TARGETS.WEBSITE_CRAWL.target, "VERCEL_FUNCTION");
    assert.equal(EXECUTION_TARGETS.FINANCIAL.target, "VERCEL_FUNCTION");
    assert.equal(EXECUTION_TARGETS.APIFY_LEADS.blocking, false);
    assert.equal(vercelRuntimeInfo().legacyBackend, "retired");
  });

  it("does not void-run a drain on Vercel without waitUntil", async () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    let ran = false;
    scheduleBackground(async () => {
      ran = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(ran, false);
    if (prev === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev;
  });

  it("caches public intelligence and coalesces inflight work", async () => {
    resetIntelCacheForTests();
    cacheSet("ytj|0112038-9", { name: "Nokia" }, CACHE_TTL.identity);
    assert.equal(cacheGet<{ name: string }>("ytj|0112038-9")?.name, "Nokia");
    let calls = 0;
    const a = cacheCoalesce("dom|nokia.com", CACHE_TTL.domain, async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return "nokia.com";
    });
    const b = cacheCoalesce("dom|nokia.com", CACHE_TTL.domain, async () => {
      calls += 1;
      return "nope";
    });
    assert.equal(await a, "nokia.com");
    assert.equal(await b, "nokia.com");
    assert.equal(calls, 1);
    const s = cacheStats();
    assert.ok(s.sets >= 1);
    assert.ok(s.hitRate >= 0);
  });

  it("bounds hive intel cache so the memory buffer cannot grow without cap", () => {
    resetIntelCacheForTests();
    for (let i = 0; i < STORE_CAP + 200; i++) cacheSet(`k${i}`, i, CACHE_TTL.domain);
    assert.ok(cacheStats().size <= STORE_CAP);
  });

  it("serves stale intelligence while a refresh is in flight", async () => {
    resetIntelCacheForTests();
    cacheSet("host|example.fi", "old", 20);
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(cacheGet<string>("host|example.fi"), null);
    assert.equal(cacheGetStale<string>("host|example.fi"), "old");
    let calls = 0;
    const first = cacheCoalesce("host|example.fi", 5_000, async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return "new";
    });
    const second = cacheCoalesce("host|example.fi", 5_000, async () => {
      calls += 1;
      return "nope";
    });
    assert.equal(await first, "old");
    assert.equal(await second, "old");
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(cacheGet<string>("host|example.fi"), "new");
    assert.equal(calls, 1);
  });
});
