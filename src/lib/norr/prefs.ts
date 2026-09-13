import type { Locale } from "@/lib/i18n";

export type LeadPrefs = {
  locale: Locale;
  requireWebsite: boolean;
  requireEmail: boolean;
  requireDecisionMaker: boolean;
  preferPublishedRevenue: boolean;
  minConfidence: number;
  minRevenue: number | null;
  websiteWeakOk: boolean;
  prioritizeNew: boolean;
};

export const DEFAULT_LEAD_PREFS: LeadPrefs = {
  locale: "fi",
  requireWebsite: false,
  requireEmail: false,
  requireDecisionMaker: false,
  preferPublishedRevenue: false,
  minConfidence: 0,
  minRevenue: null,
  websiteWeakOk: true,
  prioritizeNew: true,
};

export function parseLeadPrefs(raw: unknown): LeadPrefs {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const locale = o.locale === "en" || o.locale === "sv" || o.locale === "fi" ? o.locale : DEFAULT_LEAD_PREFS.locale;
  const minConfidence = typeof o.minConfidence === "number" && Number.isFinite(o.minConfidence)
    ? Math.max(0, Math.min(100, Math.floor(o.minConfidence)))
    : 0;
  const minRevenue = typeof o.minRevenue === "number" && Number.isFinite(o.minRevenue) && o.minRevenue > 0
    ? o.minRevenue
    : null;
  return {
    locale,
    requireWebsite: Boolean(o.requireWebsite),
    requireEmail: Boolean(o.requireEmail),
    requireDecisionMaker: Boolean(o.requireDecisionMaker),
    preferPublishedRevenue: Boolean(o.preferPublishedRevenue),
    minConfidence,
    minRevenue,
    websiteWeakOk: o.websiteWeakOk !== false,
    prioritizeNew: o.prioritizeNew !== false,
  };
}

export type ListRules = {
  industry: string;
  municipality: string;
  country: string;
  requireWebsite: boolean;
  requireEmail: boolean;
  requirePhone: boolean;
  requireDecisionMaker: boolean;
  minRevenue: number | null;
  minMatchScore: number | null;
  matchedOnly: boolean;
};

export const EMPTY_LIST_RULES: ListRules = {
  industry: "",
  municipality: "",
  country: "",
  requireWebsite: false,
  requireEmail: false,
  requirePhone: false,
  requireDecisionMaker: false,
  minRevenue: null,
  minMatchScore: null,
  matchedOnly: true,
};

export function parseListRules(raw: unknown): ListRules {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const minRevenue = typeof o.minRevenue === "number" && Number.isFinite(o.minRevenue) && o.minRevenue > 0
    ? o.minRevenue
    : null;
  const minMatchScore = typeof o.minMatchScore === "number" && Number.isFinite(o.minMatchScore) && o.minMatchScore > 0
    ? Math.min(100, o.minMatchScore)
    : null;
  return {
    industry: typeof o.industry === "string" ? o.industry.slice(0, 40) : "",
    municipality: typeof o.municipality === "string" ? o.municipality.slice(0, 80) : "",
    country: typeof o.country === "string" ? o.country.slice(0, 8).toUpperCase() : "",
    requireWebsite: Boolean(o.requireWebsite),
    requireEmail: Boolean(o.requireEmail),
    requirePhone: Boolean(o.requirePhone),
    requireDecisionMaker: Boolean(o.requireDecisionMaker),
    minRevenue,
    minMatchScore,
    matchedOnly: o.matchedOnly !== false,
  };
}

export function listRulesSummary(rules: ListRules, locale: "fi" | "en" | "sv" = "en"): string {
  const none = locale === "fi" ? "Ei lisäsääntöjä" : locale === "sv" ? "Inga extra regler" : "No extra rules";
  const bits: string[] = [];
  if (rules.industry) bits.push(locale === "fi" ? `toimiala ${rules.industry}` : locale === "sv" ? `bransch ${rules.industry}` : `industry ${rules.industry}`);
  if (rules.municipality) bits.push(rules.municipality);
  if (rules.country) bits.push(rules.country);
  if (rules.requireWebsite) bits.push(locale === "fi" ? "verkkosivu vaaditaan" : locale === "sv" ? "webbplats krävs" : "website required");
  if (rules.requireEmail) bits.push(locale === "fi" ? "sähköposti vaaditaan" : locale === "sv" ? "e-post krävs" : "email required");
  if (rules.requirePhone) bits.push(locale === "fi" ? "puhelin vaaditaan" : locale === "sv" ? "telefon krävs" : "phone required");
  if (rules.requireDecisionMaker) bits.push(locale === "fi" ? "päättäjä vaaditaan" : locale === "sv" ? "beslutsfattare krävs" : "decision-maker required");
  if (rules.minRevenue) bits.push(locale === "fi" ? `liikevaihto ≥ ${rules.minRevenue}` : locale === "sv" ? `omsättning ≥ ${rules.minRevenue}` : `revenue ≥ ${rules.minRevenue}`);
  if (rules.minMatchScore) bits.push(locale === "fi" ? `osuma ≥ ${rules.minMatchScore}` : locale === "sv" ? `träff ≥ ${rules.minMatchScore}` : `match ≥ ${rules.minMatchScore}`);
  if (rules.matchedOnly) bits.push(locale === "fi" ? "vain osumat" : locale === "sv" ? "endast träffar" : "matched only");
  return bits.join(" · ") || none;
}
