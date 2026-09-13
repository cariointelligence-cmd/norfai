import { createFileRoute } from "@tanstack/react-router";
import { createQueuedSearch, latestSearchId } from "@/lib/norr/search-intake.ts";

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const allow = origin === "https://www.norfai.com" || origin === "https://norfai.com";
  return {
    "content-type": "application/json",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    ...(allow ? { "access-control-allow-origin": origin } : {}),
  };
}

export const Route = createFileRoute("/api/search/start")({
  server: {
    handlers: {
      OPTIONS: ({ request }: { request: Request }) => new Response(null, { status: 204, headers: corsHeaders(request) }),
      GET: latest,
      POST: start,
    },
  },
});

async function sessionUserId(request: Request): Promise<string | null> {
  const { auth } = await import("@/lib/auth/server");
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(fallback);
    });
  });
}

async function start({ request }: { request: Request }) {
  const t0 = Date.now();
  const headers = corsHeaders(request);
  const json = (status: number, body: Record<string, unknown>) =>
    Response.json({ ...body, ms: Date.now() - t0 }, { status, headers });

  const userId = await withTimeout(sessionUserId(request), 2000, null);
  if (!userId) return json(401, { ok: false, error: "Unauthorized", runId: "" });

  let body: { criteria?: unknown; name?: string; profileId?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON", runId: "" });
  }
  if (!body.criteria || typeof body.criteria !== "object") {
    return json(400, { ok: false, error: "Missing criteria", runId: "" });
  }

  const result = await withTimeout(
    createQueuedSearch({
      userId,
      criteria: body.criteria as never,
      name: body.name,
      profileId: body.profileId,
    }),
    4000,
    { ok: false, error: "Search intake timed out", runId: "", discovered: 0 },
  );
  if (result.ok && result.runId) return json(200, result);
  const recovered = await withTimeout(latestSearchId(userId), 1500, null);
  if (recovered) return json(200, { ok: true, runId: recovered, discovered: 0, state: "QUEUED", reused: true });
  return json(result.error === "Search intake timed out" ? 503 : 400, result);
}

async function latest({ request }: { request: Request }) {
  const userId = await sessionUserId(request);
  if (!userId) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders(request) });
  const runId = await latestSearchId(userId);
  return Response.json({ ok: Boolean(runId), runId: runId ?? "" }, { headers: corsHeaders(request) });
}
