import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inspectApiRequest, publicHealthBody } from "./api-shield.ts";
import { isTrustedOrigin } from "./security.ts";

describe("api shield", () => {
  it("rejects scanner user-agents", () => {
    const r = inspectApiRequest(new Request("https://www.norfai.com/api/health", { headers: { "user-agent": "sqlmap/1.7" } }));
    assert.equal(r?.status, 404);
  });

  it("rejects untrusted POST origins", () => {
    const r = inspectApiRequest(new Request("https://www.norfai.com/api/search/start", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
    }));
    assert.equal(r?.status, 403);
  });

  it("allows trusted production origin", () => {
    assert.equal(isTrustedOrigin("https://www.norfai.com"), true);
    assert.equal(isTrustedOrigin("https://norfai.com"), true);
    assert.equal(isTrustedOrigin("https://attacker.vercel.app"), false);
    const r = inspectApiRequest(new Request("https://www.norfai.com/api/search/start", {
      method: "POST",
      headers: { origin: "https://www.norfai.com", "content-type": "application/json" },
    }));
    assert.equal(r, null);
  });

  it("hides internals on public health", () => {
    const body = publicHealthBody("test");
    assert.equal(body.ok, true);
    assert.equal("deploy" in body, false);
    assert.equal("provision" in body, false);
  });
});
