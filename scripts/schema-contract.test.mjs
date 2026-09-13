import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findDrift, loadContract } from "./schema-contract.mjs";

describe("schema contract", () => {
  it("declares search_runs.updated_at so Find missing emails cannot crash", async () => {
    const schema = await loadContract();
    assert.ok(schema.get("search_runs")?.has("updated_at"));
    assert.ok(schema.get("jobs")?.has("lease_until"));
    assert.ok(schema.get("company_capabilities")?.has("status"));
  });
  it("has no SQL writes to undeclared columns", async () => {
    const { drift } = await findDrift();
    assert.deepEqual(drift, [], drift.map((d) => `${d.file}:${d.table}.${d.column}`).join("\n"));
  });
});
