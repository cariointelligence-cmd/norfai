-- Search hardening: per-user exposure, query fingerprints, ranking version.
-- Idempotent. PGLite-safe. Does not drop or rewrite existing search tables.

alter table search_runs add column if not exists query_fingerprint text;
alter table search_runs add column if not exists ranking_version text;
alter table search_runs add column if not exists name text;
alter table search_runs add column if not exists search_exhaustion_score integer;
alter table search_runs add column if not exists new_leads_count integer;
alter table search_runs add column if not exists previously_seen_count integer;
alter table search_runs add column if not exists excluded_count integer;

create index if not exists search_runs_fp_idx on search_runs (user_id, query_fingerprint, created_at desc);

alter table run_companies add column if not exists novelty_score double precision;
alter table run_companies add column if not exists search_score integer;
alter table run_companies add column if not exists final_rank_score double precision;
alter table run_companies add column if not exists rank_position integer;
alter table run_companies add column if not exists seen_before boolean not null default false;
alter table run_companies add column if not exists times_seen_before integer not null default 0;
alter table run_companies add column if not exists last_shown_at timestamptz;
alter table run_companies add column if not exists delivered boolean not null default false;

create index if not exists run_companies_rank_idx
  on run_companies (user_id, run_id, rank_position);

alter table exports add column if not exists run_id text;
alter table exports add column if not exists columns jsonb;
create index if not exists exports_run_idx on exports (user_id, run_id, created_at desc);

create table if not exists user_company_exposure (
  id text primary key,
  user_id text not null,
  tenant_id text not null,
  company_id text not null,
  business_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times_seen integer not null default 1,
  first_search_id text,
  last_search_id text,
  times_exported integer not null default 0,
  first_exported_at timestamptz,
  last_exported_at timestamptz,
  last_opened_at timestamptz,
  unique (user_id, company_id)
);
create index if not exists user_company_exposure_bid_idx
  on user_company_exposure (user_id, business_id)
  where business_id is not null;
create index if not exists user_company_exposure_user_seen_idx
  on user_company_exposure (user_id, last_seen_at desc);
create index if not exists user_company_exposure_tenant_idx
  on user_company_exposure (tenant_id, company_id);

create table if not exists search_health_events (
  id text primary key,
  user_id text not null,
  run_id text,
  query_fingerprint text,
  ranking_version text,
  duration_ms integer,
  candidate_count integer,
  final_count integer,
  new_leads_count integer,
  previously_seen_count integer,
  duplicate_ratio double precision,
  novelty_avg double precision,
  exhausted boolean not null default false,
  status text,
  created_at timestamptz not null default now()
);
create index if not exists search_health_created_idx on search_health_events (created_at desc);
create index if not exists search_health_user_idx on search_health_events (user_id, created_at desc);
