import { SOURCE_RUNTIME } from "./source-runtime.ts";
import { classifyRuntimeHealth, type HealthState } from "./source-health-state.ts";

export type ProductionHealth = {
  searchWorking: boolean;
  databaseReachable: boolean | null;
  sources: Array<{ id: string; status: HealthState; note: string }>;
  credentials: Array<{ id: string; configured: boolean }>;
  queuesHealthy: boolean | null;
  aiConfigured: boolean;
  checkedAt: string;
};

export function buildProductionHealth(opts: {
  databaseOk: boolean | null;
  queuePressure?: string | null;
  env?: Record<string, string | undefined>;
}): ProductionHealth {
  const env = opts.env ?? (typeof process !== "undefined" ? process.env : {});
  const cred = (key: string) => Boolean(env[key] && String(env[key]).length > 4);
  const sources = SOURCE_RUNTIME.map((s) => {
    const credentialsRequired = s.id === "hunter" || s.id === "apify";
    const credentialsPresent = s.id === "hunter" ? cred("HUNTER_API_KEY") : s.id === "apify" ? cred("APIFY_API") : true;
    const status = classifyRuntimeHealth({
      moduleExists: true,
      callSiteExists: s.callSites.length > 0,
      credentialsRequired,
      credentialsPresent,
      retired: s.status === "RETIRED",
      experimental: s.status === "EXPERIMENTAL",
    });
    return { id: s.id, status, note: s.note };
  });
  const queuesHealthy = opts.queuePressure ? !["overload", "critical"].includes(opts.queuePressure) : null;
  const searchWorking = opts.databaseOk !== false && sources.some((s) => s.id === "ytj" && s.status === "ACTIVE");
  return {
    searchWorking,
    databaseReachable: opts.databaseOk,
    sources,
    credentials: [
      { id: "HUNTER_API_KEY", configured: cred("HUNTER_API_KEY") },
      { id: "APIFY_API", configured: cred("APIFY_API") },
      { id: "OPENAI_API_KEY", configured: cred("OPENAI_API_KEY") || cred("XAI_API_KEY") },
    ],
    queuesHealthy,
    aiConfigured: cred("OPENAI_API_KEY") || cred("XAI_API_KEY"),
    checkedAt: new Date().toISOString(),
  };
}
