import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DRAIN_MAX_DEPTH,
  DRAIN_PATH,
  executionPlane,
  isVercelRuntime,
  shouldChain,
  vercelFunctionBudgetMs,
  vercelSelfOrigin,
} from "./vercel-executor.ts";
import { EXECUTION_TARGETS } from "./hybrid.ts";
import { resolveRoute } from "./route-registry.ts";
import { SERVICE_SCOPES } from "./internal-auth.ts";
import { provisionCarioNorfai, vercelTokenPresent } from "./vercel-provision.ts";

describe("vercel execution plane", () => {
  it("maps every engine to a Vercel function, never an external worker", () => {
    for (const t of Object.values(EXECUTION_TARGETS)) {
      assert.match(t.target, /^VERCEL_/);
    }
    assert.equal(executionPlane().plane, "vercel");
    assert.equal(executionPlane().legacyBackend, "retired");
    assert.equal(executionPlane().selfDrain, true);
    assert.equal(DRAIN_PATH, "/api/jobs/drain");
    assert.ok(resolveRoute("/api/jobs/drain", "POST").ok);
  });

  it("chains remaining work and stops at depth cap", () => {
    assert.equal(shouldChain(3, 1), true);
    assert.equal(shouldChain(0, 1), false);
    assert.equal(shouldChain(9, DRAIN_MAX_DEPTH), false);
    assert.ok(vercelFunctionBudgetMs() >= 8_000);
    assert.equal(typeof isVercelRuntime(), "boolean");
    const origin = vercelSelfOrigin();
    if (origin) assert.match(origin, /^https?:\/\//);
    const prev = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://www.norfai.com";
    assert.equal(vercelSelfOrigin(), "https://www.norfai.com");
    if (prev === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = prev;
  });

  it("authorizes drain as a worker/cron scope", () => {
    assert.ok(SERVICE_SCOPES.worker.includes("jobs.drain"));
    assert.ok(SERVICE_SCOPES.cron.includes("jobs.drain"));
  });
});

describe("cario provision", () => {
  it("reports absent token without calling Vercel", async () => {
    const prev = process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_TOKEN;
    try {
      assert.equal(vercelTokenPresent(), false);
      const r = await provisionCarioNorfai();
      assert.equal(r.tokenPresent, false);
      assert.equal(r.carioAccessible, false);
      assert.match(r.error || "", /VERCEL_TOKEN absent/);
    } finally {
      if (prev != null) process.env.VERCEL_TOKEN = prev;
      else delete process.env.VERCEL_TOKEN;
    }
  });
});
