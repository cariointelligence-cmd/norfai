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
        return Response.json({
          ok: true,
          app: "norf",
          build: NORF_BUILD,
          ts: new Date().toISOString(),
          deploy: vercelDeployProbe(),
          provision,
        });
      },
    },
  },
});
