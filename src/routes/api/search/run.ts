import { createFileRoute } from "@tanstack/react-router";
import { readSearchRun } from "@/lib/norr/search-run-read.ts";

export const Route = createFileRoute("/api/search/run")({
  server: {
    handlers: { GET: handle },
  },
});

async function handle({ request }: { request: Request }) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ ok: false, error: "Missing id" }, { status: 400 });
  const { auth } = await import("@/lib/auth/server");
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await readSearchRun(userId, id);
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[norf] /api/search/run", err);
    return Response.json({ ok: false, error: "Run could not be loaded" }, { status: 500 });
  }
}
