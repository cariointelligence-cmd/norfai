import { staticPublicPages } from "./catalog.ts";
import { absUrl } from "./site.ts";

export type SitemapEntry = { path: string; lastmod?: string; changefreq: string; priority: number };

export function sitemapEntries(news: Array<{ slug: string; publishedAt?: string | null }> = []): SitemapEntry[] {
  const pages = staticPublicPages()
    .filter((p) => p.indexable)
    .map((p) => ({
      path: p.path,
      changefreq: p.changefreq,
      priority: p.priority,
    }));
  const posts = news.map((n) => ({
    path: `/news/${n.slug}`,
    lastmod: n.publishedAt ?? undefined,
    changefreq: "monthly",
    priority: 0.45,
  }));
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const e of [...pages, ...posts]) {
    if (seen.has(e.path)) continue;
    seen.add(e.path);
    out.push(e);
  }
  return out;
}

export function renderSitemapXml(origin: string, entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const loc = absUrl(e.path, origin) || e.path;
      const last = isoDate(e.lastmod) ? `\n    <lastmod>${isoDate(e.lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${last}\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority.toFixed(1)}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobotsTxt(origin: string): string {
  const sitemap = absUrl("/sitemap.xml", origin) || "/sitemap.xml";
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /overview",
    "Disallow: /search",
    "Disallow: /companies",
    "Disallow: /people",
    "Disallow: /profiles",
    "Disallow: /schedules",
    "Disallow: /lists",
    "Disallow: /review",
    "Disallow: /duplicates",
    "Disallow: /sources",
    "Disallow: /jobs",
    "Disallow: /exports",
    "Disallow: /quality",
    "Disallow: /audit",
    "Disallow: /security",
    "Disallow: /billing",
    "Disallow: /settings",
    "Disallow: /privacy",
    "Disallow: /onboarding",
    "Disallow: /admin",
    "Disallow: /api",
    "Disallow: /login",
    "Disallow: /account",
    "Disallow: /integrations",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function isoDate(raw?: string | Date | null): string | null {
  if (raw == null || raw === "") return null;
  const s = raw instanceof Date ? raw.toISOString() : String(raw);
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
