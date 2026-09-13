/** One contract every enrichment engine returns. NO_DATA is not FAILED. UNKNOWN is not FALSE. */

export const ENGINE_STATUSES = [
  "SUCCESS",
  "PARTIAL",
  "NO_DATA",
  "FAILED",
  "TIMEOUT",
  "SKIPPED",
  "NOT_REQUIRED",
] as const;
export type EngineStatus = (typeof ENGINE_STATUSES)[number];

export const CAPABILITIES = [
  "identity",
  "website",
  "email",
  "phone",
  "decisionMaker",
  "financial",
  "technology",
  "websiteAnalysis",
  "signals",
] as const;
export type CompanyCapability = (typeof CAPABILITIES)[number];

export const EMAIL_CLASSES = ["published", "verified_provider", "inferred", "unknown", "invalid"] as const;
export type EmailClass = (typeof EMAIL_CLASSES)[number];

export type EngineFact = {
  field: string;
  value: string | number | boolean | null;
  category: "fact" | "signal" | "inference" | "heuristic";
  source: string;
  observedAt?: string | null;
  confidence?: number | null;
  verification?: EmailClass | "official" | "derived" | "unknown";
  method?: string | null;
};

export type EngineOutput = {
  engine: string;
  capability: CompanyCapability | "plan";
  status: EngineStatus;
  facts: EngineFact[];
  errors: string[];
  durationMs: number;
  freshnessMs?: number | null;
};

export function isUsableStatus(s: EngineStatus): boolean {
  return s === "SUCCESS" || s === "PARTIAL";
}

export function isTerminalFailure(s: EngineStatus): boolean {
  return s === "FAILED" || s === "TIMEOUT";
}
