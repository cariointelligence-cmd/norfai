import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPhoneRole, finnishMobile, phoneRoleLabel, pickCompanyPhone } from "./phones.ts";
import { matchesExclusion, parseExclusionLine, parseExclusionText } from "./exclusions.ts";
import { lookalikeScore, rankLookalikes } from "./lookalike.ts";
import { digestSummary, diffSnapshots } from "./changes.ts";
import { teamSeatCap } from "./platform.ts";
import { extractParentMention } from "./group.ts";
import { parseBriefText } from "./call-brief.ts";
import { emptyCriteria } from "./criteria.ts";
import { OPPORTUNITY_PRESETS } from "./targeting/spec.ts";

describe("phone roles", () => {
  it("labels Finnish mobiles and switchboards separately", () => {
    assert.equal(finnishMobile("+358401234567"), true);
    assert.equal(finnishMobile("+358501234567"), true);
    assert.equal(finnishMobile("+35891234567"), false);
    assert.equal(classifyPhoneRole("+358401234567"), "mobile");
    assert.equal(classifyPhoneRole("+35893123456"), "switchboard");
    assert.equal(classifyPhoneRole("+35840111111", "vaihde Helsinki"), "switchboard");
    assert.equal(classifyPhoneRole("+35893111111", "suora linja"), "direct");
    assert.equal(phoneRoleLabel("mobile", "fi"), "Matkapuhelin");
    assert.equal(phoneRoleLabel("switchboard", "en"), "Switchboard");
  });

  it("prefers a published switchboard for the company line", () => {
    const pick = pickCompanyPhone([
      { value: "+35840111111", role: "mobile", personId: "p1" },
      { value: "+35893123456", role: "switchboard" },
    ]);
    assert.equal(pick?.value, "+35840111111");
    const company = pickCompanyPhone([
      { value: "+35893123456", role: "switchboard" },
      { value: "+35844111111", role: "mobile" },
    ]);
    assert.equal(company?.role, "switchboard");
  });
});

describe("customer exclusions", () => {
  it("parses Y-tunnus, VAT, domain and name", () => {
    assert.equal(parseExclusionLine("0112038-9")?.kind, "business_id");
    assert.equal(parseExclusionLine("FI01120389")?.kind, "business_id");
    assert.equal(parseExclusionLine("asiakas.fi")?.kind, "domain");
    assert.equal(parseExclusionLine("Asiakas Oy")?.kind, "name");
    assert.equal(parseExclusionLine("# comment"), null);
  });

  it("matches uploaded customers and skips unknown rows", () => {
    const rows = parseExclusionText("0112038-9\ncompetitor.fi\n");
    assert.equal(rows.length, 2);
    assert.ok(matchesExclusion({ businessId: "0112038-9", name: "Nokia" }, rows));
    assert.equal(matchesExclusion({ businessId: "2203605-5", name: "Other Oy", website: "https://other.fi" }, rows), null);
  });
});

describe("lookalike", () => {
  it("requires the same 2-digit industry and does not invent ids", () => {
    const seed = { id: "a", name: "Seed", industry_code: "41200", municipality: "Helsinki", country: "FI", revenue: 2_000_000 };
    const same = lookalikeScore(seed, { id: "b", name: "Peer", industry_code: "41210", municipality: "Helsinki", country: "FI", revenue: 1_800_000 });
    const other = lookalikeScore(seed, { id: "c", name: "Other", industry_code: "62010", municipality: "Helsinki", country: "FI" });
    assert.ok(same && same.score >= 40);
    assert.equal(other, null);
    const ranked = rankLookalikes(seed, [
      { id: "b", name: "Peer", industry_code: "41210", municipality: "Helsinki" },
      { id: "a", name: "Seed", industry_code: "41200" },
    ], 5);
    assert.equal(ranked.some((r) => r.id === "a"), false);
  });
});

describe("change snapshots", () => {
  it("emits nothing on first snapshot and diffs later fields", () => {
    const next = {
      website: "https://example.fi",
      content_hash: "abc",
      decision_maker: "Maija",
      revenue: "1000000",
      profit: null,
      ads: null,
      people_hash: "p1",
      phone: "+35840111",
      email: "info@example.fi",
      business_status: "ACTIVE",
    };
    assert.equal(diffSnapshots(null, next).length, 0);
    const changes = diffSnapshots({ ...next, decision_maker: "Pekka", revenue: "900000" }, next);
    assert.ok(changes.some((c) => c.field === "decision_maker" && c.severity === "high"));
    assert.ok(changes.some((c) => c.field === "revenue"));
    const digest = digestSummary(changes.map((c) => ({ ...c, name: "Example Oy" })));
    assert.match(digest.headline, /change/);
  });
});

describe("team seats and presets", () => {
  it("caps seats by plan", () => {
    assert.equal(teamSeatCap("free", false), 1);
    assert.equal(teamSeatCap("starter", false), 3);
    assert.equal(teamSeatCap("pro", false), 10);
    assert.equal(teamSeatCap("unlimited", false), 25);
    assert.equal(teamSeatCap("free", true), 50);
  });

  it("exposes all eight opportunity presets", () => {
    assert.equal(Object.keys(OPPORTUNITY_PRESETS).length, 8);
  });

  it("excludes uploaded customers by default", () => {
    assert.equal(emptyCriteria().excludeCustomers, true);
  });
});

describe("group and call brief", () => {
  it("extracts a published parent mention and ignores guesses", () => {
    const hit = extractParentMention("Yhtiö on osa Acme-konsernia Suomessa.");
    assert.equal(hit?.parentName.includes("Acme"), true);
    assert.equal(extractParentMention("We are a growing company."), null);
  });

  it("parses brief lines without inventing extras", () => {
    const lines = parseBriefText("1. Yritys Helsingissä\n- Soita vaihteeseen\n\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "Yritys Helsingissä");
  });
});
