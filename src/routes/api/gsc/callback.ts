import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { persistSecurityEvent } from "@/lib/norr/security.ts";
import { completeGscOAuth, gscCallbackHtml, gscRedirectUri, publicGscError } from "@/lib/seo/gsc.ts";

export const Route = createFileRoute("/api/gsc/callback")({
  server: {
    handlers: {
      GET: handle,
      POST: deny,
    },
  },
});

function deny() {
  return new Response("Not found", { status: 404 });
}

function html(ok: boolean, message: string, redirect: string, status = 200) {
  return new Response(gscCallbackHtml({ ok, message, redirect }), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const redirectUri = gscRedirectUri();
  const fallback = "/admin/seo";

  if (err) {
    return html(false, publicGscError(err), `${fallback}?gsc=error`, 400);
  }
  if (!state || !code || !redirectUri) {
    return html(false, "Missing OAuth code or state.", `${fallback}?gsc=error`, 400);
  }

  const sql = await getSql();
  const result = await completeGscOAuth({ sql, state, code, redirectUri });
  const destBase = result.origin ? `${result.origin}/admin/seo` : fallback;
  if (!result.ok) {
    return html(false, result.error, `${destBase}?gsc=error`, 400);
  }
  await persistSecurityEvent(sql, {
    userId: result.userId,
    action: "gsc.connected",
    risk: "normal",
  });
  return html(true, "Search Console connected. You can close this window.", `${destBase}?gsc=connected`);
}
