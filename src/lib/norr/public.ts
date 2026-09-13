import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { PLANS, ensurePlatformSchema, stripeCheckoutReady } from "./platform.ts";
import { rateLimit, rateLimitMessage } from "./security.ts";
import { clientIp } from "./request-meta.server.ts";
import { ytjFetchById, ytjHealth } from "./sources/ytj.ts";
import { analyzeWebsite } from "./targeting/website.ts";
import { safeFetch } from "./ssrf.ts";
import { companyAgeYears } from "./targeting/scores.ts";
import { NORF_BUILD } from "./build-stamp.ts";

export { NORF_BUILD };

export const listPublishedPosts = createServerFn({ method: "GET" })
  .validator((d: { locale?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    try {
      const sql = await getSql();
      await ensurePlatformSchema(sql);
      const locale = data.locale ?? "";
      const rows = await sql<{
        id: string; slug: string; locale: string; title: string; excerpt: string; published_at: string | null;
      }>`
        select id, slug, locale, title, excerpt, published_at from blog_posts
        where status = ${"published"}
          and (${locale} = '' or locale = ${locale})
        order by published_at desc nulls last
        limit 40`;
      return { posts: rows };
    } catch (err) {
      console.error("[norf] news", err);
      return { posts: [] as Array<{ id: string; slug: string; locale: string; title: string; excerpt: string; published_at: string | null }> };
    }
  });

export const getPublishedPost = createServerFn({ method: "GET" })
  .validator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sql = await getSql();
      await ensurePlatformSchema(sql);
      const row = (await sql<{
        id: string; slug: string; locale: string; title: string; excerpt: string; body: string;
        seo_title: string | null; seo_description: string | null; published_at: string | null;
      }>`select id, slug, locale, title, excerpt, body, seo_title, seo_description, published_at
        from blog_posts where slug = ${data.slug} and status = ${"published"} limit 1`)[0];
      if (!row) return { ok: false as const, error: "Not found" };
      return { ok: true as const, post: row };
    } catch (err) {
      console.error("[norf] post", err);
      return { ok: false as const, error: "Not found" };
    }
  });

export const getPublicPlans = createServerFn({ method: "GET" }).handler(async () => ({
  plans: Object.values(PLANS).map((p) => ({
    id: p.id,
    label: p.label,
    searchesPerMonth: p.searchesPerMonth,
    priceEur: p.priceEur,
    companies: p.companies,
    unlimited: p.unlimited,
  })),
  stripeReady: stripeCheckoutReady(),
}));

function publicLimit(op: string, max = 20) {
  const ip = clientIp() ?? "anon";
  return rateLimit(`public:${op}:${ip}`, max, 60 * 60 * 1000);
}

let pulseCache: { at: number; data: { ok: boolean; detail: string; sensor: string; at: string; build: string } } | null = null;

export const hivePulse = createServerFn({ method: "GET" }).handler(async () => {
  if (pulseCache && Date.now() - pulseCache.at < 300_000) return pulseCache.data;
  const rl = publicLimit("hive-pulse", 40);
  if (!rl.ok) {
    return pulseCache?.data ?? { ok: false, detail: "rate limited", sensor: "ytj", at: new Date().toISOString(), build: NORF_BUILD };
  }
  const r = await ytjHealth();
  const data = { ok: r.ok, detail: r.detail, sensor: "ytj", at: new Date().toISOString(), build: NORF_BUILD };
  pulseCache = { at: Date.now(), data };
  return data;
});

export const lookupBusinessId = createServerFn({ method: "POST" })
  .validator((d: { businessId: string }) => d)
  .handler(async ({ data }) => {
    const rl = publicLimit("ytj", 30);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    const r = await ytjFetchById(data.businessId);
    if (!r.ok) return { ok: false as const, error: r.error ?? "Not found" };
    const c = r.data;
    const founded = c.registrationDate ?? null;
    return {
      ok: true as const,
      company: {
        name: c.name,
        businessId: c.businessId ?? null,
        municipality: c.municipality ?? null,
        industry: c.industryLabel ?? c.industryCode ?? null,
        website: c.website ?? null,
        legalForm: c.legalForm ?? null,
        foundedOn: founded,
        ageYears: companyAgeYears(founded),
        status: c.businessStatus ?? null,
      },
    };
  });

export const checkWebsiteQuality = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => d)
  .handler(async ({ data }) => {
    const rl = publicLimit("web", 20);
    if (!rl.ok) return { ok: false as const, error: rateLimitMessage(rl.retryAfterMs) };
    let url = data.url.trim();
    if (!url) return { ok: false as const, error: "Enter a website URL." };
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const res = await safeFetch(url, { timeoutMs: 12000, maxBytes: 800_000, requireHtml: true });
      const intel = analyzeWebsite({ html: res.body, url: res.url, status: res.status, headers: res.headers });
      return {
        ok: true as const,
        url: res.url,
        status: res.status,
        score: intel.score,
        band: intel.band,
        seoScore: intel.seoScore,
        digitalMaturity: intel.digitalMaturity,
        https: intel.https,
        pixels: intel.pixels,
        cms: intel.cms,
        notes: intel.notes,
        likelyWeak: intel.likelyWeak,
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Could not fetch that site." };
    }
  });
