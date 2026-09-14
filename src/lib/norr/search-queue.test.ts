import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareSearchLanes, searchLane, searchLaneRank } from "./search-queue.ts";

describe("search lane priority", () => {
  it("ranks admin before unlimited before paid before free", () => {
    assert.equal(searchLane({ isAdmin: true, plan: "free" }), "admin");
    assert.equal(searchLane({ isAdmin: false, plan: "unlimited" }), "unlimited");
    assert.equal(searchLane({ isAdmin: false, plan: "pro" }), "pro");
    assert.equal(searchLane({ isAdmin: false, plan: "starter" }), "starter");
    assert.equal(searchLane({ isAdmin: false, plan: "free" }), "free");
    assert.ok(searchLaneRank("admin") < searchLaneRank("unlimited"));
    assert.ok(searchLaneRank("unlimited") < searchLaneRank("pro"));
    assert.ok(searchLaneRank("pro") < searchLaneRank("starter"));
    assert.ok(searchLaneRank("starter") < searchLaneRank("free"));
  });

  it("FIFO inside the same lane, higher lane always first", () => {
    const adminLater = { rank: searchLaneRank("admin"), createdAt: 200 };
    const freeEarlier = { rank: searchLaneRank("free"), createdAt: 1 };
    assert.ok(compareSearchLanes(adminLater, freeEarlier) < 0);
    const a = { rank: 4, createdAt: 10 };
    const b = { rank: 4, createdAt: 20 };
    assert.ok(compareSearchLanes(a, b) < 0);
  });
});
