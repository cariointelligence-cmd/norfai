import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampScore, fnv1a64, mergeContactsNative, poolMap } from "./engines.ts";
import { runProgress, displayRunStatus } from "./progress.ts";

describe("native kernels (TS fallbacks)", () => {
  it("fnv is stable and 16 hex chars", () => {
    const a = fnv1a64("norf-extract");
    const b = fnv1a64("norf-extract");
    const c = fnv1a64("norf-extract!");
    assert.equal(a, b);
    assert.equal(a.length, 16);
    assert.notEqual(a, c);
    assert.match(a, /^[0-9a-f]{16}$/);
  });

  it("clamp score stays 0-100", () => {
    assert.equal(clampScore(50, 100), 50);
    assert.equal(clampScore(0, 100), 0);
    assert.equal(clampScore(120, 100), 100);
    assert.equal(clampScore(10, 0), 0);
  });

  it("merges contacts preferring published", () => {
    const r = mergeContactsNative([
      { value: "a@x.fi", classification: "inferred" },
      { value: "A@x.fi", classification: "published" },
      { value: "b@x.fi", classification: "inferred" },
    ]);
    assert.equal(r.length, 2);
    assert.equal(r.find((x) => x.value === "a@x.fi")?.classification, "published");
  });

  it("poolMap preserves order with a cap", async () => {
    const out = await poolMap([1, 2, 3, 4, 5], 2, async (n) => {
      await new Promise((r) => setTimeout(r, 4));
      return n * 10;
    });
    assert.deepEqual(out, [10, 20, 30, 40, 50]);
  });
  it("poolMap runs more than 16 workers when asked", async () => {
    const started: number[] = [];
    const n = 20;
    const out = await poolMap(Array.from({ length: n }, (_, i) => i), 20, async (x) => {
      started.push(Date.now());
      await new Promise((r) => setTimeout(r, 8));
      return x;
    });
    assert.equal(out.length, n);
    assert.equal(out[19], 19);
    const span = started[started.length - 1]! - started[0]!;
    assert.ok(span < 80, `workers should start together, span=${span}`);
  });
});

describe("search progress rail", () => {
  it("is 100 when complete and names the live stage", () => {
    assert.equal(runProgress([], "completed").pct, 100);
    const live = runProgress(
      [
        { type: "discover", status: "done" },
        { type: "enrich", status: "running" },
        { type: "enrich", status: "queued" },
        { type: "score", status: "queued" },
      ],
      "running",
    );
    assert.equal(live.stage, "enrich");
    assert.ok(live.pct > 10 && live.pct < 90);
    assert.equal(live.running, true);
    assert.equal(runProgress([], "queued").label, "Opening registers");
  });
  it("names web search while scrape jobs are open", () => {
    const scrape = runProgress(
      [
        { type: "discover", status: "done" },
        { type: "enrich", status: "done" },
        { type: "scrape", status: "running" },
        { type: "score", status: "queued" },
      ],
      "running",
    );
    assert.equal(scrape.stage, "scrape");
    assert.equal(scrape.label, "Web search");
    assert.ok(scrape.pct > 10 && scrape.pct < 99);
  });
  it("queued discover on a running search stays Registers, never 4%", () => {
    const queued = runProgress([{ type: "discover", status: "queued" }], "running");
    const live = runProgress([{ type: "discover", status: "running" }], "running");
    assert.equal(queued.stage, "discover");
    assert.equal(queued.label, "Registers");
    assert.ok(queued.pct >= 20, `queued pct=${queued.pct}`);
    assert.equal(live.stage, "discover");
    assert.equal(live.label, "Registers");
    assert.ok(live.pct >= 20 && live.pct <= 50, `running pct=${live.pct}`);
    assert.equal(queued.label, live.label);
  });
  it("paused and cancelled stay paused/cancelled even with live jobs", () => {
    assert.equal(displayRunStatus("paused", true), "paused");
    assert.equal(displayRunStatus("cancelled", true), "cancelled");
    assert.equal(displayRunStatus("queued", true), "running");
    assert.equal(displayRunStatus("running", false), "running");
  });
});
