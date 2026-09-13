/**
 * filings.xbrl.org ESEF filings. Official structured reports for listed companies,
 * keyed by LEI. Never a replacement for YTJ identity. Never invent facts.
 */
import type { AdapterResult, ObservationInput } from "../types.ts";
import { getJson } from "../http.ts";
import { normalizeLei } from "../identity.ts";
import { cacheKey, readCache, writeCache } from "../cache-policy.ts";
import { deriveEquityRatio } from "../financials.ts";
import { reliability } from "./catalog.ts";

const BASE = "https://filings.xbrl.org";

export type EsefFactSet = {
  revenue: number | null;
  previousRevenue: number | null;
  profit: number | null;
  previousProfit: number | null;
  equity: number | null;
  assets: number | null;
  liabilities: number | null;
  equityRatio: number | null;
  year: string | null;
  previousYear: string | null;
  currency: string;
  periodEnd: string | null;
  conceptRevenue: string | null;
};

const REV_CONCEPTS = [
  "ifrs-full:Revenue",
  "ifrs-full:RevenueFromContractsWithCustomers",
  "ifrs-full:RevenueFromSaleOfGoods",
];
const REV_FALLBACK = ["ifrs-full:RentalIncomeFromInvestmentProperty"];
const PROFIT_CONCEPTS = [
  "ifrs-full:ProfitLossFromOperatingActivities",
  "ifrs-full:ProfitLossBeforeTax",
  "ifrs-full:ProfitLoss",
];

type EsefFact = {
  value?: string | number;
  decimals?: number;
  dimensions?: { concept?: string; period?: string; unit?: string; entity?: string };
};

function localConcept(concept: string): string {
  return concept.includes(":") ? concept.slice(concept.indexOf(":") + 1) : concept;
}

function isNarrative(concept: string): boolean {
  return /disclosure|description|accountingpolicy|explanatory/i.test(concept);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function periodEndYear(period: string | null | undefined): { year: string | null; end: string | null } {
  if (!period) return { year: null, end: null };
  const parts = period.split("/");
  const endRaw = (parts[1] ?? parts[0] ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
    const y = period.match(/(20\d{2})/g);
    return { year: y?.at(-1) ?? null, end: null };
  }
  const end = new Date(endRaw + "T00:00:00Z");
  if (endRaw.endsWith("-01-01")) end.setUTCDate(0);
  return { year: String(end.getUTCFullYear()), end: endRaw };
}

export function parseEsefFacts(raw: unknown, filingPeriodEnd?: string | null): EsefFactSet {
  const empty: EsefFactSet = {
    revenue: null,
    previousRevenue: null,
    profit: null,
    previousProfit: null,
    equity: null,
    assets: null,
    liabilities: null,
    equityRatio: null,
    year: filingPeriodEnd ? filingPeriodEnd.slice(0, 4) : null,
    previousYear: null,
    currency: "EUR",
    periodEnd: filingPeriodEnd ?? null,
    conceptRevenue: null,
  };
  if (!raw || typeof raw !== "object") return empty;
  const facts = (raw as { facts?: Record<string, EsefFact> }).facts;
  if (!facts || typeof facts !== "object") return empty;

  type Hit = { concept: string; value: number; year: string | null; unit: string; instant: boolean };
  const hits: Hit[] = [];
  for (const rec of Object.values(facts)) {
    const concept = rec?.dimensions?.concept ?? "";
    if (!concept || isNarrative(concept)) continue;
    const value = num(rec.value);
    if (value == null) continue;
    const { year } = periodEndYear(rec.dimensions?.period);
    const unit = rec.dimensions?.unit ?? "";
    const instant = Boolean(rec.dimensions?.period && !rec.dimensions.period.includes("/"));
    hits.push({ concept, value, year, unit, instant });
  }

  const pick = (concepts: string[], year: string | null, instant?: boolean): Hit | null => {
    const pool = hits.filter((h) => concepts.includes(h.concept) && (year == null || h.year === year) && (instant == null || h.instant === instant));
    pool.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return pool[0] ?? null;
  };

  const years = [...new Set(hits.map((h) => h.year).filter((y): y is string => Boolean(y)))].sort((a, b) => b.localeCompare(a));
  const latestYear = empty.year && years.includes(empty.year) ? empty.year : years[0] ?? null;
  const prevYear = years.find((y) => y !== latestYear) ?? null;

  let rev = pick(REV_CONCEPTS, latestYear, false) ?? pick(REV_CONCEPTS, latestYear);
  if (!rev) rev = pick(REV_FALLBACK, latestYear, false) ?? pick(REV_FALLBACK, latestYear);
  const prevRev = rev ? pick([rev.concept], prevYear) : null;
  const profit = pick(PROFIT_CONCEPTS, latestYear, false) ?? pick(PROFIT_CONCEPTS, latestYear);
  const prevProfit = profit ? pick([profit.concept], prevYear) : null;
  const assets = pick(["ifrs-full:Assets"], latestYear, true) ?? pick(["ifrs-full:Assets"], latestYear);
  const equity = pick(["ifrs-full:Equity"], latestYear, true) ?? pick(["ifrs-full:Equity"], latestYear);
  const liab = pick(["ifrs-full:Liabilities"], latestYear, true);

  const currency = (rev?.unit || profit?.unit || "iso4217:EUR").replace(/^iso4217:/i, "") || "EUR";
  const revenue = rev && Math.abs(rev.value) >= 1000 && Math.abs(rev.value) <= 5e11 ? rev.value : null;
  const previousRevenue = prevRev && Math.abs(prevRev.value) >= 1000 ? prevRev.value : null;

  return {
    ...empty,
    revenue,
    previousRevenue,
    profit: profit?.value ?? null,
    previousProfit: prevProfit?.value ?? null,
    equity: equity?.value ?? null,
    assets: assets?.value ?? null,
    liabilities: liab?.value ?? null,
    equityRatio: deriveEquityRatio(equity?.value ?? null, assets?.value ?? null),
    year: latestYear,
    previousYear: prevYear,
    currency,
    conceptRevenue: rev?.concept ?? null,
  };
}

export async function esefLookup(lei: string): Promise<AdapterResult<EsefFactSet & { status: "VERIFIED" | "UNAVAILABLE"; emptyReason?: string }>> {
  const id = normalizeLei(lei);
  if (!id) return { ok: false, error: "No LEI" };
  const key = cacheKey("financial_period", ["esef", id]);
  const cached = readCache<AdapterResult<EsefFactSet & { status: "VERIFIED" | "UNAVAILABLE"; emptyReason?: string }>>(key);
  if (cached && !cached.failed) return cached.value;

  const listUrl = `${BASE}/api/filings?filter%5Bentity.identifier%5D=${encodeURIComponent(id)}&page%5Bsize%5D=1&sort=-period_end`;
  const list = await getJson<{ data?: Array<{ attributes?: { json_url?: string | null; period_end?: string; country?: string } }> }>(
    listUrl,
    { headers: { Accept: "application/vnd.api+json" }, timeoutMs: 12000 },
  );
  if (!list.ok) {
    const fail = { ok: false as const, error: list.error, state: list.status === 429 ? "rate_limited" as const : "temporarily_unavailable" as const };
    writeCache({ key, kind: "source_failed", value: fail, failed: true });
    return fail;
  }
  const filing = list.data.data?.[0]?.attributes;
  const jsonPath = filing?.json_url;
  if (!jsonPath) {
    const empty = {
      ok: true as const,
      data: {
        revenue: null, previousRevenue: null, profit: null, previousProfit: null,
        equity: null, assets: null, liabilities: null, equityRatio: null,
        year: null, previousYear: null, currency: "EUR", periodEnd: filing?.period_end ?? null,
        conceptRevenue: null, status: "UNAVAILABLE" as const, emptyReason: "no_filing",
      },
      observations: [] as ObservationInput[],
      sourceUrl: listUrl,
    };
    writeCache({ key, kind: "financial_absent", value: empty, absent: true });
    return empty;
  }
  const jsonUrl = jsonPath.startsWith("http") ? jsonPath : `${BASE}${jsonPath}`;
  const factsRes = await getJson<unknown>(jsonUrl, { timeoutMs: 45000, maxBytes: 12_000_000 });
  if (!factsRes.ok) {
    return { ok: false, error: factsRes.error, state: "temporarily_unavailable" };
  }
  const parsed = parseEsefFacts(factsRes.data, filing?.period_end ?? null);
  const verified = parsed.revenue != null || parsed.profit != null || parsed.equity != null;
  const observations: ObservationInput[] = [];
  if (verified && parsed.revenue != null) {
    observations.push({
      field: "revenue",
      rawValue: String(parsed.revenue),
      normalisedValue: String(parsed.revenue),
      confidence: 88,
      sourceReliability: reliability("esef_xbrl") || 90,
      extractionMethod: "esef_json",
      sourceUrl: jsonUrl,
      licence: "ESEF filing via filings.xbrl.org",
      verificationStatus: "verified",
      evidence: `ESEF ${parsed.conceptRevenue ?? "fact"} ${parsed.year ?? ""}`.trim(),
    });
  }
  const result = {
    ok: true as const,
    data: { ...parsed, status: verified ? "VERIFIED" as const : "UNAVAILABLE" as const, emptyReason: verified ? undefined : "parser_empty" },
    observations,
    sourceUrl: jsonUrl,
  };
  writeCache({ key, kind: verified ? "financial_period" : "financial_absent", value: result, absent: !verified });
  return result;
}
