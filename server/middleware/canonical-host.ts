/**
 * Production host is www.norfai.com. Vercel *.vercel.app aliases (and the
 * default norfai.vercel.app) must not start Google/X OAuth — that is what
 * produced login?error=state_mismatch (__Host- cookies cannot follow a host
 * change mid-flow).
 */
const CANONICAL_HOST = "www.norfai.com";

type Ev = {
  url: URL;
  req: { method: string; headers: Headers };
};

export default async function canonicalHostMiddleware(
  event: Ev,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const host = (
    event.req.headers.get("x-forwarded-host") ??
    event.req.headers.get("host") ??
    event.url.host
  )
    .split(",")[0]
    ?.trim()
    .split(":")[0]
    ?.toLowerCase();
  if (!host || host === CANONICAL_HOST) return next();

  const path = event.url.pathname || "/";
  if (path.startsWith("/api/")) return next();

  const isVercelApp = host.endsWith(".vercel.app");
  const isApex = host === "norfai.com";
  if (!isVercelApp && !isApex) return next();

  const dest = `https://${CANONICAL_HOST}${path}${event.url.search}`;
  return Response.redirect(dest, 308);
}
