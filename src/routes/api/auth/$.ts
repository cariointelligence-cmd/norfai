import { createFileRoute } from "@tanstack/react-router";
import { auth, registerInboundAuthHost } from "@/lib/auth/server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        registerInboundAuthHost(request);
        return auth.handler(request);
      },
      POST: ({ request }) => {
        registerInboundAuthHost(request);
        return auth.handler(request);
      },
    },
  },
});