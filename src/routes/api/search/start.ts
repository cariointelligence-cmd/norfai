import { createFileRoute } from "@tanstack/react-router";
import { createQueuedSearch, latestSearchId } from "@/lib/norr/search-intake.ts";

export const Route = createFileRoute("/api/search/start")({
  server: {
    handlers: {
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

async function start({ request }: { request: Request }) {
  const userId = await sessionUserId(request);
  if (!userId) return Response.json({ ok: false, error: "Unauthorized", runId: "" }, { status: 401 });
  let body: { criteria?: unknown; name?: string; profileId?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON", runId: "" }, { status: 400 });
  }
  if (!body.criteria || typeof body.criteria !== "object") {
    return Response.json({ ok: false, error: "Missing criteria", runId: "" }, { status: 400 });
  }
  try {
    const result = await createQueuedSearch({
      userId,
      criteria: body.criteria as never,
      name: body.name,
      profileId: body.profileId,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    console.error("[norf] /api/search/start", err);
    const recovered = await latestSearchId(userId).catch(() => null);
    if (recovered) return Response.json({ ok: true, runId: recovered, discovered: 0, state: "QUEUED", reused: true });
    return Response.json({ ok: false, error: "Search could not start. Try again.", runId: "" }, { status: 500 });
  }
}

async function latest({ request }: { request: Request }) {
  const userId = await sessionUserId(request);
  if (!userId) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const runId = await latestSearchId(userId);
  return Response.json({ ok: Boolean(runId), runId: runId ?? "" });
}
