import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyQueuePressure,
  shouldRetireChildCrawls,
  shouldStealStaleLocks,
  shouldPersistQueueSnapshot,
  liveQueueFromCounts,
  oldestQueuedMsFromJobs,
  formatQueueAge,
  queuePressureLabel,
  aggregateQueueRows,
  shouldRetireFinishedRunJob,
  liveJobsPerRunCap,
  shouldForceDrainOptional,
  QUEUE_HEALTHY_MAX,
  QUEUE_OVERLOAD_MIN,
  QUEUE_SNAPSHOT_MIN_MS,
} from "./queue-monitor.ts";

describe("worker queue pressure", () => {
  it("treats an empty queue as idle", () => {
    assert.equal(classifyQueuePressure({
      queued: 0, running: 0, childCrawls: 0, oldestQueuedMs: null, staleRunning: 0,
    }), "idle");
    assert.equal(queuePressureLabel("idle"), "Idle");
  });

  it("treats a 300-company enrich batch as healthy, not overloaded", () => {
    assert.equal(classifyQueuePressure({
      queued: 300, running: 12, childCrawls: 0, oldestQueuedMs: 8_000, staleRunning: 0,
    }), "healthy");
    assert.ok(300 + 12 < QUEUE_HEALTHY_MAX);
  });

  it("marks leftover child crawls as busy and a fan-out leak as overloaded", () => {
    assert.equal(classifyQueuePressure({
      queued: 40, running: 4, childCrawls: 1, oldestQueuedMs: 2_000, staleRunning: 0,
    }), "elevated");
    assert.equal(classifyQueuePressure({
      queued: 2000, running: 4307, childCrawls: 4000, oldestQueuedMs: 3 * 60 * 60 * 1000, staleRunning: 12,
    }), "overloaded");
    assert.ok(2000 + 4307 > QUEUE_OVERLOAD_MIN);
    assert.equal(shouldRetireChildCrawls(1), true);
    assert.equal(shouldRetireChildCrawls(0), false);
    assert.equal(shouldStealStaleLocks(3), true);
    assert.equal(shouldStealStaleLocks(0), false);
  });

  it("cancels leftover jobs on finished runs and caps live jobs per search", () => {
    assert.equal(shouldRetireFinishedRunJob("completed", "queued"), true);
    assert.equal(shouldRetireFinishedRunJob("cancelled", "running"), true);
    assert.equal(shouldRetireFinishedRunJob("running", "queued"), false);
    assert.equal(shouldRetireFinishedRunJob("completed", "done"), false);
    assert.equal(liveJobsPerRunCap(100), 180);
    assert.equal(liveJobsPerRunCap(5), 24);
    assert.equal(shouldForceDrainOptional({ pressure: "overloaded", oldestQueuedMs: 1000, depth: 491 }), true);
    assert.equal(shouldForceDrainOptional({ pressure: "healthy", oldestQueuedMs: 8 * 60 * 60 * 1000, depth: 40 }), true);
    assert.equal(shouldForceDrainOptional({ pressure: "healthy", oldestQueuedMs: 8_000, depth: 20 }), false);
  });

  it("overloads when the oldest queued job is 15+ minutes on a large queue", () => {
    assert.equal(classifyQueuePressure({
      queued: 500, running: 12, childCrawls: 0, oldestQueuedMs: 16 * 60 * 1000, staleRunning: 0,
    }), "overloaded");
    assert.equal(classifyQueuePressure({
      queued: 20, running: 2, childCrawls: 0, oldestQueuedMs: 16 * 60 * 1000, staleRunning: 0,
    }), "elevated");
  });
});

describe("queue snapshot aggregation", () => {
  it("splits queued vs running by type and keeps oldest queued age", () => {
    const snap = aggregateQueueRows([
      { type: "enrich", status: "queued", n: 288, oldest_s: 40 },
      { type: "enrich", status: "running", n: 12, oldest_s: 8 },
      { type: "crawl", status: "queued", n: 80, oldest_s: 120 },
      { type: "score", status: "done", n: 50, oldest_s: 9 },
    ], { childCrawls: 80, staleRunning: 0, users: 1, runs: 1 });
    assert.equal(snap.queued, 368);
    assert.equal(snap.running, 12);
    assert.equal(snap.depth, 380);
    assert.equal(snap.oldestQueuedMs, 120_000);
    assert.equal(snap.childCrawls, 80);
    assert.equal(snap.pressure, "overloaded");
    const crawl = snap.byType.find((t) => t.type === "crawl");
    assert.equal(crawl?.queued, 80);
    assert.equal(snap.byType.some((t) => t.type === "score"), false);
  });

  it("counts only live jobs from Face jobCounts", () => {
    const live = liveQueueFromCounts([
      { type: "enrich", status: "done", n: 300 },
      { type: "crawl", status: "cancelled", n: 4000 },
      { type: "score", status: "queued", n: 40 },
      { type: "score", status: "running", n: 8 },
    ]);
    assert.equal(live.queued, 40);
    assert.equal(live.running, 8);
    assert.equal(live.depth, 48);
  });

  it("formats oldest job age for the Face", () => {
    assert.equal(formatQueueAge(null), "—");
    assert.equal(formatQueueAge(400), "<1s");
    assert.equal(formatQueueAge(12_000), "12s");
    assert.equal(formatQueueAge(3 * 60 * 1000), "3 min");
    assert.equal(formatQueueAge(3 * 60 * 60 * 1000), "3 h");
    const now = Date.parse("2026-09-13T10:00:00Z");
    assert.equal(oldestQueuedMsFromJobs([
      { status: "done", created_at: "2026-09-13T07:00:00Z" },
      { status: "queued", created_at: "2026-09-13T09:50:00Z" },
      { status: "running", created_at: "2026-09-13T09:40:00Z" },
    ], now), 20 * 60 * 1000);
  });
});

describe("queue snapshot persist throttle", () => {
  it("writes on first sample, pressure change, jump, or 15s elapsed", () => {
    assert.equal(shouldPersistQueueSnapshot({
      now: 1000, lastPersistAt: 0, pressure: "healthy", lastPressure: "", depth: 10, lastDepth: -1,
    }), true);
    assert.equal(shouldPersistQueueSnapshot({
      now: 2000, lastPersistAt: 1000, pressure: "healthy", lastPressure: "healthy", depth: 12, lastDepth: 10,
    }), false);
    assert.equal(shouldPersistQueueSnapshot({
      now: 2000, lastPersistAt: 1000, pressure: "overloaded", lastPressure: "healthy", depth: 12, lastDepth: 10,
    }), true);
    assert.equal(shouldPersistQueueSnapshot({
      now: 2000, lastPersistAt: 1000, pressure: "healthy", lastPressure: "healthy", depth: 80, lastDepth: 10,
    }), true);
    assert.equal(shouldPersistQueueSnapshot({
      now: 1000 + QUEUE_SNAPSHOT_MIN_MS, lastPersistAt: 1000, pressure: "healthy", lastPressure: "healthy", depth: 12, lastDepth: 10,
    }), true);
  });
});
