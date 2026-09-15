/**
 * Vercel execution plane.
 * User request stays short. All async work is Vercel functions + durable jobs.
 */
import { RUNTIME } from "./runtime.ts";

export const EXECUTION_TARGETS = {
  YTJ_DISCOVERY: { target: "VERCEL_FUNCTION", maxMs: RUNTIME.discoverBudgetMs, blocking: true, class: "INTERACTIVE_FAST" },
  ICP_COMPILER: { target: "VERCEL_FUNCTION", maxMs: 800, blocking: true, class: "INTERACTIVE_FAST" },
  SEARCH_INTAKE: { target: "VERCEL_FUNCTION", maxMs: 2_000, blocking: true, class: "INTERACTIVE_FAST" },
  FIRST_CONTACTS: { target: "VERCEL_FUNCTION", maxMs: 1_800, blocking: true, class: "INTERACTIVE_FAST" },
  CONTACT_ENRICH: { target: "VERCEL_FUNCTION", maxMs: RUNTIME.workerMaxMs, blocking: false, class: "SHORT_BACKGROUND" },
  WEBSITE_CRAWL: { target: "VERCEL_FUNCTION", maxMs: RUNTIME.workerMaxMs, blocking: false, class: "LONG_BACKGROUND" },
  FINANCIAL: { target: "VERCEL_FUNCTION", maxMs: 12_000, blocking: false, class: "SHORT_BACKGROUND" },
  APIFY_LEADS: { target: "VERCEL_FUNCTION", maxMs: 90_000, blocking: false, class: "EXTERNAL-INTEGRATION" },
  RANKING: { target: "VERCEL_FUNCTION", maxMs: 1_000, blocking: false, class: "INTERACTIVE_FAST" },
  CRON_RECOVERY: { target: "VERCEL_CRON", maxMs: 28_000, blocking: false, class: "SCHEDULED" },
} as const;

export type ExecutionClass =
  | "INTERACTIVE_FAST"
  | "INTERACTIVE_STREAMING"
  | "SHORT_BACKGROUND"
  | "LONG_BACKGROUND"
  | "SCHEDULED"
  | "BULK"
  | "EXTERNAL-INTEGRATION";

export function classifyWorkload(kind: string): ExecutionClass {
  if (kind === "discover" || kind === "intake" || kind === "plan" || kind === "rank") return "INTERACTIVE_FAST";
  if (kind === "email" || kind === "enrich") return "SHORT_BACKGROUND";
  if (kind === "crawl" || kind === "signals" || kind === "scrape") return "LONG_BACKGROUND";
  if (kind === "apify") return "EXTERNAL-INTEGRATION";
  if (kind === "cron") return "SCHEDULED";
  if (kind === "backfill") return "BULK";
  return "SHORT_BACKGROUND";
}

export function interactiveBudgetMs(kind: string): number {
  if (kind === "discover") return EXECUTION_TARGETS.YTJ_DISCOVERY.maxMs;
  if (kind === "enrich") return EXECUTION_TARGETS.FIRST_CONTACTS.maxMs;
  return 1_200;
}

export function shouldBlockRequest(kind: string): boolean {
  return classifyWorkload(kind) === "INTERACTIVE_FAST";
}

/** Keep the isolate alive after the HTTP response (Vercel waitUntil). */
function vercelWaitUntil(): ((p: Promise<unknown>) => void) | null {
  try {
    const bag = (globalThis as Record<string, unknown>)[Symbol.for("@vercel/request-context") as unknown as string] as
      | { get?: () => { waitUntil?: (p: Promise<unknown>) => void } }
      | undefined;
    const fn = bag?.get?.()?.waitUntil;
    if (typeof fn === "function") return fn.bind(bag.get?.());
  } catch { /* no request context */ }
  return null;
}

export function scheduleBackground(task: () => Promise<unknown>): void {
  const run = () => task().catch((err) => console.error("[norf] background", err instanceof Error ? err.message : err));
  const waitUntil = vercelWaitUntil();
  if (waitUntil) {
    waitUntil(run());
    return;
  }
  if (process.env.VERCEL && !process.env.NODE_TEST_CONTEXT) {
    void import(/* @vite-ignore */ "@vercel/functions")
      .then((vf) => {
        if (typeof vf.waitUntil === "function") vf.waitUntil(run());
        else void run();
      })
      .catch(() => {
        void run();
      });
    return;
  }
  void run();
}

export function vercelRuntimeInfo() {
  const env = process.env;
  return {
    vercel: Boolean(env.VERCEL),
    env: env.VERCEL_ENV ?? null,
    region: env.VERCEL_REGION ?? env.AWS_REGION ?? null,
    url: env.VERCEL_URL ?? null,
    gitSha: env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_SHA ?? null,
    deploymentId: env.VERCEL_DEPLOYMENT_ID ?? null,
    runtime: "nodejs",
    fastPath: "intake+ytj",
    background: "vercel-function-chain+cron",
    legacyBackend: "retired",
  };
}
