import { createFileRoute } from "@tanstack/react-router";
import { originFromRequest } from "@/lib/seo/site.ts";
import { renderRobotsTxt } from "@/lib/seo/sitemap.ts";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const body = renderRobotsTxt(originFromRequest(request));
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
