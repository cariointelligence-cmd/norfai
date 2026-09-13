import { valuesOf } from "./criteria.ts";
import type { SearchCriteria } from "./types.ts";
import type { TargetSpec } from "./targeting/spec.ts";

export type SourceNeed = "required" | "optional" | "skip";

export type SourcePlan = {
  xbrl: SourceNeed;
  esef: SourceNeed;
  hiringBoards: SourceNeed;
  procurement: SourceNeed;
  hunter: SourceNeed;
  apify: SourceNeed;
  reasons: string[];
  unsupported: string[];
};

function wantsRevenue(target?: TargetSpec, criteria?: SearchCriteria): boolean {
  const fin = target?.financial?.revenue;
  if (fin && (fin.min != null || fin.max != null)) return true;
  if (!criteria) return false;
  return valuesOf(criteria, "revenue_min").length > 0 || valuesOf(criteria, "revenue_max").length > 0;
}

function wantsHiring(target?: TargetSpec, criteria?: SearchCriteria): boolean {
  if (target?.hiring?.active) return true;
  if (!criteria) return false;
  return valuesOf(criteria, "hiring").some(Boolean);
}

function wantsProcurement(criteria?: SearchCriteria): boolean {
  if (!criteria) return false;
  return valuesOf(criteria, "procurement").some(Boolean);
}

export function planSources(opts: {
  country?: string | null;
  businessId?: string | null;
  lei?: string | null;
  hasOfficialRevenue?: boolean;
  hasWebsite?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  target?: TargetSpec;
  depth?: "normal" | "deep";
  criteria?: SearchCriteria;
}): SourcePlan {
  const reasons: string[] = [];
  const unsupported: string[] = [];
  const fi = (opts.country ?? "FI").toUpperCase() === "FI";
  const bid = Boolean(opts.businessId);
  const deep = opts.depth === "deep";
  const financial = wantsRevenue(opts.target, opts.criteria);
  const hiring = wantsHiring(opts.target, opts.criteria);
  const procurement = wantsProcurement(opts.criteria);

  if (opts.target?.traffic?.band?.length || opts.target?.traffic?.score) {
    unsupported.push("Website traffic is not measured. That criterion was not evaluated.");
  }

  let xbrl: SourceNeed = "skip";
  if (fi && bid && !opts.hasOfficialRevenue) {
    xbrl = financial ? "required" : "optional";
    reasons.push(financial ? "PRH XBRL required for the revenue filter" : "PRH XBRL optional to fill missing official financials");
  } else if (financial && !bid) {
    reasons.push("Revenue was requested but no Finnish business ID is available for PRH XBRL");
  }

  let esef: SourceNeed = "skip";
  if (opts.lei && !opts.hasOfficialRevenue) {
    esef = financial ? "required" : "optional";
    reasons.push(financial ? "ESEF filing required when a LEI exists and revenue was requested" : "ESEF filing optional for listed-company financials via LEI");
  }

  let hiringBoards: SourceNeed = "skip";
  if (hiring) {
    hiringBoards = "required";
    reasons.push("Job-board search required because hiring was requested");
  } else if (deep) {
    hiringBoards = "optional";
    reasons.push("Job-board search optional on deep search");
  }

  let procurementNeed: SourceNeed = "skip";
  if (procurement) {
    procurementNeed = "required";
    reasons.push("TED/Hilma required because procurement was requested");
  } else if (deep) {
    procurementNeed = "optional";
    reasons.push("TED/Hilma optional on deep search");
  }

  const hunter: SourceNeed = !opts.hasEmail && opts.hasWebsite ? "optional" : "skip";
  const apify: SourceNeed = (!opts.hasWebsite || !opts.hasEmail || !opts.hasPhone) ? "optional" : "skip";

  return {
    xbrl,
    esef,
    hiringBoards,
    procurement: procurementNeed,
    hunter,
    apify,
    reasons,
    unsupported,
  };
}

export function shouldRun(need: SourceNeed): boolean {
  return need === "required" || need === "optional";
}
