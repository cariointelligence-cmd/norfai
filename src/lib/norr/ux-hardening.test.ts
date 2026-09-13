import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jsonSafe, sanitizeAudit, sanitizeRunList } from "./dto.ts";
import { formatWhen, isoTime, asDisplay } from "../format.ts";
import { parseLeadPrefs, parseListRules, listRulesSummary, DEFAULT_LEAD_PREFS } from "./prefs.ts";
import { fieldLabel, opLabel, defaultOpForField, BOOLEAN_FIELDS } from "./criteria.ts";
import { contactFaceValue, decisionMakerFace } from "./face-value.ts";

describe("timestamps never leak as objects", () => {
  it("isoTime converts Date and date-like objects", () => {
    assert.equal(isoTime(new Date("2026-03-01T10:00:00.000Z")), "2026-03-01T10:00:00.000Z");
    assert.equal(isoTime({ toISOString: () => "2026-03-01T10:00:00.000Z" }), "2026-03-01T10:00:00.000Z");
    assert.equal(isoTime({}), null);
    assert.equal(isoTime(null), null);
  });

  it("formatWhen always returns a string", () => {
    assert.equal(typeof formatWhen(new Date("2026-03-01T10:00:00Z")), "string");
    assert.equal(formatWhen({}), "-");
    assert.equal(formatWhen(null, "n/a"), "n/a");
    assert.notEqual(Object.prototype.toString.call(formatWhen(new Date())), "[object Object]");
  });

  it("asJson/jsonSafe converts Date and empty objects", () => {
    assert.equal(jsonSafe(new Date("2026-01-15T12:00:00.000Z")), "2026-01-15T12:00:00.000Z");
    assert.equal(jsonSafe({}), null);
    const audit = sanitizeAudit({
      id: "1",
      action: "search.start",
      entity_type: "run",
      entity_id: "abc",
      created_at: new Date("2026-01-15T12:00:00.000Z"),
    });
    assert.equal(typeof audit.created_at, "string");
    const run = sanitizeRunList({
      id: "r1",
      status: "completed",
      created_at: new Date("2026-02-01T08:00:00.000Z"),
      finished_at: {},
      stats: { discovered: 3 },
    });
    assert.equal(typeof run.created_at, "string");
    assert.equal(run.finished_at, null);
  });

  it("asDisplay never returns an object", () => {
    assert.equal(asDisplay(new Date("2026-01-01T00:00:00.000Z")).startsWith("2026-01-01"), true);
    assert.equal(asDisplay({}), "");
    assert.equal(asDisplay(12), "12");
  });
});

describe("lead prefs", () => {
  it("fills defaults and clamps confidence", () => {
    const p = parseLeadPrefs({ minConfidence: 140, requireWebsite: 1, locale: "sv" });
    assert.equal(p.minConfidence, 100);
    assert.equal(p.requireWebsite, true);
    assert.equal(p.locale, "sv");
    assert.equal(p.prioritizeNew, true);
    assert.equal(parseLeadPrefs(null).minConfidence, DEFAULT_LEAD_PREFS.minConfidence);
  });

  it("parses list rules", () => {
    const r = parseListRules({ industry: "41", requireEmail: true, minRevenue: 500000 });
    assert.equal(r.industry, "41");
    assert.equal(r.requireEmail, true);
    assert.equal(r.minRevenue, 500000);
    assert.equal(parseListRules({ requirePhone: true, country: "se" }).country, "SE");
    assert.match(listRulesSummary(r, "fi"), /sähköposti/);
  });
});

describe("advanced filter labels", () => {
  it("uses human names not raw DSL", () => {
    assert.notEqual(fieldLabel("revenue_min", "en"), "revenue_min");
    assert.match(fieldLabel("revenue_min", "en"), /revenue/i);
    assert.match(fieldLabel("revenue_min", "fi"), /liikevaihto/i);
    assert.equal(opLabel("gte", "en"), "at least");
    assert.equal(opLabel("eq", "fi"), "on");
    assert.equal(defaultOpForField("revenue_min"), "gte");
    assert.equal(defaultOpForField("keyword"), "contains");
    assert.equal(BOOLEAN_FIELDS.has("website_required"), true);
  });
});

describe("contact Face values", () => {
  it("shows Pending while the run is enriching, the value when present, Not found when done", () => {
    assert.equal(contactFaceValue("info@automaalaus.com", { running: true, recordStatus: "discovered" }), "info@automaalaus.com");
    assert.equal(contactFaceValue(null, { running: true, recordStatus: "discovered" }), "Pending");
    assert.equal(contactFaceValue("  ", { running: true, recordStatus: "enriching" }), "Pending");
    assert.equal(contactFaceValue(null, { running: true, recordStatus: "" }), "Pending");
    assert.equal(contactFaceValue(null, { running: true, recordStatus: "enriched" }), "Not found");
    assert.equal(contactFaceValue(null, { running: false, recordStatus: "discovered" }), "Not found");
    assert.equal(decisionMakerFace("Maija Virtanen", "Toimitusjohtaja", { running: true }), "Maija Virtanen · Toimitusjohtaja");
    assert.equal(decisionMakerFace(null, null, { running: true, recordStatus: "discovered" }), "Pending");
    assert.equal(decisionMakerFace("CLG Comm", null, { running: false }), "CLG Comm");
  });
});
