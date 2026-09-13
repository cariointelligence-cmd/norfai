import { normalizeBusinessId, normalizeDomain, normalizeName } from "./normalize.ts";

export type ExclusionKind = "business_id" | "domain" | "name" | "vat_id";

export type ExclusionRow = {
  kind: ExclusionKind;
  value: string;
  valueNormalized: string;
  label?: string;
};

export function parseExclusionLine(raw: string): ExclusionRow | null {
  const s = raw.trim().replace(/^["']|["']$/g, "");
  if (!s || s.startsWith("#")) return null;
  const parts = s.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
  const token = parts[0] ?? "";
  const label = parts[1];
  const bid = normalizeBusinessId(token);
  if (bid) return { kind: "business_id", value: bid, valueNormalized: bid, label };
  const vat = token.toUpperCase().replace(/\s/g, "");
  if (/^FI\d{8}$/.test(vat)) {
    const fromVat = normalizeBusinessId(`${vat.slice(2, 9)}-${vat.slice(9)}`);
    if (fromVat) return { kind: "business_id", value: fromVat, valueNormalized: fromVat, label };
    return { kind: "vat_id", value: vat, valueNormalized: vat, label };
  }
  const domain = normalizeDomain(token.includes("@") ? token.split("@")[1] : token);
  if (domain) return { kind: "domain", value: domain, valueNormalized: domain, label };
  const name = normalizeName(token);
  if (name.length >= 3) return { kind: "name", value: token.slice(0, 160), valueNormalized: name, label };
  return null;
}

export function parseExclusionText(text: string): ExclusionRow[] {
  const seen = new Set<string>();
  const out: ExclusionRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseExclusionLine(line);
    if (!row) continue;
    const key = `${row.kind}:${row.valueNormalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.slice(0, 5000);
}

export function matchesExclusion(
  company: { businessId?: string | null; vatId?: string | null; website?: string | null; websiteDomain?: string | null; name?: string | null },
  exclusions: ExclusionRow[],
): ExclusionRow | null {
  const bid = normalizeBusinessId(company.businessId ?? null);
  const domain = normalizeDomain(company.websiteDomain ?? company.website ?? null);
  const name = company.name ? normalizeName(company.name) : "";
  const vat = (company.vatId ?? "").toUpperCase().replace(/\s/g, "");
  for (const e of exclusions) {
    if (e.kind === "business_id" && bid && e.valueNormalized === bid) return e;
    if (e.kind === "domain" && domain && e.valueNormalized === domain) return e;
    if (e.kind === "vat_id" && vat && e.valueNormalized === vat) return e;
    if (e.kind === "name" && name && (name === e.valueNormalized || name.includes(e.valueNormalized) || e.valueNormalized.includes(name))) {
      if (e.valueNormalized.length >= 5 && name.length >= 5) return e;
    }
  }
  return null;
}
