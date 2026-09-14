import { createFileRoute } from "@tanstack/react-router";
import { NORF_BUILD, vercelDeployProbe } from "@/lib/norr/build-stamp.ts";
import { provisionCarioNorfai, vercelTokenPresent } from "@/lib/norr/vercel-provision.ts";
import { cronHealthAuthorized, inspectApiRequest, publicHealthBody, shieldHeaders } from "@/lib/norr/api-shield.ts";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const blocked = inspectApiRequest(request, { bucket: "health", max: 120 });
        if (blocked) return blocked;
        const url = new URL(request.url);
        const cutover = url.searchParams.get("cutover") === "1";
        const headers = shieldHeaders(request);
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
