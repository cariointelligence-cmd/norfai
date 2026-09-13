import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { remainingCompanySlots, isCompanyQuotaError, CompanyQuotaError } from "./quota.ts";
import { exportSearchUnits, searchRefundReason, searchShouldChargeBeforeInsert } from "./quota-ledger.ts";
import { companiesPerMonthFor, perSearchLimitFor, companiesLimitFor, searchesLimitFor, quotaError, PLANS, teamSeatCap, clampRequestedLeads, ENGINE_SEARCH_CEILING, perSearchFromBoot } from "./platform.ts";
import { leadCountChoices } from "./targeting/spec.ts";

describe("plan quotas", () => {
  it("caps free at 50 searches, 50 new / month, 50 per search, 400 stored", () => {
    assert.equal(PLANS.free.searchesPerMonth, 50);
    assert.equal(PLANS.free.companies, 400);
    assert.equal(PLANS.free.companiesPerMonth, 50);
    assert.equal(PLANS.free.perSearch, 50);
    assert.equal(companiesPerMonthFor("free", false), 50);
    assert.equal(perSearchLimitFor("free", false), 50);
    assert.equal(companiesLimitFor("free", false), 400);
    assert.equal(searchesLimitFor("free", false), 50);
    assert.equal(teamSeatCap("free", false), 1);
  });

  it("caps starter / pro / unlimited at published numbers", () => {
    assert.equal(searchesLimitFor("starter", false), 1000);
    assert.equal(companiesLimitFor("starter", false), 15000);
    assert.equal(companiesPerMonthFor("starter", false), 1500);
    assert.equal(perSearchLimitFor("starter", false), 200);
    assert.equal(teamSeatCap("starter", false), 3);

    assert.equal(searchesLimitFor("pro", false), 5000);
    assert.equal(companiesLimitFor("pro", false), 60000);
    assert.equal(companiesPerMonthFor("pro", false), 5000);
    assert.equal(perSearchLimitFor("pro", false), 300);
    assert.equal(teamSeatCap("pro", false), 10);

    assert.equal(searchesLimitFor("unlimited", false), -1);
    assert.equal(companiesLimitFor("unlimited", false), -1);
    assert.equal(companiesPerMonthFor("unlimited", false), -1);
    assert.equal(perSearchLimitFor("unlimited", false), -1);
    assert.equal(teamSeatCap("unlimited", false), 25);
  });

  it("does not cap admins on searches, storage, or per-search volume", () => {
    assert.equal(companiesLimitFor("free", true), -1);
    assert.equal(companiesPerMonthFor("free", true), -1);
    assert.equal(searchesLimitFor("free", true), -1);
    assert.equal(perSearchLimitFor("free", true), -1);
    assert.equal(teamSeatCap("free", true), 50);
  });

  it("keeps existing records when a free workspace is already over the monthly cap", () => {
    const r = remainingCompanySlots({
      totalCap: companiesLimitFor("free", false),
      monthlyCap: companiesPerMonthFor("free", false),
      perSearch: perSearchLimitFor("free", false),
      stored: 100,
      storedThisPeriod: 100,
    });
    assert.equal(r.remaining, 0);
    assert.equal(r.blocked, "monthly");
    assert.equal(r.totalCap, 400);
    assert.ok(r.remainingTotal > 0);
    assert.match(quotaError("free", "monthly", 50), /Existing companies are kept/);
  });

  it("grandfathered stored rows still allow new inserts after the monthly period rolls", () => {
    const r = remainingCompanySlots({
      totalCap: 400,
      monthlyCap: 50,
      perSearch: 50,
      stored: 100,
      storedThisPeriod: 0,
    });
    assert.equal(r.remaining, 50);
    assert.equal(r.blocked, null);
  });

  it("blocks on stored cap even if the monthly bucket has room", () => {
    const r = remainingCompanySlots({
      totalCap: 400,
      monthlyCap: 50,
      perSearch: 50,
      stored: 400,
      storedThisPeriod: 10,
    });
    assert.equal(r.remaining, 0);
    assert.equal(r.blocked, "total");
  });

  it("allows a free workspace under both caps to add more", () => {
    const r = remainingCompanySlots({
      totalCap: 400,
      monthlyCap: 50,
      perSearch: 50,
      stored: 12,
      storedThisPeriod: 12,
    });
    assert.equal(r.remaining, 38);
    assert.equal(r.blocked, null);
  });

  it("does not shrink paid remaining to free levels", () => {
    const r = remainingCompanySlots({
      totalCap: companiesLimitFor("pro", false),
      monthlyCap: companiesPerMonthFor("pro", false),
      perSearch: perSearchLimitFor("pro", false),
      stored: 100,
      storedThisPeriod: 100,
    });
    assert.ok(r.remaining > 1000);
    assert.equal(r.blocked, null);
  });

  it("identifies company quota errors without deleting records", () => {
    const err = new CompanyQuotaError("Monthly company quota reached");
    assert.equal(isCompanyQuotaError(err), true);
    assert.equal(PLANS.unlimited.perSearch, -1);
    assert.equal(isCompanyQuotaError(new Error("nope")), false);
  });

  it("clamps paid plans to their per-search cap and leaves unlimited uncapped up to the engine ceiling", () => {
    assert.equal(clampRequestedLeads(999, 50), 50);
    assert.equal(clampRequestedLeads(180, 200), 180);
    assert.equal(clampRequestedLeads(400, 300), 300);
    assert.equal(clampRequestedLeads(400, -1), 400);
    assert.equal(clampRequestedLeads(50_000, -1), ENGINE_SEARCH_CEILING);
    assert.equal(clampRequestedLeads(0, -1), 1);
  });

  it("offers large per-search choices only on unlimited", () => {
    assert.deepEqual(leadCountChoices(50), [50]);
    assert.ok(leadCountChoices(300).includes(300));
    assert.equal(leadCountChoices(300).some((n) => n > 300), false);
    const unlimited = leadCountChoices(-1);
    assert.ok(unlimited.includes(50));
    assert.ok(unlimited.includes(1000));
    assert.ok(unlimited.includes(10000));
    assert.ok(!leadCountChoices(200).includes(1000));
  });

  it("does not treat admin or unlimited as the free 50-chip when bootstrap omits perSearch", () => {
    assert.equal(perSearchFromBoot({ isAdmin: true, plan: "unlimited" }), -1);
    assert.equal(perSearchFromBoot({ isAdmin: false, plan: "unlimited" }), -1);
    assert.equal(perSearchFromBoot({ isAdmin: false, plan: "starter" }), 200);
    assert.equal(perSearchFromBoot({ isAdmin: false, plan: "free" }), 50);
    assert.equal(perSearchFromBoot({ perSearch: -1, isAdmin: false, plan: "free" }), -1);
    assert.equal(perSearchFromBoot(undefined), 50);
  });
});

describe("quota e2e table", () => {
  it("successful search reserves then commits 1", () => {
    const start = searchShouldChargeBeforeInsert({ reused: false, cost: 1 });
    assert.equal(start.action, "reserve");
    if (start.action === "reserve") assert.equal(start.units, 1);
  });
  it("duplicate search is reuse not a second charge", () => {
    const start = searchShouldChargeBeforeInsert({ reused: true, cost: 1 });
    assert.equal(start.action, "reuse");
  });
  it("infra failure refunds, zero matches still commits the search unit", () => {
    const fail = searchRefundReason({ infrastructureFailed: true, zeroMatches: false });
    assert.equal(fail?.action, "refund");
    const zero = searchRefundReason({ infrastructureFailed: false, zeroMatches: true });
    assert.equal(zero?.action, "commit");
  });
  it("export does not consume search units", () => {
    assert.equal(exportSearchUnits(500), 0);
    assert.equal(exportSearchUnits(1), 0);
  });
  it("deep search costs 10 units", () => {
    const start = searchShouldChargeBeforeInsert({ reused: false, cost: 10 });
    assert.equal(start.action, "reserve");
    if (start.action === "reserve") assert.equal(start.units, 10);
  });
});
