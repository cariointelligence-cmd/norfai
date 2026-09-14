import { createFileRoute } from "@tanstack/react-router";
import { dispatchVercelExecution } from "@/lib/norr/vercel-executor.ts";

export const maxDuration = 30;

export const Route = createFileRoute("/api/search/tick")({
  server: {
    handlers: { POST: handle },
  },
});

async function handle({ request }: { request: Request }) {
  const { auth } = await import("@/lib/auth/server");
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, processed: 0 }, { status: 401 });
  let runId = "";
  try {
    const body = await request.json() as { runId?: string };
    runId = String(body.runId ?? "");
  } catch {
    return Response.json({ ok: false, processed: 0, error: "Invalid JSON" }, { status: 400 });
  }
  if (!runId) return Response.json({ ok: false, processed: 0, error: "Missing runId" }, { status: 400 });
  let processed = 0;
  let waiting = false;
  let position = 1;
  let lane: string | null = null;
  let focusRunId = runId;
  let focusUserId = userId;
  try {
    const { getSql } = await import("@/lib/db");
    const { processJobsFor, resumeDiscoverIfStarved } = await import("@/lib/norr/pipeline.ts");
    const { searchQueueView } = await import("@/lib/norr/search-queue.ts");
    const sql = await getSql();
    const queue = await searchQueueView(sql, userId, runId);
    lane = queue.lane;
    position = queue.position;
    if (queue.focus) {
      focusRunId = queue.focus.runId;
      focusUserId = queue.focus.userId;
      waiting = !queue.active;
    }
    processed = await processJobsFor(sql, focusUserId, focusRunId, { maxMs: 14_000, concurrency: 8, skipSchema: true });
    try { await resumeDiscoverIfStarved(sql, focusUserId, focusRunId); } catch { /* keep */ }
  } catch (err) {
    console.warn("[norf] search.tick", err instanceof Error ? err.message : err);
  }
  dispatchVercelExecution({ userId: focusUserId, runId: focusRunId, reason: "search.tick" });
  return Response.json({ ok: true, accepted: true, processed, waiting, position, lane });
}
