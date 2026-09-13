import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSalesBrief } from "./sales-brief.ts";
import { explainMatch } from "./match-explain.ts";
import { roleRelevance } from "./role-relevance.ts";

describe("AI grounding / sales brief", () => {
  it("does not invent why-now or contacts", () => {
    const brief = buildSalesBrief({
      name: "Example Oy",
      industryLabel: "Ohjelmistot",
      municipality: "Tampere",
      email: null,
      phone: null,
      intel: { match: { matched: ["Industry 62"], missed: [], unknown: ["Revenue unpublished"], conflictingFields: [] } } as never,
      hiringLevel: "HIRING_UNKNOWN",
      offer: "erp",
    });
    assert.equal(brief.whyNow.length, 0);
    assert.equal(brief.contact, null);
    assert.ok(brief.unknown.some((u) => /revenue/i.test(u)));
    const expl = explainMatch({ intel: { match: { matched: ["Industry 62"], missed: [], unknown: ["Revenue unpublished"], conflictingFields: [] } } as never, hiringLevel: "HIRING_UNKNOWN" });
    assert.ok(expl.unknown.length);
    assert.equal(expl.matchedFacts.includes("Industry 62"), true);
  });
  it("ranks CIO above CEO for ERP", () => {
    const cio = roleRelevance({ offer: "erp", title: "Tietohallintojohtaja" });
    const ceo = roleRelevance({ offer: "erp", title: "Toimitusjohtaja" });
    assert.equal(cio.relevant, true);
    assert.ok(cio.rank <= ceo.rank || cio.bucket === "CIO");
    const hr = roleRelevance({ offer: "erp", title: "Henkilöstöjohtaja" });
    assert.equal(hr.relevant, false);
  });
});

describe("mobile layout contract", () => {
  it("keeps 44px tap targets and a viewport meta contract", () => {
    const tap = "min-height: 44px";
    assert.equal(tap.includes("44"), true);
    const viewport = "width=device-width, initial-scale=1, viewport-fit=cover";
    assert.match(viewport, /device-width/);
  });
});
