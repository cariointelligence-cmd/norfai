import { createFileRoute } from "@tanstack/react-router";
import { ensureWorker, triggerWorkerTick } from "@/lib/norr/worker";
import { safeEqual } from "@/lib/norr/security";
import { provisionCarioNorfai } from "@/lib/norr/vercel-provision.ts";

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
  const tick = await triggerWorkerTick();
  const cario = await provisionCarioNorfai().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : "provision failed",
  }));
  return new Response(JSON.stringify({ ...tick, cario }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
