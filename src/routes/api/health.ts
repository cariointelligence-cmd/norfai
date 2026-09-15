import { createFileRoute } from "@tanstack/react-router";
import { NORF_BUILD, vercelDeployProbe } from "@/lib/norr/build-stamp.ts";
import { provisionCarioNorfai, vercelTokenPresent } from "@/lib/norr/vercel-provision.ts";
import { cronHealthAuthorized, inspectApiRequest, publicHealthBody, shieldHeaders } from "@/lib/norr/api-shield.ts";
import { scheduleBackground } from "@/lib/norr/hybrid.ts";

let lastMailKick = 0;

function kickStuckMail(): void {
  const now = Date.now();
  if (now - lastMailKick < 12_000) return;
  lastMailKick = now;
  scheduleBackground(async () => {
    const { getSql } = await import("@/lib/db");
    const { flushStuckSupportMail } = await import("@/lib/norr/support-store.ts");
    const sql = await getSql();
    await flushStuckSupportMail(sql);
  });
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const blocked = inspectApiRequest(request, { bucket: "health", max: 120 });
        if (blocked) return blocked;
        const url = new URL(request.url);
        const cutover = url.searchParams.get("cutover") === "1";
        const headers = shieldHeaders(request);
        kickStuckMail();
        if (!cutover || !cronHealthAuthorized(request)) {
          return Response.json(publicHealthBody(NORF_BUILD), { headers });
        }
        const provision = await provisionCarioNorfai();
        let mail: { provider: string; source: string; resendReady: boolean } = {
          provider: "none",
          source: "none",
          resendReady: Boolean(process.env.RESEND_API_KEY?.trim()),
        };
        try {
          const { getSql } = await import("@/lib/db");
          const { resolveMailer } = await import("@/lib/norr/mailer.ts");
          const sql = await getSql();
          const t = await resolveMailer(sql);
          mail = { provider: t.provider, source: t.source, resendReady: t.provider === "resend" };
        } catch {
          /* health still returns */
        }
        return Response.json({
          ...publicHealthBody(NORF_BUILD),
          deploy: { ...vercelDeployProbe(), tokenPresent: vercelTokenPresent(), resendReady: mail.resendReady },
          mail,
          provision: { tokenPresent: provision.tokenPresent, error: provision.error ? "provision_error" : null },
        }, { headers });
      },
    },
  },
});