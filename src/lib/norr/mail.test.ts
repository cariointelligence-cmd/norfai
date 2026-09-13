import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_KIND,
  composeMailTransport,
  isResendFromFailure,
  isStaleMarketingOutbox,
  mailerStatus,
  parseFrom,
  publicMailOrigin,
  resendSafeFrom,
  validEmail,
} from "./mailer.ts";
import { automationGates } from "./mail-automations.ts";
import { campaignLabel, renderCampaign } from "./mail-copy.ts";
import { gateContent } from "../seo/quality-gate.ts";
import { CANONICAL_ORIGIN, SITE_MAIL_FROM } from "../seo/site.ts";

describe("mailer helpers", () => {
  it("parses from headers and emails", () => {
    assert.deepEqual(parseFrom("Norf <cariointelligence@gmail.com>"), {
      name: "Norf",
      email: "cariointelligence@gmail.com",
    });
    assert.equal(validEmail("Ana@Norf.fi"), "ana@norf.fi");
    assert.equal(validEmail("not-an-email"), null);
  });
  it("reports no provider when env is empty", () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    const st = mailerStatus();
    assert.equal(st.configured, false);
    assert.equal(st.provider, "none");
    if (prev) process.env.RESEND_API_KEY = prev;
  });
  it("keeps public origin on norfai.com", () => {
    assert.equal(publicMailOrigin(), "https://norfai.com");
    assert.equal(CANONICAL_ORIGIN, "https://norfai.com");
  });
  it("treats tests, tickets and welcome as transactional so they are not skipped by marketing unsub", () => {
    assert.equal(CAMPAIGN_KIND.admin_test, "transactional");
    assert.equal(CAMPAIGN_KIND.ticket_opened, "transactional");
    assert.equal(CAMPAIGN_KIND.ticket_reply, "transactional");
    assert.equal(CAMPAIGN_KIND.welcome, "transactional");
    assert.equal(CAMPAIGN_KIND.first_search, "transactional");
    assert.equal(CAMPAIGN_KIND.search_complete, "transactional");
    assert.equal(CAMPAIGN_KIND.billing_failed, "transactional");
    assert.equal(CAMPAIGN_KIND.team_invite, "transactional");
    assert.equal(CAMPAIGN_KIND.no_search_day1, "marketing");
    assert.equal(CAMPAIGN_KIND.weekly_digest, "marketing");
    assert.equal(CAMPAIGN_KIND.winback_1, "marketing");
  });
  it("rewrites Gmail From to the verified norfai.com Resend sender", () => {
    assert.equal(resendSafeFrom("Norf <cariointelligence@gmail.com>"), SITE_MAIL_FROM);
    assert.equal(resendSafeFrom("cariointelligence@gmail.com"), SITE_MAIL_FROM);
    assert.equal(resendSafeFrom(""), SITE_MAIL_FROM);
    assert.equal(resendSafeFrom("Norf <hello@norfai.com>"), "Norf <hello@norfai.com>");
    assert.equal(resendSafeFrom("support@norfai.com"), "Norf <support@norfai.com>");
  });
  it("composes Resend from env key even when admin From is Gmail", () => {
    const t = composeMailTransport({
      envResendKey: "re_test",
      envFrom: "Norf <cariointelligence@gmail.com>",
    });
    assert.equal(t.provider, "resend");
    assert.equal(t.from, SITE_MAIL_FROM);
    assert.equal(t.source, "env");
    assert.equal(t.resendKey, "re_test");
  });
  it("uses admin Resend key and coerces stored Gmail From", () => {
    const t = composeMailTransport({
      db: {
        smtp_host: null,
        smtp_port: null,
        smtp_user: null,
        smtp_pass: null,
        smtp_secure: false,
        resend_api_key: "re_db",
        mail_from: "Norf <cariointelligence@gmail.com>",
      },
    });
    assert.equal(t.provider, "resend");
    assert.equal(t.from, SITE_MAIL_FROM);
    assert.equal(t.source, "db");
  });
  it("marks domain-not-verified Resend errors as from-failures", () => {
    assert.equal(isResendFromFailure("The gmail.com domain is not verified."), true);
    assert.equal(isResendFromFailure("Invalid `from` field."), true);
    assert.equal(isResendFromFailure("timeout"), false);
  });
  it("skips stale marketing but keeps transactional outbox", () => {
    const old = new Date(Date.now() - 12 * 24 * 3600 * 1000);
    assert.equal(isStaleMarketingOutbox({ campaign: "winback_1", created_at: old }), true);
    assert.equal(isStaleMarketingOutbox({ campaign: "welcome", created_at: old }), false);
    assert.equal(isStaleMarketingOutbox({ campaign: "ticket_reply", created_at: old }), false);
  });
});

describe("automation gates", () => {
  const now = Date.parse("2026-09-13T00:00:00Z");
  const day = 24 * 3600 * 1000;
  it("queues welcome and day3 only for recent signups", () => {
    const fresh = automationGates(now, { createdAt: now - 2 * 3600 * 1000, lastSeenAt: now });
    assert.equal(fresh.welcome, true);
    assert.equal(fresh.day3, true);
    assert.equal(fresh.noSearchDay1, false);
    assert.equal(fresh.winback1, false);
    const waiting = automationGates(now, { createdAt: now - 30 * 3600 * 1000, lastSeenAt: now });
    assert.equal(waiting.noSearchDay1, true);
    assert.equal(waiting.welcome, true);
    const old = automationGates(now, { createdAt: now - 20 * day, lastSeenAt: now });
    assert.equal(old.welcome, false);
    assert.equal(old.day3, false);
  });
  it("does not treat missing last-seen as idle", () => {
    const g = automationGates(now, { createdAt: now - 30 * day, lastSeenAt: null });
    assert.equal(g.winback1, false);
    assert.equal(g.winback2, false);
    assert.equal(g.winback3, false);
  });
  it("fires winback only after observed idle time", () => {
    const g = automationGates(now, { createdAt: now - 40 * day, lastSeenAt: now - 15 * day });
    assert.equal(g.winback1, true);
    assert.equal(g.winback2, false);
  });
});

describe("campaign copy", () => {
  it("renders Finnish quota and winback without em dashes", () => {
    const origin = "https://norfai.com";
    for (const campaign of Object.keys(CAMPAIGN_KIND) as Array<keyof typeof CAMPAIGN_KIND>) {
      const mail = renderCampaign(campaign, {
        locale: "fi",
        name: "Ana",
        origin,
        unsubUrl: `${origin}/unsubscribe?token=abc`,
        ticketUrl: `${origin}/support/t/xyz`,
        planLabel: "Starter",
      });
      assert.ok(mail.subject.length >= 8, campaign);
      assert.ok(mail.text.includes("Hei Ana") || mail.html.includes("Hei Ana") || campaign === "ticket_admin", campaign);
      assert.equal(mail.html.includes("\u2014"), false, campaign);
      assert.equal(mail.text.includes("\u2014"), false, campaign);
      assert.equal(campaignLabel(campaign).length > 2, true);
    }
  });
  it("admin test and opened-ticket copy mention the thread", () => {
    const t = renderCampaign("admin_test", { locale: "fi", origin: "https://norfai.com", name: "Ana" });
    assert.match(t.subject, /testiviesti/i);
    assert.match(t.text, /Hei Ana/);
    const o = renderCampaign("ticket_opened", { locale: "fi", origin: "https://norfai.com", name: "Ana", ticketUrl: "https://norfai.com/support/t/xyz" });
    assert.match(o.html, /\/support\/t\/xyz/);
    assert.match(o.subject, /tukipyynnön/);
  });
  it("welcome points at search, quota at billing", () => {
    const w = renderCampaign("welcome", { locale: "fi", origin: "https://norfai.com" });
    assert.match(w.html, /\/search\/new/);
    const q = renderCampaign("quota_search", { locale: "en", origin: "https://norfai.com" });
    assert.match(q.html, /\/billing/);
    assert.match(q.text, /This period's searches are used/);
  });
  it("search complete and empty, invite and digest render facts", () => {
    const origin = "https://norfai.com";
    const done = renderCampaign("search_complete", {
      locale: "fi",
      name: "Ana",
      origin,
      runName: "Turku LVI",
      count: 12,
      contacts: 4,
      ctaUrl: `${origin}/search/abc`,
    });
    assert.match(done.subject, /12 yritystä/);
    assert.match(done.html, /\/search\/abc/);
    const empty = renderCampaign("search_empty", { locale: "fi", origin, name: "Ana", runName: "Turku LVI" });
    assert.match(empty.subject, /ilman rivejä/);
    const invite = renderCampaign("team_invite", { locale: "fi", origin, name: "Ana", inviterName: "Matti" });
    assert.match(invite.text, /Matti/);
    const digest = renderCampaign("weekly_digest", {
      locale: "fi",
      origin,
      name: "Ana",
      count: 3,
      headline: "3 changes · 1 need a look",
      items: ["Acme Oy: website changed"],
    });
    assert.match(digest.html, /\/changes/);
    assert.match(digest.text, /Acme Oy/);
    const failed = renderCampaign("billing_failed", { locale: "en", origin, name: "Ana" });
    assert.match(failed.html, /\/billing/);
  });
});

describe("evergreen news quality", () => {
  it("seed articles pass the content gate", async () => {
    const { evergreenNewsPosts } = await import("./news-seed.ts");
    for (const post of evergreenNewsPosts()) {
      const g = gateContent({ title: post.title, body: post.body, excerpt: post.excerpt });
      assert.equal(g.ok, true, `${post.slug}: ${g.reasons.join("; ")}`);
      assert.ok(post.seoTitle.length >= 15);
      assert.ok(post.seoDescription.length >= 50 && post.seoDescription.length <= 160);
    }
  });
});
