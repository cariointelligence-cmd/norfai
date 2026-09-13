import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("P0 Find missing emails regression", () => {
  it("re-queues done enrich jobs instead of returning them idle", () => {
    const repo = readFileSync(new URL("../src/lib/norr/repo.ts", import.meta.url), "utf8");
    assert.match(repo, /generation = generation \+ 1/);
    assert.match(repo, /status in \('done','failed','cancelled'\)/);
    assert.match(repo, /type === "email"/);
  });
  it("Find missing does not depend on a missing search_runs.updated_at write without a migration", () => {
    const mig = readFileSync(new URL("../migrations/0015_core_recovery.sql", import.meta.url), "utf8");
    assert.match(mig, /alter table search_runs add column if not exists updated_at/);
  });
  it("does not full-scan the workspace inside reEnrichCompanies", () => {
    const actions = readFileSync(new URL("../src/lib/norr/actions.ts", import.meta.url), "utf8");
    const fn = actions.slice(actions.indexOf("export const reEnrichCompanies"), actions.indexOf("export const getCompany"));
    assert.equal(fn.includes("backfillCompanyContacts"), false);
    assert.match(fn, /enqueueJob\(sql, context.userId, "email"/);
    assert.equal(fn.includes('status = ${"running"}'), false);
  });
  it("does not cancel email jobs on completed searches", () => {
    const pipe = readFileSync(new URL("../src/lib/norr/pipeline.ts", import.meta.url), "utf8");
    assert.match(pipe, /emailRecovery: true/);
    assert.match(pipe, /kickSearchExecution/);
    assert.match(pipe, /type = \$\{"email"\}/);
  });
});
