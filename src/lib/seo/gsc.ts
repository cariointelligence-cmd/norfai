import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { SignJWT, importPKCS8 } from "jose";
import type { Sql } from "../db.ts";
import { isoTime } from "../format.ts";
import { safeFetch } from "../norr/ssrf.ts";
import type { GscMetricRow, GscMode, GscPublicView, GscSite, GscSitemap, GscSnapshot, GscTotals } from "./gsc-types.ts";

export type { GscMetricRow, GscMode, GscPublicView, GscSite, GscSitemap, GscSnapshot, GscTotals } from "./gsc-types.ts";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GSC_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GSC_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GSC_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
export const GSC_SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
export const GSC_ROW_ID = "platform";
export const CANONICAL_GSC_ORIGIN = "https://norfai.com";
export const CANONICAL_GSC_WWW = "https://www.norfai.com";
export const DISCONNECTED_REASON =
  "Google Search Console is not connected. Connect it to see queries, impressions and CTR. Rankings are not invented.";

export type GscRow = {
  id: string;
  mode: GscMode | string | null;
  client_id: string | null;
  client_secret_enc: string | null;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_expires_at: string | Date | null;
  sa_email: string | null;
  sa_key_enc: string | null;
  google_email: string | null;
  site_url: string | null;
  sites_json: unknown;
  snapshot_json: unknown;
  snapshot_range: unknown;
  connected_by: string | null;
  connected_at: string | Date | null;
  last_sync_at: string | Date | null;
  last_error: string | null;
};

type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function secretKey() {
  const raw = env("GSC_TOKEN_KEY") || env("BETTER_AUTH_SECRET") || env("CRON_SECRET") || "norf-gsc-local";
  return createHash("sha256").update(`norf:gsc:v1:${raw}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${tag.toString("base64url")}`;
}

export function openSecret(packed: string | null | undefined): string | null {
  if (!packed) return null;
  const [v, ivB, encB, tagB] = packed.split(".");
  if (v !== "v1" || !ivB || !encB || !tagB) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encB, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function isGoogleClientId(id: string): boolean {
  return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim());
}

export function hintClientId(id: string | null | undefined): string | null {
  if (!id) return null;
  const v = id.trim();
  if (v.length < 18) return `${v.slice(0, 4)}…`;
  return `${v.slice(0, 8)}…${v.slice(-18)}`;
}

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function gscDateRange(days = 28, now = new Date()): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, days) - 1));
  return { startDate: isoDateUtc(start), endDate: isoDateUtc(end) };
}

export function publicGscError(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("invalid_grant") || t.includes("revoked")) return "Google access was revoked. Connect Search Console again.";
  if (t.includes("invalid_client")) return "OAuth client ID or secret is not valid.";
  if (t.includes("redirect_uri")) return "Redirect URI is not authorized on the Google OAuth client.";
  if (t.includes("access_denied")) return "Google sign-in was cancelled.";
  if (t.includes("insufficient") || t.includes("403")) return "This Google account has no Search Console permission for the selected property.";
  if (t.includes("not found") || t.includes("404")) return "Search Console property was not found.";
  if (t.includes("rate") || t.includes("429")) return "Search Console rate limit. Try again in a minute.";
  return "Search Console request failed. Rankings are not invented, so nothing is shown.";
}

function asNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function mapAnalyticsRows(rows: unknown, limit = 25): GscMetricRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, limit).map((row) => {
    const r = row as { keys?: unknown[]; clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown };
    return {
      key: Array.isArray(r.keys) && r.keys[0] != null ? String(r.keys[0]) : "",
      clicks: Math.round(asNum(r.clicks)),
      impressions: Math.round(asNum(r.impressions)),
      ctr: asNum(r.ctr),
      position: asNum(r.position),
    };
  });
}

export function mapTotals(row: unknown): GscTotals {
  const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  return {
    clicks: Math.round(asNum(r.clicks)),
    impressions: Math.round(asNum(r.impressions)),
    ctr: asNum(r.ctr),
    position: asNum(r.position),
  };
}

export function parseServiceAccountJson(raw: string): { clientEmail: string; privateKey: string } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Service account JSON is not valid." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "Service account JSON is not valid." };
  const o = parsed as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "";
  const clientEmail = typeof o.client_email === "string" ? o.client_email.trim() : "";
  const privateKey = typeof o.private_key === "string" ? o.private_key.replace(/\\n/g, "\n") : "";
  if (type && type !== "service_account") return { error: "JSON is not a Google service account key." };
  if (!clientEmail.endsWith(".iam.gserviceaccount.com") && !clientEmail.includes("@")) return { error: "Service account email is missing." };
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return { error: "Service account private key is missing." };
  return { clientEmail, privateKey };
}

function inboundRequest(): Request | null {
  try {
    const nodeRequire = createRequire(import.meta.url);
    const mod = nodeRequire("@tanstack/react-start/server") as { getRequest?: () => Request | null };
    return typeof mod.getRequest === "function" ? (mod.getRequest() ?? null) : null;
  } catch {
    return null;
  }
}

function isLocalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}

export function gscCallbackOrigin(): string {
  try {
    const req = inboundRequest();
    if (req) {
      const xf = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
      const hostHeader = (req.headers.get("host") ?? "").trim();
      let host = xf || hostHeader;
      if (host.startsWith("0.0.0.0")) host = host.replace("0.0.0.0", "localhost");
      if (host && isLocalHost(host)) {
        const protoHeader = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
        return `${protoHeader || "http"}://${host}`.replace(/\/$/, "");
      }
    }
  } catch {
    /* no request context */
  }
  const envUrl = (env("PUBLIC_SITE_URL") || "").replace(/\/$/, "");
  if (/^https:\/\/www\.norfai\.com$/i.test(envUrl)) return CANONICAL_GSC_WWW;
  return CANONICAL_GSC_ORIGIN;
}

export function gscRedirectUri(origin = gscCallbackOrigin()): string {
  const o = (origin || CANONICAL_GSC_ORIGIN).replace(/\/$/, "");
  if (/grok\.me|grok-sandbox/i.test(o)) return `${CANONICAL_GSC_ORIGIN}/api/gsc/callback`;
  return `${o}/api/gsc/callback`;
}

export function buildGoogleAuthUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL(GSC_AUTH_URL);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GSC_SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", opts.state);
  return u.toString();
}

export function gscCallbackHtml(opts: { ok: boolean; message: string; redirect: string }): string {
  const ok = opts.ok ? "true" : "false";
  const msg = opts.message.replace(/[<>]/g, "");
  const redir = opts.redirect.startsWith("/") || opts.redirect.startsWith("http") ? opts.redirect : "/admin/seo";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Search Console</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a0c;color:#ece8e1;font:15px/1.45 "IBM Plex Sans",system-ui,sans-serif}
  .box{max-width:28rem;padding:2rem;border:1px solid rgb(236 232 225 / 0.1);background:#111318}
  p{margin:0;color:#8b909c}
</style></head>
<body><div class="box"><p>${msg}</p></div>
<script>
(function(){
  var payload = { type: "norf-gsc", ok: ${ok} };
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
      return;
    }
  } catch (e) {}
  window.location.replace(${JSON.stringify(redir)});
})();
<\/script></body></html>`;
}

async function postForm(url: string, body: Record<string, string>): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string; status: number }> {
  try {
    const res = await safeFetch(url, {
      method: "POST",
      timeoutMs: 15000,
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    let json: Record<string, unknown> = {};
    try {
      json = res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        error: typeof json.error_description === "string" ? json.error_description : typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
        status: res.status,
      };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed", status: 0 };
  }
}

async function gscGet(url: string, token: string): Promise<{ ok: true; data: any } | { ok: false; error: string; status: number }> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 15000,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    let json: any = null;
    try {
      json = res.body ? JSON.parse(res.body) : null;
    } catch {
      json = null;
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: json && typeof json === "object" ? json.error?.message ?? `HTTP ${res.status}` : `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed", status: 0 };
  }
}

async function gscPost(url: string, token: string, body: unknown): Promise<{ ok: true; data: any } | { ok: false; error: string; status: number }> {
  try {
    const res = await safeFetch(url, {
      method: "POST",
      timeoutMs: 20000,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = res.body ? JSON.parse(res.body) : null;
    } catch {
      json = null;
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: json && typeof json === "object" ? json.error?.message ?? `HTTP ${res.status}` : `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed", status: 0 };
  }
}

export function envGscClient(): { clientId: string; clientSecret: string } | null {
  const clientId = env("GSC_CLIENT_ID") || env("GOOGLE_GSC_CLIENT_ID");
  const clientSecret = env("GSC_CLIENT_SECRET") || env("GOOGLE_GSC_CLIENT_SECRET");
  if (clientId && clientSecret && isGoogleClientId(clientId)) return { clientId, clientSecret };
  return null;
}

export async function ensureGscSchema(sql: Sql): Promise<void> {
  await sql.query(`create table if not exists gsc_connections (
    id text primary key,
    mode text not null default 'oauth',
    client_id text,
    client_secret_enc text,
    refresh_token_enc text,
    access_token_enc text,
    access_expires_at timestamptz,
    sa_email text,
    sa_key_enc text,
    google_email text,
    site_url text,
    sites_json jsonb not null default '[]',
    snapshot_json jsonb,
    snapshot_range jsonb,
    connected_by text,
    connected_at timestamptz,
    last_sync_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await sql.query(`create table if not exists gsc_oauth_states (
    state text primary key,
    user_id text not null,
    redirect_origin text,
    created_at timestamptz not null default now()
  )`);
  await sql.query("create index if not exists gsc_oauth_states_created_idx on gsc_oauth_states (created_at desc)");
}

export async function loadGscRow(sql: Sql): Promise<GscRow | null> {
  await ensureGscSchema(sql);
  return (await sql`select id, mode, client_id, client_secret_enc, refresh_token_enc, access_token_enc,
    access_expires_at, sa_email, sa_key_enc, google_email, site_url, sites_json, snapshot_json, snapshot_range,
    connected_by, connected_at, last_sync_at, last_error
    from gsc_connections where id = ${"platform"} limit 1`)[0] as GscRow ?? null;
}

export async function upsertGscRow(sql: Sql, patch: Partial<GscRow>): Promise<void> {
  await ensureGscSchema(sql);
  await sql`
    insert into gsc_connections (id) values (${GSC_ROW_ID})
    on conflict (id) do nothing`;
  const next = { ...(await loadGscRow(sql) ?? { id: "platform", mode: "oauth" }), ...patch };
  await sql`
    update gsc_connections set
      mode = ${next.mode ?? "oauth"},
      client_id = ${next.client_id ?? null},
      client_secret_enc = ${next.client_secret_enc ?? null},
      refresh_token_enc = ${next.refresh_token_enc ?? null},
      access_token_enc = ${next.access_token_enc ?? null},
      access_expires_at = ${next.access_expires_at ?? null},
      sa_email = ${next.sa_email ?? null},
      sa_key_enc = ${next.sa_key_enc ?? null},
      google_email = ${next.google_email ?? null},
      site_url = ${next.site_url ?? null},
      sites_json = ${JSON.stringify(next.sites_json ?? [])}::jsonb,
      snapshot_json = ${next.snapshot_json == null ? null : JSON.stringify(next.snapshot_json)}::jsonb,
      snapshot_range = ${next.snapshot_range == null ? null : JSON.stringify(next.snapshot_range)}::jsonb,
      connected_by = ${next.connected_by ?? null},
      connected_at = ${next.connected_at ?? null},
      last_sync_at = ${next.last_sync_at ?? null},
      last_error = ${next.last_error ?? null},
      updated_at = now()
    where id = ${GSC_ROW_ID}`;
}

export function resolveStoredClient(row: GscRow | null): { clientId: string; clientSecret: string } | null {
  const fromEnv = envGscClient();
  if (fromEnv) return fromEnv;
  if (!row?.client_id) return null;
  const secret = openSecret(row.client_secret_enc);
  if (!secret || !isGoogleClientId(row.client_id)) return null;
  return { clientId: row.client_id, clientSecret: secret };
}

export function emptyGscView(reason: string, extra: Partial<GscPublicView> = {}): GscPublicView {
  return {
    connected: false,
    reason,
    clientConfigured: false,
    clientIdHint: null,
    redirectUri: gscRedirectUri(),
    mode: null,
    googleEmail: null,
    serviceAccountEmail: null,
    siteUrl: null,
    lastSyncAt: null,
    lastError: null,
    sites: [],
    snapshot: null,
    ...extra,
  };
}

function asSites(raw: unknown): GscSite[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      const o = s as { siteUrl?: unknown; permissionLevel?: unknown };
      return {
        siteUrl: typeof o.siteUrl === "string" ? o.siteUrl : "",
        permissionLevel: typeof o.permissionLevel === "string" ? o.permissionLevel : "",
      };
    })
    .filter((s) => s.siteUrl);
}

function asSnapshot(raw: unknown): GscSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<GscSnapshot>;
  if (!o.range || !o.totals || !Array.isArray(o.queries)) return null;
  return o as GscSnapshot;
}

export function publicViewFromRow(row: GscRow | null): GscPublicView {
  const client = resolveStoredClient(row);
  const hasOAuthTokens = Boolean(row?.refresh_token_enc);
  const hasSa = Boolean(row?.sa_email && row?.sa_key_enc);
  const connected = hasOAuthTokens || hasSa;
  if (!connected) {
    return emptyGscView(
      client
        ? "Google Search Console is not connected. Connect the Google account that owns the Norf property. Rankings are not invented."
        : "Google Search Console is not connected. Save a Google OAuth client (Search Console API) or a service account, then connect. Rankings are not invented.",
      {
        clientConfigured: Boolean(client),
        clientIdHint: hintClientId(client?.clientId ?? row?.client_id),
        mode: (row?.mode as GscMode) ?? null,
        serviceAccountEmail: row?.sa_email ?? null,
        lastError: row?.last_error ?? null,
      },
    );
  }
  const snapshot = asSnapshot(row?.snapshot_json);
  const reason = row?.site_url
    ? snapshot
      ? `Connected. Data from Google Search Console for ${row.site_url}.`
      : "Connected. Select refresh to load queries, impressions and CTR from Google."
    : "Connected. Select the Search Console property to load rankings.";
  return {
    connected: true,
    reason,
    clientConfigured: Boolean(client) || hasSa,
    clientIdHint: hintClientId(client?.clientId ?? row?.client_id),
    redirectUri: gscRedirectUri(),
    mode: (row?.mode as GscMode) ?? (hasSa ? "service_account" : "oauth"),
    googleEmail: row?.google_email ?? null,
    serviceAccountEmail: row?.sa_email ?? null,
    siteUrl: row?.site_url ?? null,
    lastSyncAt: isoTime(row?.last_sync_at) ?? null,
    lastError: row?.last_error ?? null,
    sites: asSites(row?.sites_json),
    snapshot,
  };
}

export async function exchangeGscCode(opts: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ ok: true; tokens: TokenSet } | { ok: false; error: string }> {
  const res = await postForm(GSC_TOKEN_URL, {
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  if (!res.ok) return { ok: false, error: publicGscError(res.error) };
  const access = typeof res.json.access_token === "string" ? res.json.access_token : "";
  const refresh = typeof res.json.refresh_token === "string" ? res.json.refresh_token : "";
  const expiresIn = asNum(res.json.expires_in) || 3600;
  if (!access) return { ok: false, error: publicGscError("missing access_token") };
  return {
    ok: true,
    tokens: {
      accessToken: access,
      refreshToken: refresh || undefined,
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    },
  };
}

async function refreshOAuthToken(row: GscRow, client: { clientId: string; clientSecret: string }): Promise<{ ok: true; tokens: TokenSet } | { ok: false; error: string }> {
  const refresh = openSecret(row.refresh_token_enc);
  if (!refresh) return { ok: false, error: "Stored refresh token could not be read." };
  const res = await postForm(GSC_TOKEN_URL, {
    refresh_token: refresh,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: "refresh_token",
  });
  if (!res.ok) return { ok: false, error: publicGscError(res.error) };
  const access = typeof res.json.access_token === "string" ? res.json.access_token : "";
  const expiresIn = asNum(res.json.expires_in) || 3600;
  if (!access) return { ok: false, error: publicGscError("missing access_token") };
  return {
    ok: true,
    tokens: {
      accessToken: access,
      refreshToken: typeof res.json.refresh_token === "string" ? res.json.refresh_token : refresh,
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    },
  };
}

async function serviceAccountToken(email: string, privateKeyPem: string): Promise<{ ok: true; tokens: TokenSet } | { ok: false; error: string }> {
  try {
    const key = await importPKCS8(privateKeyPem, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const res = await postForm(GSC_TOKEN_URL, {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await new SignJWT({ scope: GSC_SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(email)
        .setSubject(email)
        .setAudience(GSC_TOKEN_URL)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(key),
    });
    if (!res.ok) return { ok: false, error: publicGscError(res.error) };
    const access = typeof res.json.access_token === "string" ? res.json.access_token : "";
    const expiresIn = asNum(res.json.expires_in) || 3600;
    if (!access) return { ok: false, error: publicGscError("missing access_token") };
    return { ok: true, tokens: { accessToken: access, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000 } };
  } catch (err) {
    return { ok: false, error: publicGscError(err instanceof Error ? err.message : "jwt") };
  }
}

export async function gscAccessToken(sql: Sql, row: GscRow): Promise<{ ok: true; token: string; row: GscRow } | { ok: false; error: string }> {
  const cached = openSecret(row.access_token_enc);
  const exp = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0;
  if (cached && exp > Date.now() + 30000) return { ok: true, token: cached, row };
  if (row.mode === "service_account" || (row.sa_email && row.sa_key_enc && !row.refresh_token_enc)) {
    const pem = openSecret(row.sa_key_enc);
    if (!pem || !row.sa_email) return { ok: false, error: "Service account key could not be read." };
    const tok = await serviceAccountToken(row.sa_email, pem);
    if (!tok.ok) return tok;
    const next = {
      ...row,
      access_token_enc: sealSecret(tok.tokens.accessToken),
      access_expires_at: new Date(tok.tokens.expiresAt).toISOString(),
      last_error: null,
    };
    await upsertGscRow(sql, next);
    return { ok: true, token: tok.tokens.accessToken, row: next };
  }
  const client = resolveStoredClient(row);
  if (!client) return { ok: false, error: "OAuth client is not configured." };
  const tok = await refreshOAuthToken(row, client);
  if (!tok.ok) return tok;
  const next = {
    ...row,
    access_token_enc: sealSecret(tok.tokens.accessToken),
    refresh_token_enc: tok.tokens.refreshToken ? sealSecret(tok.tokens.refreshToken) : row.refresh_token_enc,
    access_expires_at: new Date(tok.tokens.expiresAt).toISOString(),
    last_error: null,
  };
  await upsertGscRow(sql, next);
  return { ok: true, token: tok.tokens.accessToken, row: next };
}

async function fetchGoogleEmail(token: string): Promise<string | null> {
  const res = await gscGet(GSC_USERINFO_URL, token);
  if (!res.ok) return null;
  return typeof res.data?.email === "string" ? res.data.email : null;
}

export async function fetchGscSites(token: string): Promise<{ ok: true; sites: GscSite[] } | { ok: false; error: string }> {
  const res = await gscGet(GSC_SITES_URL, token);
  if (!res.ok) return { ok: false, error: publicGscError(res.error) };
  return {
    ok: true,
    sites: (res.data?.siteEntry ?? []).map((s: { siteUrl?: string; permissionLevel?: string }) => ({
      siteUrl: s.siteUrl ?? "",
      permissionLevel: s.permissionLevel ?? "",
    })).filter((s: GscSite) => s.siteUrl),
  };
}

export async function fetchGscSnapshot(token: string, siteUrl: string): Promise<{ ok: true; snapshot: GscSnapshot } | { ok: false; error: string }> {
  const range = gscDateRange();
  const encoded = encodeURIComponent(siteUrl);
  const analyticsUrl = `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;
  const sitemapsUrl = `https://www.googleapis.com/webmasters/v3/sites/${encoded}/sitemaps`;
  const bodyBase = { startDate: range.startDate, endDate: range.endDate, rowLimit: 25, dataState: "final" };
  const [totals, queries, pages, countries, devices, sitemaps] = await Promise.all([
    gscPost(analyticsUrl, token, { ...bodyBase, aggregationType: "auto" }),
    gscPost(analyticsUrl, token, { ...bodyBase, dimensions: ["query"] }),
    gscPost(analyticsUrl, token, { ...bodyBase, dimensions: ["page"] }),
    gscPost(analyticsUrl, token, { ...bodyBase, dimensions: ["country"] }),
    gscPost(analyticsUrl, token, { ...bodyBase, dimensions: ["device"] }),
    gscGet(sitemapsUrl, token),
  ]);
  const firstErr = [totals, queries, pages, countries, devices].find((r) => !r.ok);
  if (firstErr && !firstErr.ok) return { ok: false, error: publicGscError(firstErr.error) };
  const totalRow = totals.ok ? totals.data?.rows?.[0] : undefined;
  const sitemapList: GscSitemap[] = sitemaps.ok
    ? (sitemaps.data?.sitemap ?? []).slice(0, 20).map((s: Record<string, unknown>) => ({
        path: typeof s.path === "string" ? s.path : "",
        lastSubmitted: typeof s.lastSubmitted === "string" ? s.lastSubmitted : null,
        lastDownloaded: typeof s.lastDownloaded === "string" ? s.lastDownloaded : null,
        errors: asNum(s.errors),
        warnings: asNum(s.warnings),
        isPending: Boolean(s.isPending),
      }))
    : [];
  return {
    ok: true,
    snapshot: {
      range,
      totals: mapTotals(totalRow ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }),
      queries: queries.ok ? mapAnalyticsRows(queries.data?.rows) : [],
      pages: pages.ok ? mapAnalyticsRows(pages.data?.rows) : [],
      countries: countries.ok ? mapAnalyticsRows(countries.data?.rows) : [],
      devices: devices.ok ? mapAnalyticsRows(devices.data?.rows) : [],
      sitemaps: sitemapList,
      fetchedAt: new Date().toISOString(),
    },
  };
}

const SNAPSHOT_TTL_MS = 900000;

export function snapshotIsFresh(row: GscRow | null | undefined): boolean {
  if (!row?.last_sync_at || !row.snapshot_json) return false;
  const t = new Date(row.last_sync_at).getTime();
  return Number.isFinite(t) && Date.now() - t < SNAPSHOT_TTL_MS;
}

async function persistOAuthTokens(sql: Sql, opts: { userId: string; tokens: TokenSet; googleEmail: string | null; sites: GscSite[] }) {
  const current = await loadGscRow(sql);
  await upsertGscRow(sql, {
    ...(current ?? { id: "platform", mode: "oauth" }),
    mode: "oauth",
    refresh_token_enc: opts.tokens.refreshToken ? sealSecret(opts.tokens.refreshToken) : current?.refresh_token_enc ?? null,
    access_token_enc: sealSecret(opts.tokens.accessToken),
    access_expires_at: new Date(opts.tokens.expiresAt).toISOString(),
    google_email: opts.googleEmail,
    sites_json: opts.sites,
    connected_by: opts.userId,
    connected_at: current?.connected_at ?? new Date().toISOString(),
    last_error: null,
  });
}

export async function completeGscOAuth(opts: {
  sql: Sql;
  state: string;
  code: string;
  redirectUri: string;
}): Promise<{ ok: true; origin: string; userId: string } | { ok: false; error: string; origin: string }> {
  await ensureGscSchema(opts.sql);
  const st = (await opts.sql`
    select user_id, redirect_origin, created_at from gsc_oauth_states where state = ${opts.state} limit 1`)[0] as
    | { user_id: string; redirect_origin: string | null; created_at: string | Date }
    | undefined;
  await opts.sql`delete from gsc_oauth_states where state = ${opts.state}`;
  const origin = (st?.redirect_origin || gscCallbackOrigin() || "").replace(/\/$/, "");
  if (!st) return { ok: false, error: "OAuth state is invalid or expired.", origin: origin || "" };
  if (Date.now() - new Date(st.created_at).getTime() > 900000) {
    return { ok: false, error: "OAuth state expired. Start Connect again.", origin };
  }
  const row = await loadGscRow(opts.sql);
  const client = resolveStoredClient(row);
  if (!client) return { ok: false, error: "OAuth client is not configured.", origin };
  const tokens = await exchangeGscCode({
    code: opts.code,
    redirectUri: opts.redirectUri,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
  });
  if (!tokens.ok) return { ok: false, error: tokens.error, origin };
  if (!tokens.tokens.refreshToken && !row?.refresh_token_enc) {
    return { ok: false, error: "Google did not return a refresh token. Reconnect with consent.", origin };
  }
  const email = await fetchGoogleEmail(tokens.tokens.accessToken);
  const sites = await fetchGscSites(tokens.tokens.accessToken);
  await persistOAuthTokens(opts.sql, {
    userId: st.user_id,
    tokens: tokens.tokens,
    googleEmail: email,
    sites: sites.ok ? sites.sites : [],
  });
  if (!sites.ok) {
    const current = await loadGscRow(opts.sql);
    if (current) await upsertGscRow(opts.sql, { ...current, last_error: sites.error });
  }
  return { ok: true, origin, userId: st.user_id };
}
