import { createFileRoute } from "@tanstack/react-router";
import { ensureWorker, triggerWorkerTick } from "@/lib/norr/worker";
import { verifyCronBearer, verifyServiceRequest } from "@/lib/norr/internal-auth";

export const Route = createFileRoute("/api/internal/worker")({
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
  const signed = verifyServiceRequest(request.headers, raw, "worker.tick");
  const cronOk = verifyCronBearer(request.headers);
  if (!signed.ok && !cronOk) {
    const status = signed.ok === false ? signed.status : 401;
    return new Response(signed.ok === false && signed.status === 404 ? "not found" : "unauthorized", {
      status: status === 404 ? 404 : 401,
    });
  }
  ensureWorker();
  const r = await triggerWorkerTick();
  return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
}
