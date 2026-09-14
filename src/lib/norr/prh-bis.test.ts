import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inspectApiRequest, publicHealthBody } from "./api-shield.ts";
import { isTrustedOrigin } from "./security.ts";
import { mergeBootstrap, type Bootstrap } from "../client/bootstrap.ts";

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

  it("keeps previous overview totals when a refetch returns zeros", () => {
    const prev = { ok: true as const, counts: { companies: 4078, people: 11873, runs: 3, openReview: 0, jobsRunning: 0, contacts: 1, sourcesConnected: 8, sourcesTotal: 8 }, recentRuns: [1], recentCompanies: [1], workspace: {}, isAdmin: true, plan: "unlimited", searchesUsed: 0, searchesLimit: -1 };
    const next = { ...prev, counts: { ...prev.counts, companies: 0, people: 0 }, recentRuns: [], recentCompanies: [] };
    const merged = mergeBootstrap(prev as Bootstrap, next as Bootstrap);
    assert.equal(merged.counts.companies, 4078);
    assert.equal(merged.counts.people, 11873);
  });
});
