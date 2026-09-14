import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { honeypotHitMessage, persistSecurityEvent } from "@/lib/norr/security";

export const Route = createFileRoute("/api/graphql")({
  server: { handlers: { GET: hit, POST: hit } },
});

async function hit({ request }: { request: Request }) {
  try {
    const sql = await getSql();
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim().slice(0, 64);
    await persistSecurityEvent(sql, {
      userId: null,
      action: "honeypot.graphql",
      risk: "high",
      ip: ip || null,
      detail: { path: "/api/graphql" },
    });
  } catch { /* 404 */ }
  return new Response(honeypotHitMessage(), { status: 404 });
}
