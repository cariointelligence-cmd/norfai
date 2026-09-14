import { createFileRoute } from "@tanstack/react-router";
import { NORF_BUILD, vercelDeployProbe } from "@/lib/norr/build-stamp.ts";
import { provisionCarioNorfai, vercelTokenPresent } from "@/lib/norr/vercel-provision.ts";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cutover = new URL(request.url).searchParams.get("cutover") === "1";
        const provision = cutover
          ? await provisionCarioNorfai()
          : { tokenPresent: vercelTokenPresent(), error: null };
        let mail: { provider: string; source: string; resendReady: boolean } = {
          provider: "none",
          source: "none",
          resendReady: Boolean(
            process.env.RESEND_API_KEY?.trim() || process.env.RESEND_KEY?.trim() || process.env.RESEND?.trim(),
          ),
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
          ok: true,
          app: "norf",
          build: NORF_BUILD,
          ts: new Date().toISOString(),
          deploy: { ...vercelDeployProbe(), resendReady: mail.resendReady || vercelDeployProbe().resendReady },
          mail,
          provision,
        });
      },
    },
  },
});
