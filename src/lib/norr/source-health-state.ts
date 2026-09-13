export const HEALTH_STATES = ["ACTIVE", "DEGRADED", "UNAVAILABLE", "DISABLED", "RETIRED", "EXPERIMENTAL"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export type SourceHealthInput = {
  moduleExists: boolean;
  callSiteExists: boolean;
  credentialsRequired: boolean;
  credentialsPresent: boolean;
  retired?: boolean;
  experimental?: boolean;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastLatencyMs?: number | null;
  consecutiveFailures?: number;
  successRate?: number | null;
};

export function classifyRuntimeHealth(s: SourceHealthInput, now = Date.now()): HealthState {
  if (s.retired) return "RETIRED";
  if (!s.moduleExists || !s.callSiteExists) return "DISABLED";
  if (s.credentialsRequired && !s.credentialsPresent) return "DISABLED";
  if (s.experimental) return "EXPERIMENTAL";
  const failAge = s.lastFailureAt ? now - Date.parse(s.lastFailureAt) : null;
  const okAge = s.lastSuccessAt ? now - Date.parse(s.lastSuccessAt) : null;
  if ((s.consecutiveFailures ?? 0) >= 3 && failAge != null && failAge < 30 * 60000) return "UNAVAILABLE";
  if (s.successRate != null && s.successRate < 0.5 && (s.consecutiveFailures ?? 0) >= 1) return "DEGRADED";
  if (failAge != null && (okAge == null || failAge < okAge) && failAge < 15 * 60000) return "DEGRADED";
  if (s.lastLatencyMs != null && s.lastLatencyMs > 8000) return "DEGRADED";
  return "ACTIVE";
}

export function capabilityWhenSourceDown(sourceId: string): { capability: string; effect: string } {
  switch (sourceId) {
    case "prh_xbrl":
    case "esef_xbrl":
      return { capability: "revenue", effect: "Revenue stays UNKNOWN. Strict revenue filters exclude the company." };
    case "duunitori":
      return { capability: "hiring", effect: "Hiring cannot be confirmed. Required hiring queries must not treat UNKNOWN as true." };
    case "ytj":
      return { capability: "identity", effect: "Finnish register discovery is unavailable." };
    case "ted":
    case "hilma":
      return { capability: "procurement", effect: "Procurement notices are not attached." };
    default:
      return { capability: "enrichment", effect: "Optional enrichment is skipped." };
  }
}
