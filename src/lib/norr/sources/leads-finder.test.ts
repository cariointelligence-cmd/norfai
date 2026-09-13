import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  compileLeadsFinderInput,
  decideLeadsFinder,
  formatApifyRevenue,
  mapEmployeeSize,
  mapIndustryCodes,
  mapLocation,
  mapRoles,
  noteLeadsFinderRun,
  resetLeadsFinderBudgetForTests,
  APIFY_MAX_RESULTS_PER_RUN,
} from "./leads-finder.ts";
import { APIFY_LEADS_FINDER_ID, APIFY_TOOLS, clampApifyRunInput, findApifyTool, normalizeApifyItem } from "./apify.ts";
import { emptyCriteria } from "../criteria.ts";

describe("leads-finder hive adapter", () => {
  beforeEach(() => resetLeadsFinderBudgetForTests());

  it("maps ICP fields and omits unrequested constraints", () => {
    const c = emptyCriteria();
    c.country = "FI";
    c.maxResults = 30;
    c.groups = {
      id: "root",
      combinator: "and",
      rules: [
        { id: "i", field: "industry", op: "eq", value: "73" },
        { id: "r", field: "revenue_min", op: "gte", value: 500_000 },
        { id: "e", field: "employee_min", op: "gte", value: 1 },
        { id: "x", field: "employee_max", op: "lte", value: 20 },
      ],
    };
    c.roles = ["ceo", "owner"];
    c.requireEmail = true;
    const { input, omitted } = compileLeadsFinderInput({ criteria: c, maxResults: 30 });
    assert.deepEqual(input.company_industry, ["marketing & advertising"]);
    assert.deepEqual(input.contact_location, ["finland"]);
    assert.ok(input.contact_job_title?.includes("CEO"));
    assert.ok(input.seniority_level?.includes("Owner"));
    assert.equal(input.min_revenue, "500K");
    assert.ok(input.size?.includes("2–10") || input.size?.includes("1-10") || input.size?.includes("11–20"));
    assert.deepEqual(input.email_status, ["validated"]);
    assert.equal(input.fetch_count <= APIFY_MAX_RESULTS_PER_RUN, true);
    assert.equal(omitted.includes("min_revenue"), false);
  });

  it("does not invent revenue, CEO, or validated email", () => {
    const c = emptyCriteria();
    c.country = "FI";
    c.roles = [];
    const { input, omitted } = compileLeadsFinderInput({ criteria: c });
    assert.equal(input.min_revenue, undefined);
    assert.equal(input.email_status, undefined);
    assert.equal(input.contact_job_title, undefined);
    assert.ok(omitted.includes("min_revenue"));
    assert.ok(omitted.includes("email_status"));
    assert.ok(omitted.includes("contact_job_title"));
  });

  it("formats size, location, revenue, roles", () => {
    assert.deepEqual(mapEmployeeSize(11, 20), ["11–20"]);
    assert.deepEqual(mapLocation("FI"), { location: ["finland"] });
    assert.equal(formatApifyRevenue(1_000_000), "1M");
    assert.equal(formatApifyRevenue(500_000), "500K");
    const roles = mapRoles(["sales_director"]);
    assert.ok(roles.titles.includes("Sales Director"));
    assert.ok(roles.seniority.includes("Director"));
    assert.deepEqual(mapIndustryCodes(["62", "63"]), ["information technology & services", "computer software"]);
  });

  it("skips by default and respects budget", () => {
    assert.equal(decideLeadsFinder({ configured: true, discovered: 40, emails: 30, want: 30 }).reason, "SKIPPED_ALREADY_HAVE_DATA");
    assert.equal(decideLeadsFinder({ configured: true, discovered: 40, emails: 10, want: 30 }).reason, "SKIPPED_NOT_JUSTIFIED");
    assert.equal(decideLeadsFinder({
      configured: true, discovered: 40, emails: 8, want: 30, requireEmail: true,
    }).reason, "USED_FOR_VALIDATED_CONTACT_GAP");
    assert.equal(decideLeadsFinder({ configured: false, discovered: 0, want: 10, requireEmail: true }).reason, "SKIPPED_NOT_CONFIGURED");
    assert.equal(decideLeadsFinder({ mode: "OFF", configured: true, requireEmail: true }).reason, "SKIPPED_MODE_OFF");
    for (let i = 0; i < 8; i++) noteLeadsFinderRun(`s${i}`);
    assert.equal(decideLeadsFinder({ configured: true, discovered: 40, emails: 2, want: 30, requireEmail: true }).reason, "SKIPPED_COST_BUDGET");
  });

  it("registers the actor and clamps fetch_count", () => {
    const tool = findApifyTool(APIFY_LEADS_FINDER_ID);
    assert.ok(tool);
    assert.equal(tool!.actorId, "code_crafter~leads-finder");
    assert.equal(tool!.costClass, "high");
    assert.ok(APIFY_TOOLS.length >= 4);
    const clamped = clampApifyRunInput(tool!, { fetch_count: 100000, company_industry: ["marketing & advertising"] });
    assert.equal(clamped.fetch_count, 15);
  });

  it("normalizes a leads-finder person+company row without dropping it", () => {
    const tool = findApifyTool(APIFY_LEADS_FINDER_ID)!;
    const item = normalizeApifyItem({
      company_name: "Hasan & Partners Oy",
      company_website: "https://hasan.fi",
      email: "ceo@hasan.fi",
      full_name: "Anna Example",
      job_title: "CEO",
      company_city: "Helsinki",
      company_country: "Finland",
    }, tool);
    assert.ok(item);
    assert.equal(item!.name, "Hasan & Partners Oy");
    assert.equal(item!.email, "ceo@hasan.fi");
    assert.ok(item!.website?.includes("hasan.fi"));
  });
});
