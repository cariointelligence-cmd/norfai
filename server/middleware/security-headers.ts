/**
 * Production security headers. Auto-registered because vite.config sets
 * serverDir: "./server". Complements the Vite-dev plugin of the same headers.
 *
 * frame-ancestors allows the Grok live-preview embedders; it is NOT `none`
 * and we do not set X-Frame-Options DENY, or the preview iframe goes blank.
 */
import { securityHeaderMap } from "../../src/lib/norr/security.ts";

type Ev = {
  url: URL;
  req: { method: string; headers: Headers };
};

export default async function securityHeadersMiddleware(
  event: Ev,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const origin = event.req.headers.get("origin");
  const result = await next();
  const headers = securityHeaderMap({ origin });
  if (result instanceof Response) {
    const nextHeaders = new Headers(result.headers);
    for (const [k, v] of Object.entries(headers)) {
      if (!nextHeaders.has(k)) nextHeaders.set(k, v);
    }
    if (!nextHeaders.has("Strict-Transport-Security") && event.url.protocol === "https:") {
      nextHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: nextHeaders,
    });
  }
  return result;
}
