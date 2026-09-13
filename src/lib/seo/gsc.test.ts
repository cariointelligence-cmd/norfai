import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleAuthUrl,
  CANONICAL_GSC_ORIGIN,
  gscCallbackHtml,
  gscCallbackOrigin,
  gscDateRange,
  gscRedirectUri,
  hintClientId,
  isGoogleClientId,
  mapAnalyticsRows,
  mapTotals,
  openSecret,
  parseServiceAccountJson,
  publicGscError,
  publicViewFromRow,
  sealSecret,
  snapshotIsFresh,
  type GscRow,
} from "./gsc.ts";

describe("gsc crypto", () => {
  it("round-trips secrets and rejects tampering", () => {
    const packed = sealSecret("refresh-token-value");
    assert.equal(openSecret(packed), "refresh-token-value");
    assert.equal(openSecret(packed.replace("v1.", "v1.x")), null);
    assert.equal(openSecret("not-sealed"), null);
    assert.doesNotMatch(packed, /refresh-token-value/);
  });
});

describe("gsc identity helpers", () => {
  it("accepts only Google OAuth client ids", () => {
    assert.equal(isGoogleClientId("123-abc.apps.googleusercontent.com"), true);
    assert.equal(isGoogleClientId("not-a-client"), false);
    assert.equal(isGoogleClientId("https://evil.example/x"), false);
    assert.ok((hintClientId("12345678-zzzz.apps.googleusercontent.com") ?? "").includes("…"));
    assert.doesNotMatch(hintClientId("12345678-zzzz.apps.googleusercontent.com") ?? "", /12345678-zzzz/);
  });

  it("parses service account json and rejects junk", () => {
    const ok = parseServiceAccountJson(JSON.stringify({
      type: "service_account",
      client_email: "norf@proj.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    }));
    assert.ok(!("error" in ok));
    if (!("error" in ok)) assert.equal(ok.clientEmail, "norf@proj.iam.gserviceaccount.com");
    assert.ok("error" in parseServiceAccountJson("{"));
    assert.ok("error" in parseServiceAccountJson(JSON.stringify({ type: "user" })));
  });
});

describe("gsc analytics mapping", () => {
  it("uses Google rows only and does not invent extras", () => {
    const rows = mapAnalyticsRows([
      { keys: ["norf company search"], clicks: 12.2, impressions: 400, ctr: 0.0305, position: 8.44 },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.key, "norf company search");
    assert.equal(rows[0]?.clicks, 12);
    assert.equal(mapAnalyticsRows(undefined).length, 0);
    assert.equal(mapAnalyticsRows("nope").length, 0);
    const totals = mapTotals({ clicks: 3, impressions: 90, ctr: 0.033, position: 11.2 });
    assert.equal(totals.clicks, 3);
    assert.equal(totals.impressions, 90);
  });

  it("builds a 28-day window that ends 3 days ago", () => {
    const r = gscDateRange(28, new Date("2026-09-09T00:00:00Z"));
    assert.equal(r.endDate, "2026-09-06");
    assert.equal(r.startDate, "2026-08-10");
  });
});

describe("gsc oauth url and callback html", () => {
  it("requests offline access and readonly webmasters scope", () => {
    const url = buildGoogleAuthUrl({
      clientId: "123-abc.apps.googleusercontent.com",
      redirectUri: "https://norfai.com/api/gsc/callback",
      state: "abc",
    });
    assert.match(url, /accounts\.google\.com/);
    assert.match(url, /access_type=offline/);
    assert.match(url, /webmasters\.readonly/);
    assert.match(url, /prompt=consent/);
    assert.doesNotMatch(url, /client_secret/);
  });

  it("does not leak tokens in callback html", () => {
    const html = gscCallbackHtml({ ok: true, message: "Connected", redirect: "/admin/seo?gsc=connected" });
    assert.match(html, /norf-gsc/);
    assert.doesNotMatch(html, /access_token|refresh_token|GOCSPX/);
  });

  it("maps google errors without exposing internals", () => {
    assert.match(publicGscError("invalid_grant"), /revoked/i);
    assert.doesNotMatch(publicGscError("invalid_grant token=xyz"), /xyz/);
  });
});

describe("gsc public view", () => {
  it("stays disconnected and empty without tokens", () => {
    const view = publicViewFromRow(null);
    assert.equal(view.connected, false);
    assert.equal(view.snapshot, null);
    assert.match(view.reason, /not invented/i);
    assert.equal(view.redirectUri, "https://norfai.com/api/gsc/callback");
  });

  it("does not treat a client-only row as connected", () => {
    const row: GscRow = {
      id: "platform",
      mode: "oauth",
      client_id: "123-abc.apps.googleusercontent.com",
      client_secret_enc: sealSecret("secret"),
      refresh_token_enc: null,
      access_token_enc: null,
      access_expires_at: null,
      sa_email: null,
      sa_key_enc: null,
      google_email: null,
      site_url: null,
      sites_json: [],
      snapshot_json: null,
      snapshot_range: null,
      connected_by: null,
      connected_at: null,
      last_sync_at: null,
      last_error: null,
    };
    const view = publicViewFromRow(row);
    assert.equal(view.connected, false);
    assert.equal(view.clientConfigured, true);
    assert.equal(snapshotIsFresh(row), false);
    assert.equal(JSON.stringify(view).includes("secret"), false);
  });
});

describe("gsc production origin", () => {
  it("never advertises grok.me as the Search Console redirect", () => {
    assert.equal(CANONICAL_GSC_ORIGIN, "https://norfai.com");
    assert.equal(gscCallbackOrigin(), "https://norfai.com");
    assert.equal(gscRedirectUri(), "https://norfai.com/api/gsc/callback");
    assert.equal(gscRedirectUri("https://heart-iris-dune-sage.grok.me"), "https://norfai.com/api/gsc/callback");
    assert.doesNotMatch(gscRedirectUri(), /grok\.me/);
  });
});
