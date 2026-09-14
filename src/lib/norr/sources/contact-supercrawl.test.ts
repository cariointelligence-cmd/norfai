import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDirectoryContactHtml } from "./contact-supercrawl.ts";

describe("contact supercrawl", () => {
  it("extracts mailto and tel from a public directory page", () => {
    const html = `<a href="mailto:info@hasan.fi">sähköposti</a><a href="tel:+358401234567">soita</a><p>https://www.hasan.fi</p>`;
    const r = parseDirectoryContactHtml(html, "https://www.020202.fi/haku", "020202");
    assert.equal(r.emails[0]?.value, "info@hasan.fi");
    assert.ok(r.phones[0]?.value.includes("358"));
    assert.ok(r.website?.includes("hasan.fi"));
  });
  it("does not invent contacts when the page has none", () => {
    const r = parseDirectoryContactHtml("<html><p>Ei tuloksia</p></html>", "https://www.020202.fi/haku", "020202");
    assert.equal(r.emails.length, 0);
    assert.equal(r.phones.length, 0);
  });
  it("reads Kauppalehti JSON-LD Organization email", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","email":"info@hasan.fi","telephone":"+358401234567"}</script>`;
    const r = parseDirectoryContactHtml(html, "https://www.kauppalehti.fi/yritykset/yritys/123", "kauppalehti");
    assert.equal(r.emails[0]?.value, "info@hasan.fi");
  });
});
