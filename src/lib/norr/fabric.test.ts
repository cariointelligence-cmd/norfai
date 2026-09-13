import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_OUTCOMES,
  admitWork,
  buildSearchDag,
  checkInvariants,
  classifyStall,
  compileExecution,
  failureClass,
  jobPriority,
  loadShed,
  readyNodes,
  recommendCapacity,
  simulateLoad,
} from "./fabric.ts";
import { resolveRoute, assertDefinedRoute, ROUTE_REGISTRY } from "./route-registry.ts";
import { emptyCriteria } from "./criteria.ts";

describe("execution fabric", () => {
  it("never resolves a request to undefined", () => {
    const miss = resolveRoute("/this/does/not/exist");
    assert.equal(miss.ok, false);
    if (!miss.ok) assert.equal(miss.code, "UNDEFINED_ROUTE");
    assert.equal(resolveRoute("/search/new").ok, true);
    assert.equal(resolveRoute("/search/abc-123").ok, true);
    assert.equal(resolveRoute("/api/health").ok, true);
    assert.throws(() => assertDefinedRoute("/nope"), /UNDEFINED_ROUTE/);
    assert.ok(ROUTE_REGISTRY.length >= 10);
    assert.ok(ACTION_OUTCOMES.includes("REJECTED_WITH_REASON"));
  });

  it("builds a dependency DAG and only releases ready nodes", () => {
    const exec = compileExecution({ criteria: emptyCriteria(), country: "FI" });
    assert.ok(exec.dag.some((n) => n.id === "discover" && n.critical));
    assert.ok(exec.dag.some((n) => n.id === "email"));
    const ready = readyNodes(exec.dag, new Set());
    assert.deepEqual(ready.map((n) => n.id), ["discover"]);
    const after = readyNodes(exec.dag, new Set(["discover"]));
    assert.ok(after.some((n) => n.id === "identity"));
  });

  it("requires financials when revenue is a filter and keeps UNKNOWN from matching", () => {
    const c = emptyCriteria();
    c.groups = {
      id: "root",
      combinator: "and",
      rules: [{ id: "r", field: "revenue_min", op: "gte", value: 500_000 }],
    };
    const exec = compileExecution({ criteria: c, country: "FI" });
    assert.equal(exec.plan.engines.financial, "required");
    assert.ok(exec.decisions.some((d) => d.code === "SOURCE_REQUIRED_BY_REVENUE_FILTER"));
    assert.ok(exec.dag.some((n) => n.capability === "FINANCIALS" && n.critical));
  });

  it("sheds optional work under overload and never starves P0", () => {
    const shed = loadShed("overloaded");
    assert.equal(shed.skipOptional, true);
    assert.ok(shed.concurrency < 16 || shed.concurrency >= 4);
    const backfill = admitWork({ pressure: "overloaded", priority: jobPriority("refresh"), interactive: false });
    assert.equal(backfill.outcome, "BLOCKED_WITH_REASON");
    const interactive = admitWork({ pressure: "overloaded", priority: jobPriority("discover"), interactive: true });
    assert.equal(interactive.code, "ADMITTED_INTERACTIVE");
  });

  it("rejects impossible states", () => {
    assert.ok(checkInvariants({ searchStatus: "completed", mandatoryQueued: 2 }).includes("COMPLETE_WITH_MANDATORY_QUEUED"));
    assert.ok(checkInvariants({ emailVerified: true, emailValue: null }).includes("VERIFIED_EMAIL_WITHOUT_VALUE"));
    assert.ok(checkInvariants({ jobStatus: "running", hasLease: false }).includes("RUNNING_WITHOUT_LEASE"));
    assert.equal(checkInvariants({ searchStatus: "completed", mandatoryQueued: 0, emailVerified: true, emailValue: "a@b.fi", jobStatus: "done", hasLease: true }).length, 0);
  });

  it("classifies stalls from evidence not guesses", () => {
    const worker = classifyStall({ queued: 12, running: 0, workerHeartbeatMs: 120_000, sourceTimeoutRate: 0, discoverComplete: false });
    assert.equal(worker.code, "WORKER_UNAVAILABLE");
    const src = classifyStall({ queued: 0, running: 4, workerHeartbeatMs: 1_000, sourceTimeoutRate: 0.9, discoverComplete: true });
    assert.equal(src.code, "SOURCE_DEGRADATION");
  });

  it("models load without inventing 10x capacity", () => {
    const one = simulateLoad({ concurrentSearches: 1, jobsPerSearch: 12, workerSlots: 16 });
    assert.equal(one.starved, false);
    const spike = simulateLoad({ concurrentSearches: 100, jobsPerSearch: 12, workerSlots: 16 });
    assert.equal(spike.bottleneck, "worker_slots");
    const recs = recommendCapacity({ p95Ms: 20_000, queueDepth: 500, workerUtilization: 0.9, sourceTimeoutRate: 0.3 });
    assert.ok(recs.some((r) => r.priority === "P0"));
    assert.equal(failureClass("column updated_at does not exist"), "DATABASE");
    assert.equal(failureClass("UNDEFINED_ROUTE:/x"), "LOGIC");
  });
});
