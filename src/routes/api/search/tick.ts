import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { pumpSearch } from "@/lib/norr/pipeline.ts";
import { scheduleBackground } from "@/lib/norr/hybrid.ts";

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
  try {
    const sql = await getSql();
    scheduleBackground(() => pumpSearch(sql, userId, runId));
    return Response.json({ ok: true, accepted: true, processed: 0 });
  } catch (err) {
    console.error("[norf] /api/search/tick", err);
    return Response.json({ ok: false, processed: 0 }, { status: 200 });
  }
}
