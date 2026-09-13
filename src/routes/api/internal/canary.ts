import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { honeypotHitMessage, persistSecurityEvent } from "@/lib/norr/security";

/**
 * Canary: the legitimate frontend never calls this. A hit is endpoint enumeration.
 * Returns a generic 404 and contains no secrets.
 */
export const Route = createFileRoute("/api/internal/canary")({
  server: {
    handlers: {
      GET: hit,
      POST: hit,
    },
  },
});

async function hit({ request }: { request: Request }) {
  try {
    const sql = await getSql();
    const ip = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "").split(",")[0]!.trim().slice(0, 64);
    await persistSecurityEvent(sql, {
      userId: null,
      action: "honeypot.canary",
      risk: "high",
      ip: ip || null,
      detail: { path: "/api/internal/canary", ua: (request.headers.get("user-agent") ?? "").slice(0, 120) },
    });
  } catch {
    /* fail closed — still 404 */
  }
  return new Response(honeypotHitMessage(), { status: 404, headers: { "content-type": "text/plain" } });
}
