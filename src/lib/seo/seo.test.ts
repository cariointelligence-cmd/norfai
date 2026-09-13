import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { staticPublicPages, lintPublicCatalog } from "./catalog.ts";
import { auditPublicSite } from "./audit.ts";
import { gateContent } from "./quality-gate.ts";
import { renderRobotsTxt, renderSitemapXml, sitemapEntries } from "./sitemap.ts";
import { isPrivatePath } from "./site.ts";
import { lintCopy, hasEmDash } from "./copy-lint.ts";
import { collectI18nText } from "../i18n.ts";
import { LANDING } from "../content/landing.ts";
import { FAQ_ITEMS } from "../content/faq.ts";
import { USE_CASES } from "../content/use-cases.ts";
import { INDUSTRIES } from "../content/industries.ts";
import { GUIDES } from "../content/guides.ts";

describe("public catalog", () => {
  it("has unique indexable titles and descriptions", () => {
    const pages = staticPublicPages().filter((p) => p.indexable);
    const titles = pages.map((p) => p.title);
    const descs = pages.map((p) => p.description);
    assert.equal(new Set(titles).size, titles.length);
    assert.equal(new Set(descs).size, descs.length);
    assert.ok(pages.length >= 30);
  });

  it("has no em dashes in catalog copy", () => {
    assert.deepEqual(lintPublicCatalog().filter((i) => i.kind === "em_dash"), []);
  });
});

describe("copy lint", () => {
  it("flags em dashes and hype", () => {
    const issues = lintCopy("/x", "This is revolutionary — really");
    assert.ok(issues.some((i) => i.kind === "em_dash"));
    assert.ok(issues.some((i) => i.kind === "banned_phrase"));
  });

  it("keeps landing and i18n free of em dashes", () => {
    const blob = JSON.stringify(LANDING) + collectI18nText() + JSON.stringify(FAQ_ITEMS) + JSON.stringify(USE_CASES) + JSON.stringify(INDUSTRIES) + JSON.stringify(GUIDES);
    assert.equal(hasEmDash(blob), false);
  });
});

describe("robots and sitemap", () => {
  it("blocks private app paths and points to sitemap", () => {
    const txt = renderRobotsTxt("https://example.test");
    assert.match(txt, /Disallow: \/overview/);
    assert.match(txt, /Disallow: \/admin/);
    assert.match(txt, /Disallow: \/login/);
    assert.match(txt, /Disallow: \/api/);
    assert.match(txt, /Sitemap: https:\/\/example.test\/sitemap.xml/);
    assert.equal(isPrivatePath("/companies/abc"), true);
    assert.equal(isPrivatePath("/industries/construction"), false);
  });

  it("includes only indexable URLs", () => {
    const xml = renderSitemapXml("https://example.test", sitemapEntries());
    assert.match(xml, /<loc>https:\/\/example.test\/<\/loc>/);
    assert.match(xml, /\/use-cases\/web-design/);
    assert.doesNotMatch(xml, /\/overview/);
    assert.doesNotMatch(xml, /\/admin/);
    assert.doesNotMatch(xml, /\/login/);
  });
});

describe("quality gate", () => {
  it("rejects thin hype with em dashes", () => {
    const r = gateContent({
      title: "Unlock growth",
      body: "This is revolutionary — really short.",
    });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.length >= 2);
  });

  it("accepts a factual long article", () => {
    const body = [
      "## What it is",
      "You can search Finnish companies by revenue using official registers and Norf. ".repeat(40),
      "## Limits",
      "Empty fields mean not found. ".repeat(20),
    ].join("\n");
    const r = gateContent({ title: "How to find companies by revenue", body });
    assert.equal(r.ok, true, r.reasons.join("; "));
  });
});

describe("seo audit", () => {
  it("returns a 0-100 health score with explanations", () => {
    const a = auditPublicSite();
    assert.ok(a.health >= 0 && a.health <= 100);
    assert.ok(a.geo >= 0 && a.geo <= 100);
    for (const issue of a.issues) {
      assert.ok(issue.what);
      assert.ok(issue.why);
      assert.ok(issue.action);
    }
  });

  it("indexable titles and descriptions meet length bars", () => {
    const pages = staticPublicPages().filter((p) => p.indexable);
    for (const p of pages) {
      assert.ok(p.title.length >= 15, `${p.path} title ${p.title.length}: ${p.title}`);
      assert.ok(p.title.length <= 70, `${p.path} title too long ${p.title.length}`);
      assert.ok(p.description.length >= 50, `${p.path} description ${p.description.length}`);
    }
    const critical = auditPublicSite().issues.filter((i) => i.severity === "critical");
    assert.deepEqual(critical, []);
  });
});
