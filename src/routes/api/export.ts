import { createFileRoute } from "@tanstack/react-router";
import { exportRunCsv } from "@/lib/norr/export-csv.ts";

export const Route = createFileRoute("/api/export")({
  server: {
    handlers: { GET: handle },
  },
});

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";
  const preset = url.searchParams.get("preset") ?? "full";
  const { auth } = await import("@/lib/auth/server");
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!runId) return new Response("Missing search", { status: 400 });
  try {
    const r = await exportRunCsv({ userId, runId, preset, cap: 10_000 });
    if (r.error) return new Response(r.error, { status: 400 });
    return new Response(r.body.startsWith("\uFEFF") ? r.body : `\uFEFF${r.body}`, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${r.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[norf] /api/export", err);
    return new Response("Export failed", { status: 500 });
  }
}
