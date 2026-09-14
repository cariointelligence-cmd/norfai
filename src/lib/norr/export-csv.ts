import { getSql } from "@/lib/db";
import { rowsToCsv, projectCsvRows } from "./exporters.ts";
import { canonicalCompanyWebsite } from "./normalize.ts";
import { emailBelongsToCompany, isBillingEmail, isJunkEmail, isRecruitingEmail } from "./contacts.ts";
import { isJunkCompanyPhone } from "./phones.ts";
import { cleanPersonName, plausiblePersonName } from "./extract.ts";

function keepEmail(email: string | null | undefined, name: string, website: string | null): boolean {
  const v = String(email ?? "").trim();
  if (!v) return false;
  if (isJunkEmail(v) || isBillingEmail(v) || isRecruitingEmail(v)) return false;
  return emailBelongsToCompany(v, { name, website });
}

function keepPhone(raw: string | null | undefined): boolean {
  return Boolean(raw) && !isJunkCompanyPhone(raw);
}

function keepPerson(fullName: string | null | undefined): boolean {
  const n = cleanPersonName(fullName) ?? String(fullName ?? "").trim();
  return plausiblePersonName(n);
}

export async function exportRunCsv(opts: {
  userId: string;
  runId: string;
  preset?: string | null;
  cap?: number;
}): Promise<{ filename: string; mime: string; body: string; rowCount: number; error?: string }> {
  const sql = await getSql();
  const runId = String(opts.runId ?? "").slice(0, 64);
  const cap = Math.min(Math.max(Number(opts.cap ?? 10_000) || 10_000, 1), 10_000);
  if (!runId) return { filename: "", mime: "text/plain", body: "", rowCount: 0, error: "Missing search" };
  const owned = (await sql`select id from search_runs where id = ${runId} and user_id = ${opts.userId} limit 1`)?.[0];
  if (!owned) return { filename: "", mime: "text/plain", body: "", rowCount: 0, error: "Search not found" };
  const rows = await sql`
    select c.id, c.name, c.business_id, c.vat_id, c.country, c.municipality, c.street, c.postal_code,
      c.website, c.website_domain, c.industry_code, c.industry_label, c.legal_form, c.record_status,
      c.overall_confidence, c.last_verified_at, c.revenue, c.website_score, c.seo_score,
      c.commercial_opportunity, c.match_score, c.general_email, c.phone,
      rc.novelty_score, rc.seen_before
    from run_companies rc
    join companies c on c.id = rc.company_id
    where rc.user_id = ${opts.userId} and rc.run_id = ${runId} and c.deleted_at is null
      and c.record_status is distinct from 'rejected'
    order by coalesce(rc.rank_position, 999999), c.id
    limit ${cap}`;
  const companyIds = rows.map((c: { id: string }) => String(c.id)).filter(Boolean);
  const people = companyIds.length
    ? await sql`select company_id, full_name, title from people where user_id = ${opts.userId} and deleted_at is null and company_id = any(${companyIds})`
    : [];
  const contacts = companyIds.length
    ? await sql`select company_id, kind, value, classification from contacts where user_id = ${opts.userId} and company_id = any(${companyIds})`
    : [];
  const mapped = rows.map((c: Record<string, unknown>) => {
    const id = String(c.id ?? "");
    const name = String(c.name ?? "");
    const website = canonicalCompanyWebsite(String(c.website ?? "")) ?? "";
    const ppl = people.filter((p: { company_id: string; full_name: string }) => p.company_id === id && keepPerson(p.full_name));
    const cts = contacts.filter((x: { company_id: string }) => x.company_id === id);
    const emailsPub = cts
      .filter((x: { kind: string; classification?: string; value: string }) => x.kind === "email" && x.classification === "published" && keepEmail(x.value, name, website || null))
      .map((x: { value: string }) => x.value);
    const emailsInf = cts
      .filter((x: { kind: string; classification?: string; value: string }) => x.kind === "email" && x.classification === "inferred" && keepEmail(x.value, name, website || null))
      .map((x: { value: string }) => x.value);
    const phones = cts
      .filter((x: { kind: string; value: string }) => x.kind === "phone" && keepPhone(x.value))
      .map((x: { value: string }) => x.value);
    if (!emailsPub.length && keepEmail(String(c.general_email ?? ""), name, website || null)) {
      emailsPub.push(String(c.general_email));
    }
    if (!phones.length && keepPhone(String(c.phone ?? ""))) phones.push(String(c.phone));
    return {
      canonical_company_id: id,
      name,
      business_id: String(c.business_id ?? ""),
      vat_id: String(c.vat_id ?? ""),
      country: String(c.country ?? ""),
      municipality: String(c.municipality ?? ""),
      street: String(c.street ?? ""),
      postal_code: String(c.postal_code ?? ""),
      website,
      industry_code: String(c.industry_code ?? ""),
      industry_label: String(c.industry_label ?? ""),
      legal_form: String(c.legal_form ?? ""),
      status: String(c.record_status ?? ""),
      confidence: c.overall_confidence ?? "",
      revenue: c.revenue ?? "",
      website_score: c.website_score ?? "",
      seo_score: c.seo_score ?? "",
      opportunity_score: c.commercial_opportunity ?? "",
      match_score: c.match_score ?? "",
      email_published: [...new Set(emailsPub)].join("; "),
      email_inferred: [...new Set(emailsInf)].join("; "),
      phone: [...new Set(phones)].join("; "),
      people: ppl.map((p: { full_name: string; title?: string }) => {
        const n = cleanPersonName(p.full_name) ?? p.full_name;
        return `${n}${p.title ? " · " + p.title : ""}`;
      }).join("; "),
      last_verified: String(c.last_verified_at ?? ""),
      run_id: runId,
      exported_at: new Date().toISOString(),
      novelty_score: c.novelty_score ?? "",
      seen_before: c.seen_before ? "yes" : "no",
    };
  });
  const body = rowsToCsv(projectCsvRows(mapped, opts.preset ?? "full"));
  const day = new Date().toISOString().slice(0, 10);
  return {
    filename: `norf-export-${day}.csv`,
    mime: "text/csv;charset=utf-8",
    body,
    rowCount: mapped.length,
  };
}
