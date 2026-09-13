/**
 * code_crafter/leads-finder — optional, query-aware, cost-capped hive node.
 * Default: do not call. Official FI identity stays YTJ/PRH.
 */
import type { SearchCriteria } from "../types.ts";
import type { TargetSpec } from "../targeting/spec.ts";
import { valuesOf } from "../criteria.ts";
import { APIFY_LEADS_FINDER_ID, findApifyTool, runApprovedApifyTool, type ApifyNormalizedItem } from "./apify.ts";

export const LEADS_FINDER_ACTOR = "code_crafter~leads-finder";
export const LEADS_FINDER_VERSION = "leads_finder_v1";
export const APIFY_MAX_RESULTS_PER_RUN = 15;
export const APIFY_MAX_RUNS_PER_SEARCH = 1;
export const APIFY_DAILY_BUDGET = 8;

export type ApifyMode = "OFF" | "AUTO_LIMITED" | "REQUIRED";
export type LeadsFinderDecision =
  | "SKIPPED_ALREADY_HAVE_DATA"
  | "SKIPPED_NOT_JUSTIFIED"
  | "SKIPPED_COST_BUDGET"
  | "SKIPPED_NOT_CONFIGURED"
  | "SKIPPED_MODE_OFF"
  | "USED_FOR_VALIDATED_CONTACT_GAP"
  | "USED_AS_DISCOVERY_SOURCE";

export type LeadsFinderInput = {
  fetch_count: number;
  company_industry?: string[];
  contact_job_title?: string[];
  contact_location?: string[];
  contact_city?: string[];
  email_status?: string[];
  min_revenue?: string;
  seniority_level?: string[];
  size?: string[];
  company_keywords?: string[];
};

const SIZE_BUCKETS = ["0–1", "2–10", "11–20", "21–50", "51–100", "101–200", "201–500", "501–1000", "1001–2000", "2001–5000", "10000+"] as const;
const SENIORITY = ["Founder", "Owner", "C-Level", "Director", "VP", "Head", "Manager", "Senior", "Entry", "Trainee"] as const;

const INDUSTRY_MAP: Record<string, string> = {
  "62": "information technology & services",
  "63": "computer software",
  "73": "marketing & advertising",
  "70": "management consulting",
  "69": "legal services",
  "71": "architecture & planning",
  "41": "construction",
  "42": "construction",
  "43": "construction",
  "46": "wholesale",
  "47": "retail",
  "49": "transportation/trucking/railroad",
  "55": "hospitality",
  "56": "restaurants",
  "64": "financial services",
  "65": "insurance",
  "66": "financial services",
  "68": "real estate",
  "72": "research",
  "74": "design",
  "77": "staffing and recruiting",
  "78": "staffing and recruiting",
  "80": "security and investigations",
  "81": "facilities services",
  "82": "business supplies and equipment",
  "85": "education management",
  "86": "hospital & health care",
};

const daily: number[] = [];
const perSearch = new Map<string, number>();

export function apifyMode(env: NodeJS.ProcessEnv = process.env): ApifyMode {
  const raw = String(env.APIFY_MODE ?? "AUTO_LIMITED").trim().toUpperCase();
  if (raw === "OFF" || raw === "REQUIRED") return raw;
  return "AUTO_LIMITED";
}

export function formatApifyRevenue(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000_000) return `${Math.round(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${Math.round(m * 10) / 10}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${Math.round(k)}K`;
  }
  return null;
}

export function mapEmployeeSize(min?: number | null, max?: number | null): string[] {
  const lo = min != null && Number.isFinite(min) ? min : null;
  const hi = max != null && Number.isFinite(max) ? max : null;
  if (lo == null && hi == null) return [];
  const ranges: Array<[string, number, number]> = [
    ["0–1", 0, 1],
    ["2–10", 2, 10],
    ["11–20", 11, 20],
    ["21–50", 21, 50],
    ["51–100", 51, 100],
    ["101–200", 101, 200],
    ["201–500", 201, 500],
    ["501–1000", 501, 1000],
    ["1001–2000", 1001, 2000],
    ["2001–5000", 2001, 5000],
    ["10000+", 5001, 1e9],
  ];
  return ranges
    .filter(([, a, b]) => (lo == null || b >= lo) && (hi == null || a <= hi))
    .map(([label]) => label)
    .filter((s) => (SIZE_BUCKETS as readonly string[]).includes(s));
}

export function mapIndustryCodes(codes: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    const digits = String(raw).replace(/\D/g, "");
    if (!digits) continue;
    const hit = INDUSTRY_MAP[digits.slice(0, 2)] ?? INDUSTRY_MAP[digits];
    if (hit && !seen.has(hit)) {
      seen.add(hit);
      out.push(hit);
    }
  }
  return out.slice(0, 6);
}

export function mapLocation(country?: string | null, municipality?: string | null): { location?: string[]; city?: string[] } {
  const c = String(country ?? "FI").trim().toUpperCase();
  const city = municipality?.trim();
  if (city) return { city: [city] };
  if (c === "FI" || c === "FIN" || /^suomi$/i.test(c)) return { location: ["finland"] };
  if (c === "SE") return { location: ["sweden"] };
  if (c === "NO") return { location: ["norway"] };
  if (c === "DK") return { location: ["denmark"] };
  return {};
}

export function mapRoles(roles: string[]): { titles: string[]; seniority: string[] } {
  const titles: string[] = [];
  const seniority: string[] = [];
  const seenT = new Set<string>();
  const seenS = new Set<string>();
  const addT = (t: string) => { if (!seenT.has(t)) { seenT.add(t); titles.push(t); } };
  const addS = (s: string) => { if ((SENIORITY as readonly string[]).includes(s) && !seenS.has(s)) { seenS.add(s); seniority.push(s); } };
  for (const raw of roles) {
    const r = String(raw).toLowerCase();
    if (/\b(ceo|toimitusjohtaja|managing director)\b/.test(r)) { addT("CEO"); addS("C-Level"); }
    else if (/\b(owner|omistaja|yrittäjä|founder)\b/.test(r)) { addT("Owner"); addS("Owner"); addS("Founder"); }
    else if (/\b(chair|chairman|puheenjohtaja)\b/.test(r)) { addT("Chairman"); addS("C-Level"); }
    else if (/\b(cfo|talousjohtaja)\b/.test(r)) { addT("CFO"); addS("C-Level"); }
    else if (/\b(cto|teknologiajohtaja)\b/.test(r)) { addT("CTO"); addS("C-Level"); }
    else if (/\b(cmo|markkinointijohtaja)\b/.test(r)) { addT("CMO"); addS("C-Level"); addS("Head"); }
    else if (/\b(sales[_\s.-]?director|myyntijohtaja)\b/.test(r)) { addT("Sales Director"); addS("Director"); }
    else if (/\b(hr|hr_director|henkilöstöjohtaja)\b/.test(r)) { addT("HR Director"); addS("Director"); addS("Head"); }
    else if (r.trim()) addT(String(raw).slice(0, 60));
  }
  return { titles: titles.slice(0, 6), seniority: seniority.slice(0, 4) };
}

function want(criteria: SearchCriteria | undefined, field: string): Array<string | number | boolean> {
  if (!criteria?.groups) return [];
  try { return valuesOf(criteria, field); } catch { return []; }
}

export function compileLeadsFinderInput(opts: {
  criteria?: SearchCriteria;
  target?: TargetSpec;
  maxResults?: number;
}): { input: LeadsFinderInput; omitted: string[] } {
  const omitted: string[] = [];
  const c = opts.criteria;
  const t = opts.target ?? c?.target;
  const input: LeadsFinderInput = {
    fetch_count: Math.max(1, Math.min(APIFY_MAX_RESULTS_PER_RUN, Math.floor(opts.maxResults ?? 15))),
  };
  const codes = [
    ...(t?.industry?.codes ?? []),
    ...want(c, "industry").map(String),
  ];
  const industries = mapIndustryCodes(codes);
  if (industries.length) input.company_industry = industries;
  else omitted.push("company_industry");

  const geo = mapLocation(c?.country, want(c, "municipality")[0] as string | undefined);
  if (geo.city) input.contact_city = geo.city;
  else if (geo.location) input.contact_location = geo.location;
  else omitted.push("contact_location");

  const roles = [
    ...(Array.isArray(c?.roles) ? c.roles : []),
    ...(t?.hiring?.roles ?? []),
  ].map(String);
  const mapped = mapRoles(roles);
  if (mapped.titles.length) input.contact_job_title = mapped.titles;
  else omitted.push("contact_job_title");
  if (mapped.seniority.length) input.seniority_level = mapped.seniority;
  else omitted.push("seniority_level");

  const minRev = t?.financial?.revenue?.min ?? Number(want(c, "revenue_min")[0] ?? NaN);
  const formatted = formatApifyRevenue(minRev);
  if (formatted) input.min_revenue = formatted;
  else omitted.push("min_revenue");

  const empMin = Number(want(c, "employee_min")[0] ?? NaN);
  const empMax = Number(want(c, "employee_max")[0] ?? NaN);
  const size = mapEmployeeSize(Number.isFinite(empMin) ? empMin : null, Number.isFinite(empMax) ? empMax : null);
  if (size.length) input.size = size;
  else omitted.push("size");

  const requireEmail = want(c, "require_email").some(Boolean) || Boolean(c?.requireEmail);
  if (requireEmail) input.email_status = ["validated"];
  else omitted.push("email_status");

  const kw = want(c, "keyword").map(String).filter((s) => s.length >= 3).slice(0, 3);
  if (kw.length) input.company_keywords = kw;

  return { input, omitted };
}

export function decideLeadsFinder(opts: {
  mode?: ApifyMode;
  configured?: boolean;
  discovered?: number;
  want?: number;
  emails?: number;
  phones?: number;
  decisionMakers?: number;
  requireEmail?: boolean;
  requireRole?: boolean;
  requireRevenue?: boolean;
  searchId?: string;
}): { use: boolean; reason: LeadsFinderDecision } {
  const mode = opts.mode ?? apifyMode();
  if (mode === "OFF") return { use: false, reason: "SKIPPED_MODE_OFF" };
  if (!opts.configured) return { use: false, reason: "SKIPPED_NOT_CONFIGURED" };
  pruneDaily();
  if (daily.length >= APIFY_DAILY_BUDGET) return { use: false, reason: "SKIPPED_COST_BUDGET" };
  if (opts.searchId && (perSearch.get(opts.searchId) ?? 0) >= APIFY_MAX_RUNS_PER_SEARCH) {
    return { use: false, reason: "SKIPPED_COST_BUDGET" };
  }
  const want = Math.max(1, opts.want ?? 30);
  const discovered = opts.discovered ?? 0;
  const emails = opts.emails ?? 0;
  if (discovered >= Math.min(want, 20) && emails >= Math.ceil(want * 0.6) && !opts.requireEmail && !opts.requireRole) {
    return { use: false, reason: "SKIPPED_ALREADY_HAVE_DATA" };
  }
  if (mode === "REQUIRED" && (opts.requireEmail || opts.requireRole || opts.requireRevenue)) {
    return { use: true, reason: discovered < want ? "USED_AS_DISCOVERY_SOURCE" : "USED_FOR_VALIDATED_CONTACT_GAP" };
  }
  const contactGap = discovered >= 8 && emails < Math.ceil(discovered * 0.35) && (opts.requireEmail || opts.requireRole);
  const discoveryGap = discovered < Math.min(8, want) && (opts.requireRevenue || opts.requireRole);
  if (contactGap) return { use: true, reason: "USED_FOR_VALIDATED_CONTACT_GAP" };
  if (discoveryGap) return { use: true, reason: "USED_AS_DISCOVERY_SOURCE" };
  return { use: false, reason: "SKIPPED_NOT_JUSTIFIED" };
}

function pruneDaily(now = Date.now()): void {
  while (daily.length && now - daily[0]! > 24 * 3_600_000) daily.shift();
}

export function noteLeadsFinderRun(searchId?: string): void {
  daily.push(Date.now());
  if (searchId) perSearch.set(searchId, (perSearch.get(searchId) ?? 0) + 1);
}

export function resetLeadsFinderBudgetForTests(): void {
  daily.length = 0;
  perSearch.clear();
}

export function leadsFinderSourceReport(decision: LeadsFinderDecision, extra?: Record<string, unknown>) {
  return {
    source: "apify_leads_finder",
    ok: decision.startsWith("USED"),
    code: decision,
    note: decision,
    ...extra,
  };
}

export async function runLeadsFinderBatch(opts: {
  input: LeadsFinderInput;
  searchId?: string;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string; items: ApifyNormalizedItem[]; error?: string }> {
  const tool = findApifyTool(APIFY_LEADS_FINDER_ID);
  if (!tool?.enabled) return { ok: true, skipped: true, reason: "tool_disabled", items: [] };
  noteLeadsFinderRun(opts.searchId);
  const ran = await runApprovedApifyTool({
    connectorId: APIFY_LEADS_FINDER_ID,
    input: { ...opts.input, fetch_count: Math.min(opts.input.fetch_count, APIFY_MAX_RESULTS_PER_RUN) },
  });
  if ("skipped" in ran && ran.skipped) return { ok: true, skipped: true, reason: ran.reason, items: [] };
  if (!ran.ok) return { ok: false, error: ran.error ?? "actor_failed", items: [] };
  return { ok: true, items: ran.data.items ?? [] };
}

void LEADS_FINDER_ACTOR;
void LEADS_FINDER_VERSION;
