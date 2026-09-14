import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyEmailTerminal, emailJobPriority, EMAIL_ENGINE_VERSION } from "./email-contact.ts";
import { directoriesNeeded, finderNeeded } from "./contact-plan.ts";
import { isJobType } from "./security.ts";

describe("email contact recovery", () => {
  it("allows the email job type", () => {
    assert.equal(isJobType("email"), true);
    assert.equal(emailJobPriority("email"), 0);
    assert.ok(EMAIL_ENGINE_VERSION.startsWith("email_contact"));
  });
  it("runs directories when recovering email even if a phone already exists", () => {
    assert.equal(directoriesNeeded({ emails: 0, phones: 1 }), true);
    assert.equal(directoriesNeeded({ emails: 0, phones: 1, emailRecovery: true }), true);
    assert.equal(finderNeeded({ emails: 0, depth: "normal" }), false);
    assert.equal(finderNeeded({ emails: 0, emailRecovery: true }), true);
  });
  it("classifies published vs inferred vs no public email", () => {
    assert.equal(classifyEmailTerminal({ published: 1, inferred: 0, domainTried: true, pagesTried: 3, website: "https://x.fi" }), "EMAIL_FOUND_PUBLISHED");
    assert.equal(classifyEmailTerminal({ published: 0, inferred: 1, domainTried: true, pagesTried: 3, website: "https://x.fi" }), "EMAIL_FOUND_INFERRED");
    assert.equal(classifyEmailTerminal({ published: 0, inferred: 0, domainTried: true, pagesTried: 4, website: "https://x.fi" }), "NO_PUBLIC_EMAIL_FOUND");
    assert.equal(classifyEmailTerminal({ published: 0, inferred: 0, domainTried: false, pagesTried: 0 }), "NO_VALID_DOMAIN");
  });
});
