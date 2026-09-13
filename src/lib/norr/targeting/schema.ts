import type { Sql } from "@/lib/db";

export async function ensureTargetingSchema(sql: Sql): Promise<void> {
  try {
    await sql.query("alter table companies add column if not exists intel jsonb not null default '{}'");
    await sql.query("alter table companies add column if not exists website_score integer");
    await sql.query("alter table companies add column if not exists seo_score integer");
    await sql.query("alter table companies add column if not exists digital_maturity integer");
    await sql.query("alter table companies add column if not exists commercial_opportunity integer");
    await sql.query("alter table companies add column if not exists company_age_years integer");
    await sql.query("alter table companies add column if not exists match_score integer");
    await sql.query("create index if not exists companies_website_score_idx on companies (user_id, website_score)");
    await sql.query("create index if not exists companies_commercial_idx on companies (user_id, commercial_opportunity)");
    await sql.query("create index if not exists companies_match_idx on companies (user_id, match_score)");
  } catch (err) {
    console.warn("[norf] targeting schema", err);
  }
}
