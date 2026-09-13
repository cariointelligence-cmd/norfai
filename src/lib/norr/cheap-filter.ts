/** Cheap gates that run before any HTTP. A perfect enrich cannot recover a
 *  company that is the wrong country, the wrong industry, or already dead. */
import { valuesOf } from "./criteria.ts";
import type { SearchCriteria } from "./types.ts";

export type CheapReject =
  | "wrong_country"
  | "wrong_industry"
  | "inactive"
  | "missing_identity";

export type DiscoverRow = {
  name?: string | null;
  country?: string | null;
  industryCode?: string | null;
  industryLabel?: string | null;
  status?: string | null;
  businessId?: string | null;
};

const INACTIVE = /lakannut|konkurss|purku|dissolved|ceased|liquidat|bankrupt|struck off|ei kaupparekisterissä/i;

export function cheapDiscoverReject(row: DiscoverRow, criteria: SearchCriteria | null | undefined): CheapReject | null {
  if (!criteria) return null;
  const wantCountry = String(criteria.country ?? "FI").toUpperCase();
  const gotCountry = String(row.country ?? "FI").toUpperCase();
  if (wantCountry && gotCountry && wantCountry !== gotCountry) return "wrong_country";
  if (row.status && INACTIVE.test(String(row.status))) return "inactive";
  if (!String(row.name ?? "").trim() && !row.businessId) return "missing_identity";
  if (!criteria.groups) return null;
  const codes = valuesOf(criteria, "industry").map((c) => String(c).replace(/\D/g, "")).filter(Boolean);
  const got = String(row.industryCode ?? "").replace(/\D/g, "");
  if (codes.length && got) {
    const ok = codes.some((c) => got.startsWith(c) || c.startsWith(got.slice(0, Math.min(2, got.length))));
    if (!ok) return "wrong_industry";
  }
  return null;
}

export function cheapRejectLabel(code: CheapReject): string {
  if (code === "wrong_country") return "Wrong country before enrich";
  if (code === "wrong_industry") return "Industry code outside the ICP before enrich";
  if (code === "inactive") return "Company is not trading";
  return "No usable identity";
}
