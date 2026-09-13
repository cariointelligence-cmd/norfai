-- Company targeting intel. Idempotent. PGLite-safe.

alter table companies add column if not exists intel jsonb not null default '{}';
alter table companies add column if not exists website_score integer;
alter table companies add column if not exists seo_score integer;
alter table companies add column if not exists digital_maturity integer;
alter table companies add column if not exists commercial_opportunity integer;
alter table companies add column if not exists company_age_years integer;
alter table companies add column if not exists match_score integer;

create index if not exists companies_website_score_idx on companies (user_id, website_score) where deleted_at is null;
create index if not exists companies_commercial_idx on companies (user_id, commercial_opportunity) where deleted_at is null;
create index if not exists companies_match_idx on companies (user_id, match_score) where deleted_at is null;
