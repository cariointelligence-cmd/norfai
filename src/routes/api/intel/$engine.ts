import { createFileRoute } from "@tanstack/react-router";
import { verifyCronBearer, verifyServiceRequest } from "@/lib/norr/internal-auth";
import { intelEngineIds, runIntelEngine } from "@/lib/norr/vercel-intel";

export const Route = createFileRoute("/api/intel/$engine")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (params.engine === "catalog") {
          return Response.json({ ok: true, engines: intelEngineIds() });
        }
        return new Response("not found", { status: 404 });
      },
      POST: handle,
    },
  },
});

async function handle({ request, params }: { request: Request; params: { engine: string } }) {
  const raw = await request.text();
  const signed = verifyServiceRequest(request.headers, raw, "enrichment.company");
  const cronOk = verifyCronBearer(request.headers);
  if (!signed.ok && !cronOk) {
    return new Response("unauthorized", { status: 401 });
  }
  let body: { name?: string; website?: string | null; businessId?: string | null; municipality?: string | null; country?: string | null; html?: string | null } = {};
  try { body = raw ? JSON.parse(raw) as typeof body : {}; } catch { body = {}; }
  const result = await runIntelEngine(params.engine, body);
  return Response.json(result);
}
