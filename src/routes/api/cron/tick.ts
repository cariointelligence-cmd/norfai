import { createFileRoute } from "@tanstack/react-router";
import { ensureWorker, triggerWorkerTick } from "@/lib/norr/worker";
import { safeEqual } from "@/lib/norr/security";
import { dispatchVercelExecution, runVercelDrain } from "@/lib/norr/vercel-executor.ts";
import { scheduleBackground } from "@/lib/norr/hybrid.ts";

export const Route = createFileRoute("/api/cron/tick")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});

async function handle({ request }: { request: Request }) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return new Response("not configured", { status: 404 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const header = request.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(token, secret) && !safeEqual(header, secret)) {
    return new Response("unauthorized", { status: 401 });
  }
  ensureWorker();
  const result = await runVercelDrain({ reason: "cron.tick" });
  if (result.remaining > 0) dispatchVercelExecution({ reason: "cron.follow", depth: 1 });
  scheduleBackground(() => triggerWorkerTick());
  return new Response(JSON.stringify({ ok: true, kicked: true, ...result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
