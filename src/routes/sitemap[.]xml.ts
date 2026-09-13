import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ensurePlatformSchema } from "@/lib/norr/platform.ts";
import { originFromRequest } from "@/lib/seo/site.ts";
import { renderSitemapXml, sitemapEntries } from "@/lib/seo/sitemap.ts";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const origin = originFromRequest(request);
        let news: Array<{ slug: string; publishedAt?: string | null }> = [];
        try {
          const sql = await getSql();
          await ensurePlatformSchema(sql);
          news = await sql<{ slug: string; publishedAt: string | null }>`
            select slug, published_at as "publishedAt" from blog_posts
            where status = ${"published"}
            order by published_at desc nulls last
            limit 200`;
        } catch {
          news = [];
        }
        const xml = renderSitemapXml(origin, sitemapEntries(news));
        return new Response(xml, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
