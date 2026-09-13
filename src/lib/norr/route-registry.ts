/** Canonical route registry. A request never resolves to undefined. */

export const ROUTE_AUTH = ["public", "session", "admin", "internal"] as const;
export type RouteAuth = (typeof ROUTE_AUTH)[number];

export type RouteDef = {
  id: string;
  path: string;
  method: "GET" | "POST" | "ANY";
  purpose: string;
  auth: RouteAuth;
  timeoutMs: number;
  sideEffects: boolean;
  capability: string;
};

export const ROUTE_REGISTRY: RouteDef[] = [
  { id: "health", path: "/api/health", method: "GET", purpose: "liveness", auth: "public", timeoutMs: 2_000, sideEffects: false, capability: "ops" },
  { id: "auth", path: "/api/auth/$", method: "ANY", purpose: "session", auth: "public", timeoutMs: 8_000, sideEffects: true, capability: "auth" },
  { id: "cron", path: "/api/cron/tick", method: "GET", purpose: "watchdog", auth: "internal", timeoutMs: 28_000, sideEffects: true, capability: "queue" },
  { id: "jobs_drain", path: "/api/jobs/drain", method: "POST", purpose: "vercel job drain", auth: "internal", timeoutMs: 28_000, sideEffects: true, capability: "queue" },
  { id: "worker", path: "/api/internal/worker", method: "POST", purpose: "job drain recovery", auth: "internal", timeoutMs: 28_000, sideEffects: true, capability: "queue" },
  { id: "canary", path: "/api/internal/canary", method: "GET", purpose: "synthetic search health", auth: "internal", timeoutMs: 15_000, sideEffects: false, capability: "ops" },
  { id: "stripe", path: "/api/stripe/webhook", method: "POST", purpose: "billing events", auth: "internal", timeoutMs: 10_000, sideEffects: true, capability: "billing" },
  { id: "gsc", path: "/api/gsc/callback", method: "GET", purpose: "search console oauth", auth: "session", timeoutMs: 8_000, sideEffects: true, capability: "seo" },
  { id: "landing", path: "/", method: "GET", purpose: "marketing", auth: "public", timeoutMs: 5_000, sideEffects: false, capability: "face" },
  { id: "search_new", path: "/search/new", method: "GET", purpose: "start B2B search", auth: "session", timeoutMs: 8_000, sideEffects: false, capability: "COMPANY_DISCOVERY" },
  { id: "search_run", path: "/search/$runId", method: "GET", purpose: "search results", auth: "session", timeoutMs: 8_000, sideEffects: false, capability: "COMPANY_DISCOVERY" },
  { id: "search_list", path: "/search", method: "GET", purpose: "search history", auth: "session", timeoutMs: 5_000, sideEffects: false, capability: "COMPANY_DISCOVERY" },
  { id: "companies", path: "/companies", method: "GET", purpose: "company index", auth: "session", timeoutMs: 8_000, sideEffects: false, capability: "COMPANY_IDENTITY" },
  { id: "company", path: "/companies/$companyId", method: "GET", purpose: "company intelligence", auth: "session", timeoutMs: 8_000, sideEffects: false, capability: "COMPANY_IDENTITY" },
  { id: "admin", path: "/admin", method: "GET", purpose: "control plane", auth: "admin", timeoutMs: 8_000, sideEffects: false, capability: "ops" },
  { id: "admin_search", path: "/admin/search", method: "GET", purpose: "search health", auth: "admin", timeoutMs: 10_000, sideEffects: false, capability: "ops" },
  { id: "admin_security", path: "/admin/security", method: "GET", purpose: "security trail", auth: "admin", timeoutMs: 8_000, sideEffects: false, capability: "ops" },
];

export type RouteResolution =
  | { ok: true; route: RouteDef }
  | { ok: false; code: "UNDEFINED_ROUTE"; path: string };

export function normalizeRoutePath(path: string): string {
  const raw = String(path ?? "").split("?")[0] ?? "";
  const p = raw.replace(/\/+$/, "") || "/";
  return p.replace(/^\/_app/, "") || "/";
}

export function resolveRoute(path: string, method: string = "GET"): RouteResolution {
  const p = normalizeRoutePath(path);
  const m = method.toUpperCase();
  const hit = ROUTE_REGISTRY.find((r) => {
    if (r.method !== "ANY" && r.method !== m && !(r.method === "GET" && m === "HEAD")) return false;
    const pat = r.path.replace(/\$[A-Za-z]+/g, "[^/]+").replace(/\$$/, "");
    return new RegExp(`^${pat}$`).test(p);
  });
  if (!hit) return { ok: false, code: "UNDEFINED_ROUTE", path: p };
  return { ok: true, route: hit };
}

export function assertDefinedRoute(path: string, method = "GET"): RouteDef {
  const r = resolveRoute(path, method);
  if (!r.ok) {
    const err = new Error(`UNDEFINED_ROUTE:${r.path}`);
    err.name = "UndefinedRouteError";
    throw err;
  }
  return r.route;
}
