import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ensurePlatformSchema, isPlatformAdmin } from "@/lib/norr/platform.ts";
import { persistSecurityEvent, rateLimit, rateLimitMessage } from "@/lib/norr/security.ts";
import { isoTime } from "@/lib/format.ts";
import { auditPublicSite } from "./audit.ts";
import { staticPublicPages } from "./catalog.ts";
import { ensureSeoSchema, recentSeoLog, snapshotSeo } from "./store.ts";
import {
  buildGoogleAuthUrl,
  DISCONNECTED_REASON,
  emptyGscView,
  envGscClient,
  fetchGscSites,
  fetchGscSnapshot,
  gscAccessToken,
  gscCallbackOrigin,
  gscRedirectUri,
  isGoogleClientId,
  loadGscRow,
  parseServiceAccountJson,
  publicViewFromRow,
  sealSecret,
  snapshotIsFresh,
  upsertGscRow,
  type GscPublicView,
} from "./gsc.ts";

async function requireSeoAdmin(userId: string) {
  const sql = await getSql();
  await ensurePlatformSchema(sql);
  await ensureSeoSchema(sql);
  if (!(await isPlatformAdmin(sql, userId))) return { ok: false as const, error: "Admin only", sql };
  return { ok: true as const, sql };
}

async function dashboardPayload(sql: Awaited<ReturnType<typeof getSql>>, searchConsole: GscPublicView) {
  let newsCount = 0;
  let draftCount = 0;
  try {
    const news = await sql<{ n: number }>`select count(*)::int as n from blog_posts where status = ${"published"}`;
    const drafts = await sql<{ n: number }>`select count(*)::int as n from blog_posts where status = ${"draft"}`;
    newsCount = news[0]?.n ?? 0;
    draftCount = drafts[0]?.n ?? 0;
  } catch {
    newsCount = 0;
  }
  const audit = auditPublicSite({ newsCount, drafts: draftCount });
  const log = await recentSeoLog(sql);
  return {
    ok: true as const,
    audit,
    log: log.map((row) => ({ ...row, created_at: isoTime(row.created_at) ?? "" })),
    newsCount,
    draftCount,
    searchConsole,
    pages: staticPublicPages().filter((p) => p.indexable).length,
  };
}

export const getSeoDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const gate = await requireSeoAdmin(context.userId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const row = await loadGscRow(gate.sql);
    return dashboardPayload(gate.sql, publicViewFromRow(row));
  });

export const runSeoSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const gate = await requireSeoAdmin(context.userId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const r = await snapshotSeo(gate.sql);
    return { ok: true as const, ...r };
  });

export const saveGscClient = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { clientId?: string; clientSecret?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const gate = await requireSeoAdmin(context.userId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const clientId = (data.clientId ?? "").trim();
    const clientSecret = (data.clientSecret ?? "").trim();
    if (!isGoogleClientId(clientId)) {
      return { ok: false as const, error: "Client ID must be a Google OAuth client (ends with .apps.googleusercontent.com)." };
    }
    const current = await loadGscRow(gate.sql);
    if (!clientSecret && !current?.client_secret_enc && !envGscClient()) {
      return { ok: false as const, error: "Client secret is required the first time." };
    }
    await upsertGscRow(gate.sql, {
      ...(current ?? { id: "platform", mode: "oauth" }),
      client_id: clientId,
      client_secret_enc: clientSecret ? sealSecret(clientSecret) : current?.client_secret_enc ?? null,
      last_error: null,
    });
    await persistSecurityEvent(gate.sql, {
      userId: context.userId,
      action: "gsc.client_saved",
      risk: "normal",
      detail: { clientHint: clientId.slice(-18) },
    });
    return { ok: true as const, redirectUri: gscRedirectUri() };
  });

export const saveGscServiceAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { json?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const gate = await requireSeoAdmin(context.userId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const parsed = parseServiceAccountJson((data.json ?? "").trim());
    if ("error" in parsed) return { ok: false as const, error: parsed.error };
    const current = await loadGscRow(gate.sql);
    await upsertGscRow(gate.sql, {
      ...(current ?? { id: "platform", mode: "service_account" }),
      mode: "service_account",
      sa_email: parsed.clientEmail,
      sa_key_enc: sealSecret(parsed.privateKey),
      google_email: parsed.clientEmail,
      connected_by: context.userId,
      connected_at: current?.connected_at ?? new Date().toISOString(),
      last_error: null,
    });
    const row = await loadGscRow(gate.sql);
    if (!row) return { ok: false as const, error: "Could not save service account." };
    const tok = await gscAccessToken(gate.sql, row);
    if (!tok.ok) {
      await upsertGscRow(gate.sql, { ...row, last_error: tok.error });
      return { ok: false as const, error: tok.error, serviceAccountEmail: parsed.clientEmail };
    }
    const sites = await fetchGscSites(tok.token);
    if (!sites.ok) {
      await upsertGscRow(gate.sql, { ...tok.row, last_error: sites.error });
      return {
        ok: true as const,
        serviceAccountEmail: parsed.clientEmail,
        warning: `${sites.error} Add ${parsed.clientEmail} as a user on the Search Console property, then refresh.`,
        searchConsole: publicViewFromRow(await loadGscRow(gate.sql)),
      };
    }
    await upsertGscRow(gate.sql, { ...tok.row, sites_json: sites.sites, last_error: null });
    await persistSecurityEvent(gate.sql, {
      userId: context.userId,
      action: "gsc.service_account",
      risk: "normal",
      detail: { email: parsed.clientEmail },
    });
    return {
      ok: true as const,
      serviceAccountEmail: parsed.clientEmail,
      searchConsole: publicViewFromRow(await loadGscRow(gate.sql)),
    };
  });

export const startGscConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const gate = await requireSeoAdmin(context.userId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const rl = rateLimit(`gsc-connect:${context.userId}`, 8, 10 * 60_000);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    const row = await loadGscRow(gate.sql);
    const envClient = envGscClient();
    const clientId = envClient?.clientId ?? row?.client_id ?? "";
    const clientSecret = envClient?.clientSecret ?? (row?.client_secret_enc ? "stored" : "");
    if (!isGoogleClientId(clientId) || !clientSecret) {
      return { ok: false as const, error: "Save a Google OAuth client ID and secret first." };
    }
    const origin = gscCallbackOrigin();
    const redirectUri = gscRedirectUri(origin);
    if (!origin || !redirectUri) {
      return { ok: false as const, error: "Cannot resolve the public origin for the OAuth redirect URI." };
    }
    const state = randomBytes(24).toString("base64url");
    await gate.sql`delete from gsc_oauth_states where created_at < now() - interval '15 minutes'`;
    await gate.sql`insert into gsc_oauth_states (state, user_id, redirect_origin) values (${state}, ${context.userId}, ${origin})`;
    const url = buildGoogleAuthUrl({ clientId, redirectUri, state });
    await persistSecurityEvent(gate.sql, {
      userId: context.userId,
      action: "gsc.connect_start",
      risk: "normal",
      detail: { origin },
    });
    return { ok: true as const, url, redirectUri };
  });

export const selectGscProperty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { siteUrl?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const gate = await requireSeoAdmin(context.userId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const siteUrl = (data.siteUrl ?? "").trim();
    if (!siteUrl) return { ok: false as const, error: "Select a Search Console property." };
    const row = await loadGscRow(gate.sql);
    if (!row) return { ok: false as const, error: DISCONNECTED_REASON };
    const tok = await gscAccessToken(gate.sql, row);
    if (!tok.ok) return { ok: false as const, error: tok.error };
    const sites = await fetchGscSites(tok.token);
    if (!sites.ok) return { ok: false as const, error: sites.error };
    const allowed = sites.sites.find((s) => s.siteUrl === siteUrl);
    if (!allowed) return { ok: false as const, error: "That property is not on this Google account." };
    const snap = await fetchGscSnapshot(tok.token, siteUrl);
    if (!snap.ok) {
      await upsertGscRow(gate.sql, {
        ...tok.row,
        site_url: siteUrl,
        sites_json: sites.sites,
        last_error: snap.error,
      });
      return { ok: false as const, error: snap.error, searchConsole: publicViewFromRow(await loadGscRow(gate.sql)) };
    }
    await upsertGscRow(gate.sql, {
      ...tok.row,
      site_url: siteUrl,
      sites_json: sites.sites,
      snapshot_json: snap.snapshot,
      snapshot_range: snap.snapshot.range,
      last_sync_at: snap.snapshot.fetchedAt,
      last_error: null,
    });
    await persistSecurityEvent(gate.sql, {
      userId: context.userId,
      action: "gsc.property_selected",
      risk: "normal",
      detail: { siteUrl },
    });
    return { ok: true as const, searchConsole: publicViewFromRow(await loadGscRow(gate.sql)) };
  });

export const refreshGsc = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { force?: boolean } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const gate = await requireSeoAdmin(context.userId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const rl = rateLimit(`gsc-refresh:${context.userId}`, 20, 10 * 60_000);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    let row = await loadGscRow(gate.sql);
    if (!row) return { ok: false as const, error: DISCONNECTED_REASON, searchConsole: emptyGscView(DISCONNECTED_REASON) };
    if (!data.force && snapshotIsFresh(row) && row.site_url) {
      return { ok: true as const, searchConsole: publicViewFromRow(row), cached: true as const };
    }
    const tok = await gscAccessToken(gate.sql, row);
    if (!tok.ok) {
      await upsertGscRow(gate.sql, { ...row, last_error: tok.error });
      return { ok: false as const, error: tok.error, searchConsole: publicViewFromRow(await loadGscRow(gate.sql)) };
    }
    const sites = await fetchGscSites(tok.token);
    if (sites.ok) {
      await upsertGscRow(gate.sql, { ...tok.row, sites_json: sites.sites });
      row = { ...tok.row, sites_json: sites.sites };
    }
    if (!row.site_url) {
      return { ok: true as const, searchConsole: publicViewFromRow(await loadGscRow(gate.sql)) };
    }
    const snap = await fetchGscSnapshot(tok.token, row.site_url);
    if (!snap.ok) {
      await upsertGscRow(gate.sql, { ...row, last_error: snap.error });
      return { ok: false as const, error: snap.error, searchConsole: publicViewFromRow(await loadGscRow(gate.sql)) };
    }
    await upsertGscRow(gate.sql, {
      ...row,
      snapshot_json: snap.snapshot,
      snapshot_range: snap.snapshot.range,
      last_sync_at: snap.snapshot.fetchedAt,
      last_error: null,
    });
    return { ok: true as const, searchConsole: publicViewFromRow(await loadGscRow(gate.sql)), cached: false as const };
  });

export const disconnectGsc = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const gate = await requireSeoAdmin(context.userId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const current = await loadGscRow(gate.sql);
    await upsertGscRow(gate.sql, {
      ...(current ?? { id: "platform", mode: "oauth" }),
      mode: "oauth",
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
    });
    await persistSecurityEvent(gate.sql, {
      userId: context.userId,
      action: "gsc.disconnect",
      risk: "normal",
    });
    return { ok: true as const, searchConsole: publicViewFromRow(await loadGscRow(gate.sql)) };
  });
