import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateTempPassword,
  isPlanId,
  parseAdminEmail,
  parseCreateUserInput,
} from "./admin-user-input.ts";
import { normalizePlanId } from "./platform.ts";

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
