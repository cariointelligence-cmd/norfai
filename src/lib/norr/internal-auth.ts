/**
 * Machine-to-machine authentication for NORFAI's private service network.
 * Internal routes must not rely on obscurity — every call carries a signed
 * service identity, timestamp, nonce, request id and scope.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { safeEqual } from "./security.ts";

export const SERVICE_IDENTITIES = ["gateway", "worker", "crawler", "scoring", "enrichment", "cron"] as const;
export type ServiceIdentity = (typeof SERVICE_IDENTITIES)[number];

export const SERVICE_SCOPES: Record<ServiceIdentity, readonly string[]> = {
  gateway: ["*"],
  worker: ["worker.tick", "job.process", "jobs.drain"],
  crawler: ["crawler.fetch", "crawler.submit"],
  scoring: ["scoring.read", "scoring.write"],
  enrichment: ["enrichment.company"],
  cron: ["worker.tick", "blog.publish", "jobs.drain"],
};

const seenNonces = new Map<string, number>();

export function internalSecret(): string | null {
  const s =
    process.env.INTERNAL_SERVICE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    null;
  return s && s.length >= 16 ? s : null;
}

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function stampNonce(nonce: string): boolean {
  const now = Date.now();
  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, now);
  if (seenNonces.size > 4000) {
    for (const [k, t] of seenNonces) {
      if (now - t > 5 * 60_000) seenNonces.delete(k);
      if (seenNonces.size < 2500) break;
    }
  }
  return true;
}

export function signServiceRequest(opts: {
  service: ServiceIdentity;
  scope: string;
  body?: string;
  timestamp?: number;
  nonce?: string;
}): { authorization: string; timestamp: string; nonce: string; requestId: string; scope: string } {
  const secret = internalSecret();
  if (!secret) throw new Error("Internal service secret is not configured");
  const timestamp = String(opts.timestamp ?? Date.now());
  const nonce = opts.nonce ?? randomBytes(16).toString("hex");
  const requestId = randomBytes(10).toString("hex");
  const payload = `${opts.service}\n${opts.scope}\n${timestamp}\n${nonce}\n${requestId}\n${opts.body ?? ""}`;
  const sig = hmac(secret, payload);
  return {
    authorization: `NorfService ${opts.service}:${sig}`,
    timestamp,
    nonce,
    requestId,
    scope: opts.scope,
  };
}

export type ServiceAuthOk = { ok: true; service: ServiceIdentity; requestId: string; scope: string };
export type ServiceAuthFail = { ok: false; error: string; status: number };

export function verifyServiceRequest(
  headers: Headers,
  body: string,
  requiredScope: string,
): ServiceAuthOk | ServiceAuthFail {
  const secret = internalSecret();
  if (!secret) return { ok: false, error: "not configured", status: 404 };

  const auth = headers.get("authorization") ?? "";
  const m = auth.match(/^NorfService\s+([a-z]+):([a-f0-9]{64})$/i);
  if (!m) return { ok: false, error: "unauthorized", status: 401 };
  const service = m[1]!.toLowerCase() as ServiceIdentity;
  const sig = m[2]!;
  if (!(SERVICE_IDENTITIES as readonly string[]).includes(service)) {
    return { ok: false, error: "unknown service", status: 401 };
  }

  const timestamp = headers.get("x-norf-timestamp") ?? "";
  const nonce = headers.get("x-norf-nonce") ?? "";
  const requestId = headers.get("x-norf-request-id") ?? "";
  const scope = headers.get("x-norf-scope") ?? "";
  const ts = Number(timestamp);
  if (!timestamp || !nonce || !requestId || !scope) return { ok: false, error: "unauthorized", status: 401 };
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 60_000) {
    return { ok: false, error: "expired", status: 401 };
  }
  if (!stampNonce(`${service}:${nonce}`)) return { ok: false, error: "replay", status: 401 };

  const allowed = SERVICE_SCOPES[service];
  if (!allowed.includes("*") && !allowed.includes(requiredScope)) {
    return { ok: false, error: "wrong scope", status: 403 };
  }
  if (scope !== requiredScope && !allowed.includes("*")) {
    return { ok: false, error: "wrong scope", status: 403 };
  }

  const payload = `${service}\n${scope}\n${timestamp}\n${nonce}\n${requestId}\n${body}`;
  const expected = hmac(secret, payload);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid signature", status: 401 };
  }
  return { ok: true, service, requestId, scope };
}

/** Bearer fallback used by cron-style callers that share CRON_SECRET. */
export function verifyCronBearer(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const header = headers.get("x-cron-secret") ?? "";
  return safeEqual(token, secret) || safeEqual(header, secret);
}

export function serviceMay(service: ServiceIdentity, action: "fetch" | "accounts" | "billing" | "admin" | "score" | "crawl"): boolean {
  switch (service) {
    case "crawler":
      return action === "fetch" || action === "crawl";
    case "scoring":
      return action === "score";
    case "worker":
    case "cron":
    case "gateway":
      return action !== "admin";
    case "enrichment":
      return action === "score" || action === "fetch";
    default:
      return false;
  }
}
