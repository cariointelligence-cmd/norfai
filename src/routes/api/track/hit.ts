import { createFileRoute } from "@tanstack/react-router";
import { inspectApiRequest, shieldHeaders } from "@/lib/norr/api-shield.ts";
import { recordVisitorHit } from "@/lib/norr/visitor-store.ts";

export const Route = createFileRoute("/api/track/hit")({
  server: { handlers: { POST: handle, GET: handle } },
});

async function handle({ request }: { request: Request }) {
  const blocked = inspectApiRequest(request, { bucket: "track", max: 120, maxBytes: 4_096 });
  if (blocked) return blocked;
  let path: unknown = new URL(request.url).searchParams.get("p");
  let referrer: unknown = request.headers.get("referer");
  if (request.method === "POST") {
    try {
      const body = await request.json() as { path?: unknown; referrer?: unknown };
      path = body.path ?? path;
      referrer = body.referrer ?? referrer;
    } catch { /* beacon may be empty */ }
  }
  let userId: string | null = null;
  try {
    const { auth } = await import("@/lib/auth/server");
    const session = await auth.api.getSession({ headers: request.headers });
    userId = session?.user?.id ?? null;
  } catch { userId = null; }
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rec = await recordVisitorHit({ sql, request, path, referrer, userId });
  const headers: Record<string, string> = { ...shieldHeaders(request), "Cache-Control": "no-store" };
  if (rec.setCookie) headers["set-cookie"] = rec.setCookie;
  return Response.json({ ok: true }, { headers });
}
