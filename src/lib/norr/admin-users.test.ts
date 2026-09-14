import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateTempPassword,
  isPlanId,
  parseAdminEmail,
  parseCreateUserInput,
  parseQuotaGrant,
} from "./admin-user-input.ts";
import { normalizePlanId, withBonus } from "./platform.ts";

describe("admin user create input", () => {
  it("accepts email, optional password, plan and admin flag", () => {
    const r = parseCreateUserInput({
      email: "  Ana@Norf.fi ",
      name: "Ana",
      password: "",
      plan: "pro",
      makeAdmin: true,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.email, "ana@norf.fi");
    assert.equal(r.value.name, "Ana");
    assert.equal(r.value.password, null);
    assert.equal(r.value.plan, "pro");
    assert.equal(r.value.makeAdmin, true);
  });

  it("rejects a short password and a broken email", () => {
    assert.equal(parseCreateUserInput({ email: "not-an-email", plan: "free" }).ok, false);
    assert.equal(parseCreateUserInput({ email: "a@b.fi", password: "123" }).ok, false);
    const ok = parseCreateUserInput({ email: "a@b.fi", password: "longenough", plan: "starter" });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value.password, "longenough");
  });

  it("defaults name from the mailbox and plan to free", () => {
    const r = parseCreateUserInput({ email: "lead@acme.fi" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.name, "lead");
    assert.equal(r.value.plan, "free");
    assert.equal(r.value.makeAdmin, false);
  });
});

describe("plan gifts", () => {
  it("only treats known plan ids as giftable", () => {
    assert.equal(isPlanId("starter"), true);
    assert.equal(isPlanId("pro"), true);
    assert.equal(isPlanId("unlimited"), true);
    assert.equal(isPlanId("free"), true);
    assert.equal(isPlanId("enterprise"), false);
    assert.equal(normalizePlanId("scale"), "unlimited");
    assert.equal(normalizePlanId("nope"), "free");
  });
});

describe("admin quota grant", () => {
  it("accepts a positive search or lead count", () => {
    const a = parseQuotaGrant({ userId: "u1", searches: "25", leads: 0 });
    assert.equal(a.ok, true);
    if (a.ok) {
      assert.equal(a.searches, 25);
      assert.equal(a.leads, 0);
    }
    const b = parseQuotaGrant({ userId: "u1", searches: 0, leads: 100 });
    assert.equal(b.ok, true);
    if (b.ok) assert.equal(b.leads, 100);
    assert.equal(parseQuotaGrant({ userId: "u1" }).ok, false);
    assert.equal(parseQuotaGrant({ userId: "", searches: 1 }).ok, false);
    assert.equal(parseQuotaGrant({ userId: "u1", searches: -3 }).ok, false);
    assert.equal(parseQuotaGrant({ userId: "u1", searches: 200000 }).ok, false);
  });

  it("adds bonus on top of a finite plan and ignores it for unlimited", () => {
    assert.equal(withBonus(50, 20), 70);
    assert.equal(withBonus(-1, 999), -1);
  });
});

describe("generated password", () => {
  it("is long enough to sign in", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    assert.equal(a.length, 16);
    assert.notEqual(a, b);
    assert.match(a, /^[A-Za-z0-9]+$/);
  });
});

describe("admin email", () => {
  it("lowercases and rejects junk", () => {
    assert.equal(parseAdminEmail("CarIO@Norf.FI"), "cario@norf.fi");
    assert.equal(parseAdminEmail("nope"), null);
    assert.equal(parseAdminEmail(""), null);
  });
});
