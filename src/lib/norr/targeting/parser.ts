import { nid } from "../../utils.ts";
import type { Criterion, SearchCriteria } from "../types.ts";
import { emptyCriteria, setIndustryCodes, setMunicipality } from "../criteria.ts";
import { inferIndustryCodes, MUNICIPALITIES } from "../finland.ts";
import {
  mergeTargets,
  OPPORTUNITY_PRESETS,
  type OpportunityPresetId,
  type TargetSpec,
} from "./spec.ts";
import { diagnoseTargetQuery, type QueryDiagnostics } from "../query-diagnostics.ts";

type EuroParsed = { value: number; unit: "none" | "k" | "m" | "b" };

const UNIT_SCALE: Record<EuroParsed["unit"], number> = { none: 1, k: 1_000, m: 1_000_000, b: 1_000_000_000 };

function unitFromToken(raw: string | undefined): EuroParsed["unit"] {
  const t = (raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!t) return "none";
  if (/^(b|mrd|miljard)/.test(t)) return "b";
  if (/^(m|meur|m€|milj|million)/.test(t)) return "m";
  if (/^(k|tuhatta|thousand)/.test(t)) return "k";
  return "none";
}

function parseNumberToken(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseEuroAmount(raw: string, inherited?: EuroParsed["unit"]): EuroParsed | null {
  const m = String(raw).trim().match(
    /(?:€|eur(?:o)?s?\s*)?(\d+(?:[ \u00a0]?\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(k|tuhatta|thousand|mrd|miljard(?:ia)?|b|milj(?:\.|oonaa)?|million|meur|m€|m)?\s*(?:€|eur(?:o)?s?)?/i,
  );
  if (!m) return null;
  const n = parseNumberToken(m[1] ?? "");
  if (n == null) return null;
  const unit = unitFromToken(m[2]) !== "none" ? unitFromToken(m[2]) : inherited ?? "none";
  return { value: n, unit };
}

function toEuros(p: EuroParsed): number {
  return p.value * UNIT_SCALE[p.unit];
}

export function coalesceEuroPair(left: EuroParsed, right: EuroParsed): { min: number; max: number } {
  let a = left;
  let b = right;
  if (a.unit === "none" && b.unit !== "none") a = { ...a, unit: b.unit };
  if (b.unit === "none" && a.unit !== "none") b = { ...b, unit: a.unit };
  const min = toEuros(a);
  const max = toEuros(b);
  return min <= max ? { min, max } : { min: max, max: min };
}

const YEARISH = /(?:years?|vuotta|vuoden|v\.)\b/i;

export function findEuroRange(text: string): { min: number; max: number } | null {
  const lower = text.toLowerCase();
  const revenueCtx = /liikevaihto|turnover|revenue|omsättning/.test(lower);
  const range = text.match(
    /(?:€|eur(?:o)?s?\s*)?(\d+(?:[ \u00a0]?\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(k|tuhatta|mrd|miljard(?:ia)?|milj(?:\.|oonaa)?|million|meur|m€|m)?\s*(?:€|eur(?:o)?s?)?\s*(?:[-–—]|to|–)\s*(?:€|eur(?:o)?s?\s*)?(\d+(?:[ \u00a0]?\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(k|tuhatta|mrd|miljard(?:ia)?|milj(?:\.|oonaa)?|million|meur|m€|m)?\s*(?:€|eur(?:o)?s?)?/i,
  );
  if (!range) return null;
  const after = text.slice((range.index ?? 0) + range[0].length, (range.index ?? 0) + range[0].length + 18);
  if (YEARISH.test(after) || YEARISH.test(range[0])) return null;
  const left = parseEuroAmount(`${range[1]} ${range[2] ?? ""}`);
  const right = parseEuroAmount(`${range[3]} ${range[4] ?? ""}`);
  if (!left || !right) return null;
  const pair = coalesceEuroPair(left, right);
  const scaled = pair.max >= 100_000 || left.unit !== "none" || right.unit !== "none";
  if (!revenueCtx && !scaled) return null;
  if (pair.max < 1_000) return null;
  if (pair.max > 50_000_000_000) return null;
  return pair;
}

function addRule(c: SearchCriteria, field: Criterion["field"], op: Criterion["op"], value: string | number | boolean) {
  c.groups.rules.push({ id: nid(), field, op, value });
}

const MAJOR_CITIES = [
  "Helsinki", "Espoo", "Tampere", "Vantaa", "Oulu", "Turku", "Jyväskylä", "Kuopio", "Lahti", "Pori",
  "Kouvola", "Joensuu", "Lappeenranta", "Hämeenlinna", "Vaasa", "Rovaniemi", "Seinäjoki", "Mikkeli", "Kotka", "Salo",
];

export function interpretTargetPrompt(prompt: string, base?: SearchCriteria): {
  spec: TargetSpec;
  criteria: SearchCriteria;
  summary: string[];
  preset: OpportunityPresetId | null;
  diagnostics: QueryDiagnostics;
} {
  const text = String(prompt ?? "").trim();
  const criteria = base ? { ...base, groups: { ...base.groups, rules: [...base.groups.rules] }, target: { ...base.target } } : emptyCriteria();
  criteria.prompt = text;
  criteria.mode = criteria.mode ?? "ai";
  const spec: TargetSpec = { ...(criteria.target ?? {}) };
  const summary: string[] = [];
  let preset: OpportunityPresetId | null = (criteria.preset as OpportunityPresetId) ?? null;

  if (/suom(?:i|alais)|finland|\bfinnish\b|\bfi\b/i.test(text)) {
    criteria.country = "FI";
    const countryRule = criteria.groups.rules.find((r) => !("rules" in r) && r.field === "country");
    if (countryRule && !("rules" in countryRule)) countryRule.value = "FI";
    else addRule(criteria, "country", "eq", "FI");
    summary.push("Country: Finland");
  } else if (/\bsweden|\bsvensk|\bswedish\b/i.test(text)) {
    criteria.country = "SE";
    summary.push("Country: Sweden");
  } else if (/\bnorway|\bnorsk|\bnorwegian\b/i.test(text)) {
    criteria.country = "NO";
    summary.push("Country: Norway");
  } else if (/\bdenmark|\bdansk|\bdanish\b/i.test(text)) {
    criteria.country = "DK";
    summary.push("Country: Denmark");
  }

  const cityHit = MAJOR_CITIES.find((city) => new RegExp(`\\b${city}\\b`, "i").test(text))
    ?? MUNICIPALITIES.find((m) => m.name.length >= 5 && new RegExp(`\\b${m.name}\\b`, "i").test(text))?.name;
  if (cityHit) {
    const next = setMunicipality(criteria, cityHit);
    criteria.groups = next.groups;
    summary.push(`Location: ${cityHit}`);
  }

  const euro = findEuroRange(text);
  if (euro) {
    const allowUnknown = /if (?:published|known)|jos julkaistu|when published/i.test(text);
    spec.financial = {
      ...spec.financial,
      revenue: { min: euro.min, max: euro.max, unknown: allowUnknown ? "allow" : "exclude" },
    };
    addRule(criteria, "revenue_min", "gte", euro.min);
    addRule(criteria, "revenue_max", "lte", euro.max);
    summary.push(
      allowUnknown
        ? `Published revenue €${Math.round(euro.min / 1_000_000)}M to €${Math.round(euro.max / 1_000_000)}M when a source actually published it`
        : `Revenue €${Math.round(euro.min / 1_000_000)}M to €${Math.round(euro.max / 1_000_000)}M (companies without published financials are excluded)`,
    );
  }

  if (/unprofitab|tappiollin|negative (?:operating )?profit|negatiivinen (?:liike)?tulos/i.test(text)) {
    spec.financial = { ...spec.financial, profitable: false };
    summary.push("Looking for a published negative result. Missing accounts stay unknown.");
  } else if (/profitab|voitollin|positive (?:operating )?profit|positiivinen (?:liike)?tulos/i.test(text)) {
    spec.financial = { ...spec.financial, profitable: true };
    summary.push("Profitable when a published result exists. Unknown accounts are not failed.");
  }

  const margin = text.match(/operating margin[^\d%]{0,12}(\d{1,2})\s*%/i);
  if (margin) {
    spec.financial = { ...spec.financial, operatingMargin: { min: Number(margin[1]) / 100, unknown: "allow" } };
    summary.push(`Operating margin at least ${margin[1]}% when published`);
  }
  const equity = text.match(/equity ratio[^\d%]{0,12}(\d{1,2})\s*%/i) ?? text.match(/omavaraisuus(?:aste)?[^\d%]{0,12}(\d{1,2})\s*%/i);
  if (equity) {
    const allowUnknown = /if (?:published|known)|jos julkaistu|when published/i.test(text);
    spec.financial = { ...spec.financial, equityRatio: { min: Number(equity[1]) / 100, unknown: allowUnknown ? "allow" : "exclude" } };
    summary.push(`Equity ratio at least ${equity[1]}%${allowUnknown ? " when published" : " (unpublished excluded)"}`);
  }

  const ageMore = text.match(/(?:more than|over|yli|founded more than)\s+(\d{1,2})\s+years?/i)
    ?? text.match(/(\d{1,2})\+?\s+years?\s+ago/i);
  if (ageMore) {
    const n = Number(ageMore[1]);
    spec.company = { ...spec.company, ageYears: { min: n, unknown: "allow" } };
    summary.push(`Company age at least ${n} years when registration date is known`);
  }

  const sellsWebsite = /i sell (?:premium )?websites?|sell a (?:€|eur)?[\d.,\s]+ website|website project|kotisivuprojekti|myyn (?:premium)?\s*verkkosiv/i.test(text);
  const websiteRenewal = /website renewal|sivustouudist|uusi(?:a)? (?:koti)?sivust|need for a website|verkkosivujen uudist/i.test(text);
  if (sellsWebsite || websiteRenewal) {
    preset = "website_sales";
    criteria.preset = "website_sales";
    criteria.mode = "opportunity";
    criteria.depth = "deep";
    Object.assign(spec, mergeTargets(OPPORTUNITY_PRESETS.website_sales.target, spec));
    summary.push("Opportunity: website development. Weak public sites ranked first. Unpublished revenue is allowed.");
  }

  if (/outdated websites?|weak websites?|vanhentun(?:ut|eet)? (?:koti)?siv|heikko(?:ja)? (?:koti)?sivust|huono(?:t)? verkkosiv/i.test(text)) {
    spec.website = {
      ...spec.website,
      qualityScore: { max: 48, unknown: "allow" },
      highOpportunity: true,
    };
    addRule(criteria, "website_weak", "eq", true);
    summary.push("Weak or outdated public website (measured from crawled HTML, not guessed traffic)");
  }

  if (/weak[- ]?seo|ohut (?:meta|seo)|thin metadata/i.test(text)) {
    spec.website = { ...spec.website, seoScore: { max: 45, unknown: "allow" } };
    summary.push("Weak SEO metadata on the public site");
  }

  if (/no (?:obvious )?chatbot|ilman chatbot|ei chatbot/i.test(text)) {
    spec.tech = { ...spec.tech, hasChat: false };
    summary.push("No public chatbot");
  }

  if (/wordpress|drupal|joomla|wix\b|squarespace/i.test(text)) {
    const cms = (text.match(/wordpress|drupal|joomla|wix|squarespace/gi) ?? []).map((s) => s.toLowerCase());
    spec.tech = { ...spec.tech, cms: [...new Set(cms)] };
    summary.push(`CMS mentioned: ${spec.tech.cms?.join(", ")}`);
  }

  if (/e-?commerce|verkkokaup|online shop/i.test(text)) {
    spec.tech = { ...spec.tech, hasEcommerce: true };
    addRule(criteria, "ecommerce", "eq", true);
    summary.push("Ecommerce markers on the public site");
  }

  if (/hiring|recruitment|rekrytointi|open roles|we(?:'| a)?re hiring|recent hiring|työpaikkailmoit|avoimet työpaikat/i.test(text)) {
    spec.hiring = { ...spec.hiring, active: true };
    addRule(criteria, "hiring", "eq", true);
    summary.push("Hiring: prefer confirmed public job listings over website language");
  }

  const employeeRange = text.match(/(?:työntekij(?:ää|än|iä)?|employees?|henkilöstö(?:ä|n)?|henkeä)\s*(?:noin|about)?\s*(\d{1,4})\s*[-–to]+\s*(\d{1,4})|(\d{1,4})\s*[-–to]+\s*(\d{1,4})\s*(?:työntekij|employee|henkilöst|henkeä)/i);
  if (employeeRange) {
    const min = Number(employeeRange[1] ?? employeeRange[3]);
    const max = Number(employeeRange[2] ?? employeeRange[4]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min && max <= 100000) {
      addRule(criteria, "employee_min", "gte", min);
      addRule(criteria, "employee_max", "lte", max);
      summary.push(`Headcount ${min}–${max} was requested but is not published in YTJ, so it is not used as a hard filter.`);
    }
  }

  if (/meta (?:advertising|ads|pixel)|facebook pixel|google ads? tag/i.test(text)) {
    spec.advertising = { ...spec.advertising, meta: "ACTIVE_OR_RECENT" };
    summary.push("Meta advertising tags on the public site (not claimed spend)");
  }

  if (/no large internal marketing team|ilman (?:omaa )?markkinointitiimi|no (?:in-?house )?marketing team/i.test(text)) {
    summary.push("Internal marketing-team size is not published. Kept as unavailable, not used as a hard filter.");
  }

  let industries = inferIndustryCodes(text);
  if (/no large internal marketing team|ilman (?:omaa )?markkinointitiimi|no (?:in-?house )?marketing team/i.test(text)
    && !/mainostoimist|advertising agenc|ad agency|digital agency|digitoimist|market research/i.test(text)) {
    industries = industries.filter((c) => c !== "73");
  }
  if (industries.length) {
    spec.industry = { ...spec.industry, codes: industries };
    const next = setIndustryCodes(criteria, industries);
    criteria.groups = next.groups;
    criteria.target = next.target;
    summary.push(`Industry codes ${industries.join(", ")}`);
  }

  if (preset && OPPORTUNITY_PRESETS[preset]) {
    spec.website = { ...OPPORTUNITY_PRESETS[preset].target.website, ...spec.website };
    spec.financial = { ...OPPORTUNITY_PRESETS[preset].target.financial, ...spec.financial };
    spec.company = { ...OPPORTUNITY_PRESETS[preset].target.company, ...spec.company };
  }

  criteria.target = mergeTargets(criteria.target ?? {}, spec);
  criteria.depth = criteria.depth ?? (preset ? "deep" : "normal");
  if (!summary.length) summary.push("No structured filters extracted. Describe industry, city or a published figure.");
  const diagnostics = diagnoseTargetQuery(text, criteria.target ?? spec, summary);
  if (diagnostics.unsupported.length) summary.push(...diagnostics.unsupported);
  return { spec: criteria.target ?? spec, criteria, summary, preset, diagnostics };
}

export function applyPresetToCriteria(c: SearchCriteria, preset: OpportunityPresetId): SearchCriteria {
  const def = OPPORTUNITY_PRESETS[preset];
  if (!def) return c;
  return {
    ...c,
    mode: "opportunity",
    preset,
    depth: def.depth ?? c.depth ?? "normal",
    target: mergeTargets(c.target ?? {}, def.target),
  };
}
