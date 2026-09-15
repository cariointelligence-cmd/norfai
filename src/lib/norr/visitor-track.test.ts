import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyIdentity,
  deviceEngine,
  parseVisitorId,
  sanitizePath,
  shouldSkipPath,
} from "./visitor-track.ts";

describe("visitor engines", () => {
  it("never invents an email for an anonymous visitor", () => {
    const unknown = classifyIdentity({});
    assert.equal(unknown.class, "unknown");
    assert.equal(unknown.email, null);
    assert.equal(unknown.name, null);
  });

  it("prefers the signed-in session, then cookie, then IP", () => {
    const session = classifyIdentity({ sessionEmail: "ana@norf.fi", sessionName: "Ana", cookieEmail: "old@x.fi", ipEmail: "ip@x.fi" });
    assert.equal(session.class, "session");
    assert.equal(session.email, "ana@norf.fi");
    const cookie = classifyIdentity({ cookieEmail: "ana@norf.fi" });
    assert.equal(cookie.class, "cookie_linked");
    const ip = classifyIdentity({ ipEmail: "ana@norf.fi" });
    assert.equal(ip.class, "ip_linked");
  });

  it("parses devices and skips tracking noise", () => {
    assert.equal(deviceEngine("Mozilla/5.0 Chrome/120").family, "Chrome");
    assert.equal(deviceEngine("Googlebot/2.1").bot, true);
    assert.equal(parseVisitorId("not valid"), null);
    assert.equal(shouldSkipPath("/api/health"), true);
    assert.equal(sanitizePath("../etc/passwd"), "/");
  });
});
