/**
 * Explicit response DTOs. The client never receives raw source JSON, adapter
 * ids, scoring weights, or internal hostnames.
 */
import type { Json, JsonMap } from "./types.ts";
import { provenanceLabel, sanitizeJob, sanitizeObservation, sanitizeScoreRow, stripSecrets } from "./security.ts";
import { isoTime } from "../format.ts";

export type CompanyListRow = {
  id: string;
  name: string;
  business_id: string | null;
  municipality: string | null;
  industry_label: string | null;
  website: string | null;
  overall_confidence: number | null;
  record_status: string;
  general_email: string | null;
  general_email_class: string | null;
  phone: string | null;
  last_verified_at: string | null;
  country: string;
  decision_maker: string | null;
  decision_title: string | null;
  website_score: number | null;
  seo_score: number | null;
  digital_maturity: number | null;
  commercial_opportunity: number | null;
  match_score: number | null;
  company_age_years: number | null;
  revenue: string | null;
  meta_ads: string | null;
};

const COMPANY_FIELDS = [
  "id",
  "name",
  "business_id",
  "vat_id",
  "lei",
  "legal_form",
  "registration_date",
  "business_status",
  "industry_code",
  "industry_label",
  "street",
  "postal_code",
  "municipality",
  "website",
  "general_email",
  "general_email_class",
  "phone",
  "employee_count",
  "revenue",
  "profit",
  "previous_revenue",
  "equity",
  "assets",
  "liabilities",
  "equity_ratio",
  "financial_period",
  "financial_source",
  "financial_conflict",
  "description",
  "record_status",
  "country",
  "match_score",
  "overall_confidence",
  "website_score",
  "seo_score",
  "digital_maturity",
  "commercial_opportunity",
  "company_age_years",
  "last_verified_at",
  "decision_maker",
  "decision_title",
  "meta_ads",
  "is_new",
  "parent_name",
  "parent_business_id",
  "group_role",
  "phone_class",
  "call_brief",
  "activity_outcome",
  "assigned_owner",
  "last_activity_at",
] as const;

function asJson(value: unknown): Json {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  const iso = isoTime(value);
  if (iso) return iso;
  if (Array.isArray(value)) return value.map(asJson);
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return null;
    const out: JsonMap = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = asJson(v);
    return out;
  }
  return null;
}

function pick(row: Record<string, unknown>, keys: readonly string[]): JsonMap {
  const out: JsonMap = {};
  for (const k of keys) {
    if (k in row) out[k] = asJson(row[k]);
  }
  return out;
}

function sanitizeWebsite(raw: Record<string, unknown>): JsonMap {
  return {
    score: asJson(raw.score),
    band: asJson(raw.band),
    opportunityScore: asJson(raw.opportunityScore),
    seoScore: asJson(raw.seoScore),
    digitalMaturity: asJson(raw.digitalMaturity),
    digitalBand: asJson(raw.digitalBand),
    https: asJson(raw.https),
    hasTitle: Boolean(raw.hasTitle),
    hasMetaDescription: Boolean(raw.hasMetaDescription),
    ecommerce: Boolean(raw.ecommerce),
    likelyWeak: Boolean(raw.likelyWeak),
    cms: Array.isArray(raw.cms) ? raw.cms.slice(0, 8).map(String) : [],
    frameworks: Array.isArray(raw.frameworks) ? raw.frameworks.slice(0, 8).map(String) : [],
    pixels: Array.isArray(raw.pixels) ? raw.pixels.slice(0, 8).map(String) : [],
    adPlatforms: raw.adPlatforms && typeof raw.adPlatforms === "object" ? asJson(raw.adPlatforms) : {},
    adActivityScore: asJson(raw.adActivityScore),
    trafficScore: asJson(raw.trafficScore),
    trafficBand: asJson(raw.trafficBand),
    socialScore: asJson(raw.socialScore),
    notes: Array.isArray(raw.notes) ? raw.notes.slice(0, 8).map((n) => String(n).slice(0, 180)) : [],
  };
}

export function sanitizeIntel(raw: unknown): JsonMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const match = (o.match && typeof o.match === "object" ? o.match : {}) as Record<string, unknown>;
  const scores = (o.scores && typeof o.scores === "object" ? o.scores : {}) as Record<string, unknown>;
  const website = o.website && typeof o.website === "object" && !Array.isArray(o.website)
    ? sanitizeWebsite(o.website as Record<string, unknown>)
    : null;
  return {
    companyAgeYears: asJson(o.companyAgeYears),
    revenue: asJson(o.revenue),
    profit: asJson(o.profit),
    profitable: asJson(o.profitable),
    equityRatio: asJson(o.equityRatio),
    employeeCount: asJson(o.employeeCount),
    industryCode: asJson(o.industryCode),
    industryLabel: asJson(o.industryLabel),
    specializations: Array.isArray(o.specializations) ? o.specializations.slice(0, 12).map(String) : [],
    website,
    hiring: o.hiring && typeof o.hiring === "object" ? {
      active: Boolean((o.hiring as { active?: unknown }).active),
      evidence: Array.isArray((o.hiring as { evidence?: unknown }).evidence) ? (o.hiring as { evidence: unknown[] }).evidence.slice(0, 6).map(String) : [],
    } : null,
    growth: o.growth && typeof o.growth === "object" ? asJson(o.growth) : null,
    scores: {
      commercialOpportunity: asJson(scores.commercialOpportunity),
      digitalOpportunity: asJson(scores.digitalOpportunity),
      marketingWaste: asJson(scores.marketingWaste),
      modernizationNeed: asJson(scores.modernizationNeed),
      purchaseCapacity: asJson(scores.purchaseCapacity),
      growthReadiness: asJson(scores.growthReadiness),
    },
    match: {
      score: asJson(match.score),
      matched: Array.isArray(match.matched) ? match.matched.slice(0, 16).map(String) : [],
      missed: Array.isArray(match.missed) ? match.missed.slice(0, 16).map(String) : [],
      unknown: Array.isArray(match.unknown) ? match.unknown.slice(0, 16).map(String) : [],
      why: Array.isArray(match.why) ? match.why.slice(0, 16).map(String) : [],
    },
    revenueSource: o.revenueSource ? provenanceLabel(String(o.revenueSource)) : null,
  };
}

export function sanitizeCompany(row: Record<string, unknown>): JsonMap {
  const out = pick(row, COMPANY_FIELDS);
  if ("intel" in row) out.intel = sanitizeIntel(row.intel);
  if (typeof out.description === "string") out.description = out.description.slice(0, 2000);
  return out;
}

export function sanitizePerson(row: Record<string, unknown>): JsonMap {
  return {
    id: asJson(row.id),
    full_name: asJson(row.full_name),
    title: asJson(row.title),
    seniority: asJson(row.seniority),
    company_id: asJson(row.company_id),
    company_name: asJson(row.company_name),
    work_email: asJson(row.work_email),
    work_email_class: asJson(row.work_email_class),
    work_phone: asJson(row.work_phone),
    confidence: asJson(row.confidence),
    source_page: typeof row.source_page === "string" && /^https?:/i.test(row.source_page) ? row.source_page : null,
  };
}

export function sanitizeContact(row: Record<string, unknown>): JsonMap {
  return {
    id: asJson(row.id),
    kind: asJson(row.kind),
    value: asJson(row.value),
    classification: asJson(row.classification),
    company_id: asJson(row.company_id),
    person_id: asJson(row.person_id),
    phone_role: asJson(row.phone_role ?? null),
    evidence: asJson(row.evidence ?? null),
  };
}

export function sanitizeSignal(row: Record<string, unknown>): JsonMap {
  return {
    id: asJson(row.id),
    kind: asJson(row.kind ?? row.type),
    title: asJson(row.title ?? row.kind ?? "Signal"),
    evidence: stripSecrets(typeof row.evidence === "string" ? row.evidence : typeof row.summary === "string" ? row.summary : null),
    observed_at: asJson(row.observed_at ?? row.created_at),
    source: provenanceLabel(String(row.source_id ?? row.source ?? "")),
    source_url: typeof row.source_url === "string" && /^https?:/i.test(row.source_url) ? row.source_url : null,
  };
}

export function sanitizeCrawlPage(row: Record<string, unknown>): JsonMap {
  return {
    id: asJson(row.id),
    url: typeof row.url === "string" ? row.url : null,
    final_url: typeof row.final_url === "string" ? row.final_url : null,
    status_code: asJson(row.status_code),
    language: asJson(row.language),
    excerpt: typeof row.excerpt === "string" ? row.excerpt.slice(0, 800) : null,
    robots_allowed: asJson(row.robots_allowed),
    fetched_at: asJson(row.fetched_at),
    error: stripSecrets(typeof row.error === "string" ? row.error : null),
  };
}

export function sanitizeRun(row: Record<string, unknown>, sourceReport: Json): JsonMap {
  return {
    id: asJson(row.id),
    status: asJson(row.status),
    criteria: asJson(row.criteria ?? {}),
    stats: asJson(row.stats ?? {}),
    source_report: sourceReport,
    error: stripSecrets(typeof row.error === "string" ? row.error : null),
    created_at: asJson(row.created_at),
    started_at: asJson(row.started_at),
    finished_at: asJson(row.finished_at),
    pause_requested: Boolean(row.pause_requested),
    cancel_requested: Boolean(row.cancel_requested),
  };
}

export function sanitizeRunList(row: Record<string, unknown>): JsonMap {
  return {
    id: asJson(row.id),
    status: asJson(row.status),
    created_at: asJson(row.created_at),
    finished_at: asJson(row.finished_at),
    stats: asJson(row.stats ?? {}),
    name: asJson(row.name ?? null),
    query_fingerprint: asJson(row.query_fingerprint ?? null),
    ranking_version: asJson(row.ranking_version ?? null),
    new_leads_count: asJson(row.new_leads_count ?? null),
    previously_seen_count: asJson(row.previously_seen_count ?? null),
    excluded_count: asJson(row.excluded_count ?? null),
    search_exhaustion_score: asJson(row.search_exhaustion_score ?? null),
  };
}

export function sanitizeAudit(row: Record<string, unknown>): JsonMap {
  return {
    id: asJson(row.id),
    action: asJson(row.action),
    entity_type: asJson(row.entity_type),
    entity_id: asJson(row.entity_id),
    created_at: asJson(row.created_at),
  };
}

/** Test helper: never let Date / {} leak into JSON DTOs. */
export function jsonSafe(value: unknown): Json {
  return asJson(value);
}

export function sanitizeNote(row: Record<string, unknown>): JsonMap {
  return {
    id: asJson(row.id),
    body: typeof row.body === "string" ? row.body.slice(0, 4000) : "",
    created_at: asJson(row.created_at),
    entity_id: asJson(row.entity_id),
    entity_type: asJson(row.entity_type),
  };
}

export { sanitizeJob, sanitizeObservation, sanitizeScoreRow };
