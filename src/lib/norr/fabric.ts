/**
 * Norfai Intelligence Execution Fabric.
 * One coordinator: admission → DAG → engines → invariants → ops diagnosis.
 * Does not replace workers/queues; it decides what they may run and why.
 */
import type { SearchPlan } from "./search-orchestrator.ts";
import { planSearch } from "./search-orchestrator.ts";
import type { SearchCriteria } from "./types.ts";
import type { QueuePressure } from "./queue-monitor.ts";
import { RUNTIME } from "./runtime.ts";

export const ACTION_OUTCOMES = [
  "EXECUTED",
  "QUEUED",
  "PARTIAL",
  "REJECTED_WITH_REASON",
  "BLOCKED_WITH_REASON",
  "FAILED_WITH_REASON",
  "NO_DATA_WITH_REASON",
  "NOT_REQUIRED",
] as const;
export type ActionOutcome = (typeof ACTION_OUTCOMES)[number];

export const FABRIC_CAPABILITIES = [
  "COMPANY_DISCOVERY",
  "COMPANY_IDENTITY",
  "DOMAIN_RESOLUTION",
  "CONTACT_EMAIL",
  "CONTACT_PHONE",
  "DECISION_MAKER",
  "FINANCIALS",
  "WEBSITE_INTELLIGENCE",
  "TECHNOLOGY",
  "COMMERCIAL_SIGNALS",
  "ICP_SCORING",
  "EXPORT",
  "CRM_SYNC",
] as const;
export type FabricCapability = (typeof FABRIC_CAPABILITIES)[number];

export const DECISION_CODES = [
  "SOURCE_REQUIRED_BY_REVENUE_FILTER",
  "CONTACT_ENRICHMENT_REQUIRED",
  "COMPANY_REJECTED_WRONG_INDUSTRY",
  "SKIPPED_DATA_ALREADY_FRESH",
  "JOB_REQUEUED_CAPABILITY_INCOMPLETE",
  "APIFY_SKIPPED_COST_POLICY",
  "WORKER_RECLAIMED_EXPIRED_LEASE",
  "ADMITTED_INTERACTIVE",
  "DEFERRED_OPTIONAL_UNDER_PRESSURE",
  "REJECTED_OVERLOADED",
  "UNDEFINED_ROUTE",
  "MANDATORY_UNKNOWN_NOT_MATCH",
] as const;
export type DecisionCode = (typeof DECISION_CODES)[number];

export const JOB_PRIORITIES = {
  P0_DISCOVER: 0,
  P1_CORE_ENRICH: 1,
  P2_CONTACT_RECOVERY: 2,
  P3_OPTIONAL: 3,
  P4_SCHEDULED: 4,
  P5_BACKFILL: 5,
} as const;

export type DagNode = {
  id: string;
  capability: FabricCapability | "PLAN" | "FUSE" | "RANK";
  dependsOn: string[];
  critical: boolean;
  paid: boolean;
};

export type ExecutionDecision = {
  code: DecisionCode;
  outcome: ActionOutcome;
  why: string;
  engine?: string;
};

export type SearchBudget = {
  maxSourceCalls: number;
  maxPaidCalls: number;
  maxLlmCalls: number;
  maxCrawlPages: number;
  maxCandidates: number;
  maxConcurrentJobs: number;
  stageMs: number;
};

export function searchBudget(opts: { depth?: "normal" | "deep"; plan?: string | null }): SearchBudget {
  const deep = opts.depth === "deep";
  return {
    maxSourceCalls: deep ? 40 : 18,
    maxPaidCalls: deep ? 2 : 1,
    maxLlmCalls: deep ? 4 : 1,
    maxCrawlPages: deep ? RUNTIME.deepCrawlBudget : RUNTIME.crawlBudget,
    maxCandidates: deep ? 120 : 80,
    maxConcurrentJobs: RUNTIME.jobConcurrency,
    stageMs: deep ? 20_000 : 10_000,
  };
}

export function buildSearchDag(plan: SearchPlan): DagNode[] {
  const nodes: DagNode[] = [
    { id: "discover", capability: "COMPANY_DISCOVERY", dependsOn: [], critical: true, paid: false },
    { id: "identity", capability: "COMPANY_IDENTITY", dependsOn: ["discover"], critical: true, paid: false },
    { id: "cheap", capability: "ICP_SCORING", dependsOn: ["identity"], critical: true, paid: false },
    { id: "domain", capability: "DOMAIN_RESOLUTION", dependsOn: ["cheap"], critical: true, paid: false },
    { id: "email", capability: "CONTACT_EMAIL", dependsOn: ["domain"], critical: true, paid: false },
    { id: "phone", capability: "CONTACT_PHONE", dependsOn: ["domain"], critical: true, paid: false },
    { id: "people", capability: "DECISION_MAKER", dependsOn: ["domain"], critical: false, paid: false },
  ];
  if (plan.engines.financial !== "skip") {
    nodes.push({ id: "financial", capability: "FINANCIALS", dependsOn: ["cheap"], critical: plan.engines.financial === "required", paid: false });
  }
  if (plan.engines.websiteAnalysis !== "skip") {
    nodes.push({ id: "website", capability: "WEBSITE_INTELLIGENCE", dependsOn: ["domain"], critical: false, paid: false });
  }
  if (plan.engines.technology !== "skip") {
    nodes.push({ id: "tech", capability: "TECHNOLOGY", dependsOn: ["domain"], critical: false, paid: false });
  }
  if (plan.engines.signals !== "skip") {
    nodes.push({ id: "signals", capability: "COMMERCIAL_SIGNALS", dependsOn: ["cheap"], critical: plan.engines.signals === "required", paid: false });
  }
  nodes.push({ id: "fuse", capability: "FUSE", dependsOn: nodes.filter((n) => n.critical).map((n) => n.id), critical: true, paid: false });
  nodes.push({ id: "rank", capability: "ICP_SCORING", dependsOn: ["fuse"], critical: true, paid: false });
  return nodes;
}

export function readyNodes(dag: DagNode[], done: Set<string>): DagNode[] {
  return dag.filter((n) => !done.has(n.id) && n.dependsOn.every((d) => done.has(d)));
}

export function jobPriority(type: string): number {
  if (type === "discover") return JOB_PRIORITIES.P0_DISCOVER;
  if (type === "enrich" || type === "score") return JOB_PRIORITIES.P1_CORE_ENRICH;
  if (type === "email") return JOB_PRIORITIES.P2_CONTACT_RECOVERY;
  if (type === "crawl" || type === "signals" || type === "scrape") return JOB_PRIORITIES.P3_OPTIONAL;
  if (type === "schedule") return JOB_PRIORITIES.P4_SCHEDULED;
  return JOB_PRIORITIES.P5_BACKFILL;
}

export function admitWork(opts: {
  pressure: QueuePressure | string;
  priority: number;
  interactive: boolean;
}): ExecutionDecision {
  const p = String(opts.pressure);
  if (p === "overloaded" && !opts.interactive && opts.priority >= JOB_PRIORITIES.P4_SCHEDULED) {
    return {
      code: "REJECTED_OVERLOADED",
      outcome: "BLOCKED_WITH_REASON",
      why: "Backfill blocked while the queue is overloaded",
    };
  }
  if (p === "overloaded" && opts.priority >= JOB_PRIORITIES.P3_OPTIONAL) {
    return {
      code: "DEFERRED_OPTIONAL_UNDER_PRESSURE",
      outcome: "QUEUED",
      why: "Optional enrichment deferred so interactive discovery stays on the critical path",
    };
  }
  return {
    code: "ADMITTED_INTERACTIVE",
    outcome: opts.interactive ? "EXECUTED" : "QUEUED",
    why: "Work admitted under current pressure",
  };
}

export function loadShed(pressure: QueuePressure | string): { skipOptional: boolean; concurrency: number; reason: string } {
  if (pressure === "overloaded") {
    return { skipOptional: true, concurrency: Math.max(4, Math.floor(RUNTIME.jobConcurrency / 2)), reason: "overload: protect discovery" };
  }
  if (pressure === "elevated") {
    return { skipOptional: true, concurrency: RUNTIME.jobConcurrency, reason: "elevated: skip optional engines" };
  }
  return { skipOptional: false, concurrency: RUNTIME.jobConcurrency, reason: "healthy" };
}

export function classifyStall(opts: {
  queued: number;
  running: number;
  workerHeartbeatMs: number | null;
  sourceTimeoutRate: number;
  discoverComplete: boolean;
}): { code: string; likely: string; evidence: string[] } {
  const evidence: string[] = [];
  if (opts.workerHeartbeatMs == null || opts.workerHeartbeatMs > 60_000) {
    evidence.push("worker heartbeat missing");
    return { code: "WORKER_UNAVAILABLE", likely: "Worker tick not running", evidence };
  }
  if (opts.queued > 0 && opts.running === 0) {
    evidence.push(`${opts.queued} queued and 0 running`);
    return { code: "QUEUE_NOT_DRAINING", likely: "Jobs queued without a claim", evidence };
  }
  if (opts.sourceTimeoutRate >= 0.4) {
    evidence.push(`source timeout rate ${(opts.sourceTimeoutRate * 100).toFixed(0)}%`);
    return { code: "SOURCE_DEGRADATION", likely: "External source latency", evidence };
  }
  if (!opts.discoverComplete && opts.running > 0) {
    evidence.push("discover still running");
    return { code: "DISCOVER_IN_FLIGHT", likely: "Register still paging", evidence };
  }
  return { code: "UNKNOWN", likely: "Insufficient evidence", evidence: ["no correlated signal"] };
}

export function checkInvariants(state: {
  searchStatus?: string;
  mandatoryQueued?: number;
  emailVerified?: boolean;
  emailValue?: string | null;
  jobStatus?: string;
  hasLease?: boolean;
  sourceActive?: boolean;
  sourceCallable?: boolean;
}): string[] {
  const v: string[] = [];
  if (state.searchStatus === "completed" && (state.mandatoryQueued ?? 0) > 0) {
    v.push("COMPLETE_WITH_MANDATORY_QUEUED");
  }
  if (state.emailVerified && !state.emailValue) v.push("VERIFIED_EMAIL_WITHOUT_VALUE");
  if (state.jobStatus === "running" && state.hasLease === false) v.push("RUNNING_WITHOUT_LEASE");
  if (state.sourceActive && state.sourceCallable === false) v.push("ACTIVE_SOURCE_WITHOUT_CALL_PATH");
  return v;
}

export function compileExecution(opts: {
  criteria?: SearchCriteria;
  depth?: "normal" | "deep";
  country?: string | null;
  pressure?: QueuePressure | string;
}): {
  plan: SearchPlan;
  dag: DagNode[];
  budget: SearchBudget;
  shed: ReturnType<typeof loadShed>;
  decisions: ExecutionDecision[];
} {
  const plan = planSearch({ criteria: opts.criteria, target: opts.criteria?.target, depth: opts.depth, country: opts.country });
  const dag = buildSearchDag(plan);
  const budget = searchBudget({ depth: opts.depth });
  const shed = loadShed(opts.pressure ?? "healthy");
  const decisions: ExecutionDecision[] = [];
  if (plan.engines.financial === "required") {
    decisions.push({
      code: "SOURCE_REQUIRED_BY_REVENUE_FILTER",
      outcome: "EXECUTED",
      why: "Revenue filter cannot treat UNKNOWN as a match",
      engine: "financial",
    });
  }
  if (plan.engines.email === "required") {
    decisions.push({
      code: "CONTACT_ENRICHMENT_REQUIRED",
      outcome: "EXECUTED",
      why: "Email is on the CORE_SALES path",
      engine: "email",
    });
  }
  if (shed.skipOptional) {
    decisions.push({
      code: "DEFERRED_OPTIONAL_UNDER_PRESSURE",
      outcome: "QUEUED",
      why: shed.reason,
    });
  }
  return { plan, dag, budget, shed, decisions };
}

export function simulateLoad(opts: {
  concurrentSearches: number;
  jobsPerSearch?: number;
  workerSlots?: number;
}): { queuedPeak: number; waitBatches: number; starved: boolean; bottleneck: string } {
  const jobs = Math.max(1, opts.jobsPerSearch ?? 12);
  const slots = Math.max(1, opts.workerSlots ?? RUNTIME.jobConcurrency);
  const total = opts.concurrentSearches * jobs;
  const waitBatches = Math.ceil(total / slots);
  const queuedPeak = Math.max(0, total - slots);
  const starved = waitBatches > 8;
  return {
    queuedPeak,
    waitBatches,
    starved,
    bottleneck: starved ? "worker_slots" : queuedPeak > 400 ? "queue_depth" : "ok",
  };
}

export function recommendCapacity(opts: {
  p95Ms: number;
  queueDepth: number;
  workerUtilization: number;
  sourceTimeoutRate: number;
}): Array<{ priority: "P0" | "P1" | "P2"; title: string; evidence: string; impact: string }> {
  const out: Array<{ priority: "P0" | "P1" | "P2"; title: string; evidence: string; impact: string }> = [];
  if (opts.queueDepth >= 400) {
    out.push({
      priority: "P0",
      title: "Drain or raise worker slots",
      evidence: `queue depth ${opts.queueDepth}`,
      impact: "Interactive search wait",
    });
  }
  if (opts.p95Ms >= 15_000) {
    out.push({
      priority: "P1",
      title: "Cut optional engines from the hot path",
      evidence: `search P95 ${opts.p95Ms}ms`,
      impact: "Time to first 10",
    });
  }
  if (opts.sourceTimeoutRate >= 0.25) {
    out.push({
      priority: "P1",
      title: "Open circuit on slow source",
      evidence: `timeout rate ${(opts.sourceTimeoutRate * 100).toFixed(0)}%`,
      impact: "Protect CORE_READY",
    });
  }
  if (opts.workerUtilization >= 0.85) {
    out.push({
      priority: "P2",
      title: "Reserve slots for P0 discover",
      evidence: `utilization ${(opts.workerUtilization * 100).toFixed(0)}%`,
      impact: "Fair scheduling",
    });
  }
  return out;
}

export function failureClass(err: string): string {
  const s = err.toLowerCase();
  if (/unauthor|forbidden|401|403/.test(s)) return "AUTH";
  if (/quota|limit/.test(s)) return "RESOURCE";
  if (/timeout/.test(s)) return "TIMEOUT";
  if (/undefined_route/.test(s)) return "LOGIC";
  if (/sql|postgres|column/.test(s)) return "DATABASE";
  if (/secret|api key|not configured/.test(s)) return "CONFIG";
  return "UNKNOWN";
}
