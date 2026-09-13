import { createFileRoute } from "@tanstack/react-router";
import { verifyCronBearer, verifyServiceRequest } from "@/lib/norr/internal-auth";
import { runVercelDrain } from "@/lib/norr/vercel-executor";

export const Route = createFileRoute("/api/jobs/drain")({
  server: {
    handlers: {
      GET: deny,
      POST: handle,
    },
  },
});

function deny() {
  return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
}

async function handle({ request }: { request: Request }) {
  const raw = await request.text();
  const signed = verifyServiceRequest(request.headers, raw, "jobs.drain");
  const cronOk = verifyCronBearer(request.headers);
  if (!signed.ok && !cronOk) {
    const status = signed.ok === false ? signed.status : 401;
    return new Response(signed.ok === false && signed.status === 404 ? "not found" : "unauthorized", {
      status: status === 404 ? 404 : 401,
    });
  }
  let body: { userId?: string | null; runId?: string | null; depth?: number; reason?: string } = {};
  try { body = raw ? JSON.parse(raw) as typeof body : {}; } catch { body = {}; }
  const result = await runVercelDrain({
    userId: body.userId ?? null,
    runId: body.runId ?? null,
    depth: Number(body.depth ?? 0) || 0,
    reason: body.reason ?? "http",
  });
  return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
}
