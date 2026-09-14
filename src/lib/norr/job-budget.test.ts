import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  crawlCap,
  contactsSatisfied,
  shouldEnqueueCrawl,
  shouldFanOutCrawl,
  shouldSkipScrape,
  shouldEnqueueSignals,
  shouldDrainOptionalJobs,
  isCoreJobType,
  shouldSpawnChildCrawls,
  isChildCrawlPayload,
  inProcessFollowCount,
  remainingCrawlSlots,
  canonicalCrawlUrl,
  pickFanOutUrls,
  SEARCH_WATCHDOG_MS,
} from "./job-budget.ts";
import { isJunkCompanyPhone, phoneUsedTooWidely } from "./phones.ts";
import { scoreMayProceed } from "./scrape-gate.ts";
import { runProgress, runProgressFromCounts } from "./progress.ts";

describe("search job budget", () => {
  it("caps crawls so a 300-company run cannot spawn thousands of page jobs", () => {
    assert.equal(crawlCap("normal"), 4);
    assert.equal(crawlCap("deep"), 8);
    assert.equal(shouldEnqueueCrawl({ website: "https://automaalaus.com", existingCrawlJobs: 0, cap: 4, satisfied: false }), true);
    assert.equal(shouldEnqueueCrawl({ website: "https://automaalaus.com", existingCrawlJobs: 0, cap: 4, satisfied: true }), false);
    assert.equal(shouldEnqueueCrawl({ website: "https://automaalaus.com", existingCrawlJobs: 0, cap: 4, satisfied: true, wantHiring: true }), true);
    assert.equal(shouldEnqueueCrawl({ website: "https://automaalaus.com", existingCrawlJobs: 4, cap: 4, satisfied: false }), false);
    assert.equal(shouldEnqueueCrawl({ website: null, existingCrawlJobs: 0, cap: 4, satisfied: false }), false);
    assert.equal(shouldFanOutCrawl({ pagesSeen: 1, cap: 4, satisfied: false }), true);
    assert.equal(shouldFanOutCrawl({ pagesSeen: 1, cap: 4, satisfied: true }), false);
    assert.equal(shouldFanOutCrawl({ pagesSeen: 4, cap: 4, satisfied: false }), false);
    assert.equal(remainingCrawlSlots(0, 4), 4);
    assert.equal(remainingCrawlSlots(3, 4), 1);
    assert.equal(remainingCrawlSlots(4, 4), 0);
  });

  it("never lets a crawl job enqueue another crawl job", () => {
    assert.equal(shouldSpawnChildCrawls(), false);
    assert.equal(isChildCrawlPayload({ seed: false }), true);
    assert.equal(isChildCrawlPayload({ seed: true }), false);
    assert.equal(isChildCrawlPayload({}), true);
    assert.equal(inProcessFollowCount({ seed: true, satisfied: false }), 2);
    assert.equal(inProcessFollowCount({ seed: true, satisfied: false, depth: "deep" }), 3);
    assert.equal(inProcessFollowCount({ seed: true, satisfied: true }), 0);
    assert.equal(inProcessFollowCount({ seed: true, satisfied: true, wantHiring: true }), 2);
    assert.equal(inProcessFollowCount({ seed: false, satisfied: false }), 0);
  });

  it("canonicalizes crawl URLs and picks a short in-process contact path list", () => {
    assert.equal(canonicalCrawlUrl("https://www.Automaalaus.com/bar/?q=1#x"), "https://automaalaus.com/bar");
    assert.equal(canonicalCrawlUrl("https://automaalaus.com/"), "https://automaalaus.com/");
    assert.equal(canonicalCrawlUrl("mailto:info@automaalaus.com"), null);
    const urls = pickFanOutUrls({
      origin: "https://www.automaalaus.com/",
      already: ["https://automaalaus.com/yhteystiedot"],
      slots: 2,
    });
    assert.ok(urls.length <= 2);
    assert.ok(urls.length >= 1);
    assert.equal(urls.some((u) => /\/\/automaalaus\.com\/yhteystiedot\/?$/.test(u)), false);
    assert.equal(urls.every((u) => u.startsWith("https://automaalaus.com/")), true);
    assert.deepEqual(
      pickFanOutUrls({ origin: "https://automaalaus.com", already: [], slots: 0 }),
      [],
    );
    const deep = pickFanOutUrls({ origin: "https://automaalaus.com", already: [], slots: 6, depth: "deep" });
    assert.ok(deep.some((u) => u.endsWith("/meista")));
    const hiring = pickFanOutUrls({ origin: "https://automaalaus.com", already: [], slots: 2, wantHiring: true, hiringOnly: true });
    assert.ok(hiring.some((u) => /tyopaikat|careers|jobs/.test(u)));
    assert.equal(hiring.every((u) => /tyopaikat|careers|jobs|ura|avoimet-tyopaikat|open-positions/.test(u)), true);
    const companies = 300;
    const jobsIfChildrenBanned = companies * 1;
    const jobsIfOldFanOut = companies * 20;
    assert.ok(jobsIfChildrenBanned < 400);
    assert.ok(jobsIfOldFanOut > 5000);
  });

  it("treats email plus phone or a person as enough contacts", () => {
    assert.equal(contactsSatisfied({ email: "info@automaalaus.com", phone: "+358401234567", people: 0 }), true);
    assert.equal(contactsSatisfied({ email: "info@automaalaus.com", phone: null, people: 1 }), true);
    assert.equal(contactsSatisfied({ email: null, phone: "+358401234567", people: 2 }), false);
    assert.equal(contactsSatisfied({ email: "info@automaalaus.com", phone: null, people: 0 }), false);
  });

  it("skips scrape when the company site is already known and skips signals on a standard search", () => {
    assert.equal(shouldSkipScrape({ website: "https://automaalaus.com", websiteUsable: true }), true);
    assert.equal(shouldSkipScrape({ website: null, websiteUsable: false }), false);
    assert.equal(shouldEnqueueSignals("normal"), false);
    assert.equal(shouldEnqueueSignals("deep"), true);
    assert.equal(isCoreJobType("enrich"), true);
    assert.equal(isCoreJobType("crawl"), false);
  });

  it("drains leftover crawls after enrich is done and the search has been running too long", () => {
    assert.equal(shouldDrainOptionalJobs({
      enrichLive: false, scrapeLive: true, discoverLive: false, ageMs: SEARCH_WATCHDOG_MS + 1,
    }), true);
    assert.equal(shouldDrainOptionalJobs({
      enrichLive: true, scrapeLive: false, discoverLive: false, ageMs: SEARCH_WATCHDOG_MS + 1,
    }), false);
    assert.equal(shouldDrainOptionalJobs({
      enrichLive: false, scrapeLive: false, discoverLive: false, ageMs: 60_000,
    }), false);
  });
});

describe("shared directory phones", () => {
  it("rejects the number that leaked onto many unrelated cards", () => {
    assert.equal(isJunkCompanyPhone("+35810665101"), true);
    assert.equal(isJunkCompanyPhone("+35810665100"), true);
    assert.equal(isJunkCompanyPhone("+358 10 665 100"), true);
    assert.equal(isJunkCompanyPhone("+358 10 665 101"), true);
    assert.equal(isJunkCompanyPhone("+358401234567"), false);
    assert.equal(phoneUsedTooWidely(2), true);
    assert.equal(phoneUsedTooWidely(1), false);
  });
});

describe("score is not blocked by extra crawls", () => {
  it("scores once enrich or scrape finished, even if crawls remain", () => {
    assert.equal(scoreMayProceed([{ type: "enrich", status: "done" }]), "score");
    assert.equal(scoreMayProceed([{ type: "scrape", status: "done" }, { type: "crawl", status: "queued" }]), "score");
    assert.equal(scoreMayProceed([{ type: "enrich", status: "done" }, { type: "scrape", status: "queued" }]), "score");
    assert.equal(scoreMayProceed([{ type: "enrich", status: "running" }]), "wait");
  });
});

describe("progress counts cancelled crawls as finished", () => {
  it("does not sit at 53% when leftover crawls were cancelled", () => {
    const p = runProgressFromCounts([
      { type: "discover", status: "done", n: 1 },
      { type: "enrich", status: "done", n: 300 },
      { type: "crawl", status: "cancelled", n: 4000 },
      { type: "score", status: "done", n: 300 },
    ], "completed");
    assert.equal(p.pct, 100);
    assert.equal(p.label, "Complete");
    const live = runProgress([
      { type: "enrich", status: "done" },
      { type: "crawl", status: "cancelled" },
      { type: "score", status: "queued" },
    ], "running");
    assert.equal(live.stage, "score");
    assert.ok(live.pct > 40);
  });
});
