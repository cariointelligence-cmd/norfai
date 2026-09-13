-- Norr intelligence schema. Idempotent. No extensions (PGLite-safe).
-- All tenant rows are scoped by user_id (TEXT, Better Auth id).

create table if not exists workspaces (
  id text primary key,
  user_id text not null unique,
  name text not null default 'Workspace',
  lawful_basis text,
  purpose text,
  retention_days integer not null default 730,
  country_allowlist text not null default 'FI',
  do_not_contact_enabled boolean not null default true,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_secrets (
  id text primary key,
  user_id text not null,
  source_id text not null,
  key_name text not null,
  secret_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_id, key_name)
);

create table if not exists search_profiles (
  id text primary key,
  user_id text not null,
  name text not null,
  criteria jsonb not null,
  schedule_enabled boolean not null default false,
  schedule_cron text,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists search_profiles_user_idx on search_profiles (user_id);

create table if not exists search_runs (
  id text primary key,
  user_id text not null,
  profile_id text,
  status text not null default 'queued',
  criteria jsonb not null,
  stats jsonb not null default '{}',
  source_report jsonb not null default '[]',
  pause_requested boolean not null default false,
  cancel_requested boolean not null default false,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists search_runs_user_idx on search_runs (user_id, created_at desc);
create index if not exists search_runs_status_idx on search_runs (user_id, status);

create table if not exists jobs (
  id text primary key,
  user_id text not null,
  run_id text,
  company_id text,
  type text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_queue_idx on jobs (status, run_after);
create index if not exists jobs_user_run_idx on jobs (user_id, run_id, status);

create table if not exists companies (
  id text primary key,
  user_id text not null,
  business_id text,
  vat_id text,
  lei text,
  eu_id text,
  name text not null,
  name_normalized text not null,
  trading_names jsonb not null default '[]',
  country text not null default 'FI',
  legal_form text,
  legal_form_code text,
  registration_date text,
  business_status text,
  trade_register_status text,
  industry_code text,
  industry_label text,
  industry_codes jsonb not null default '[]',
  description text,
  street text,
  postal_code text,
  municipality text,
  municipality_code text,
  region text,
  lat double precision,
  lng double precision,
  website text,
  website_domain text,
  general_email text,
  general_email_class text,
  phone text,
  social jsonb not null default '{}',
  employee_count integer,
  revenue numeric,
  profit numeric,
  financial_period text,
  financial_trend text,
  technologies jsonb not null default '[]',
  website_quality jsonb,
  overall_confidence integer,
  record_status text not null default 'discovered',
  reject_reason text,
  last_discovered_at timestamptz,
  last_verified_at timestamptz,
  assigned_owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists companies_user_idx on companies (user_id) where deleted_at is null;
create unique index if not exists companies_user_bid_idx on companies (user_id, business_id) where business_id is not null and deleted_at is null;
create index if not exists companies_user_name_idx on companies (user_id, name_normalized);
create index if not exists companies_user_domain_idx on companies (user_id, website_domain) where website_domain is not null;
create index if not exists companies_status_idx on companies (user_id, record_status);

create table if not exists observations (
  id text primary key,
  user_id text not null,
  entity_type text not null,
  entity_id text not null,
  field text not null,
  source_id text not null,
  source_url text,
  source_type text,
  dataset_id text,
  raw_value text,
  normalised_value text,
  confidence integer not null,
  source_reliability integer not null,
  extraction_method text not null,
  evidence text,
  licence text,
  verification_status text not null default 'unverified',
  retrieved_at timestamptz not null default now()
);
create index if not exists observations_entity_idx on observations (user_id, entity_type, entity_id, field, retrieved_at desc);
create index if not exists observations_source_idx on observations (user_id, source_id);

create table if not exists people (
  id text primary key,
  user_id text not null,
  company_id text not null,
  full_name text not null,
  name_normalized text not null,
  title text,
  title_normalized text,
  seniority text,
  department text,
  profile_url text,
  source_page text,
  work_email text,
  work_email_class text,
  work_phone text,
  employment_uncertainty text,
  confidence integer,
  evidence text,
  discovered_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists people_company_idx on people (user_id, company_id) where deleted_at is null;
create unique index if not exists people_dedupe_idx on people (user_id, company_id, name_normalized, coalesce(title_normalized, '')) where deleted_at is null;

create table if not exists contacts (
  id text primary key,
  user_id text not null,
  company_id text not null,
  person_id text,
  kind text not null,
  value text not null,
  value_normalized text not null,
  classification text not null,
  role_address boolean not null default false,
  mx_valid boolean,
  syntax_valid boolean,
  disposable boolean,
  derivation_method text,
  confidence integer,
  source_id text,
  source_url text,
  evidence text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists contacts_dedupe_idx on contacts (user_id, company_id, kind, value_normalized);
create index if not exists contacts_company_idx on contacts (user_id, company_id);

create table if not exists signals (
  id text primary key,
  user_id text not null,
  company_id text not null,
  kind text not null,
  title text not null,
  detail text,
  source_id text,
  source_url text,
  observed_at timestamptz not null default now(),
  confidence integer,
  evidence text
);
create index if not exists signals_company_idx on signals (user_id, company_id, kind);

create table if not exists crawl_pages (
  id text primary key,
  user_id text not null,
  company_id text not null,
  url text not null,
  final_url text,
  status_code integer,
  content_type text,
  language text,
  content_hash text,
  excerpt text,
  structured jsonb,
  robots_allowed boolean,
  error text,
  fetched_at timestamptz not null default now()
);
create unique index if not exists crawl_pages_url_idx on crawl_pages (user_id, company_id, url);

create table if not exists company_scores (
  id text primary key,
  user_id text not null,
  company_id text not null,
  run_id text,
  score integer not null,
  explanation jsonb not null,
  weights jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists company_scores_idx on company_scores (user_id, company_id, created_at desc);

create table if not exists tags (
  id text primary key,
  user_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists company_tags (
  user_id text not null,
  company_id text not null,
  tag_id text not null,
  primary key (user_id, company_id, tag_id)
);

create table if not exists lists (
  id text primary key,
  user_id text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists lists_user_idx on lists (user_id);

create table if not exists list_members (
  user_id text not null,
  list_id text not null,
  company_id text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, list_id, company_id)
);

create table if not exists notes (
  id text primary key,
  user_id text not null,
  entity_type text not null,
  entity_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists review_items (
  id text primary key,
  user_id text not null,
  kind text not null,
  status text not null default 'open',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists review_user_idx on review_items (user_id, status, created_at desc);

create table if not exists suppression (
  id text primary key,
  user_id text not null,
  kind text not null,
  value text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

create table if not exists source_health (
  user_id text not null,
  source_id text not null,
  state text not null,
  enabled boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  last_latency_ms integer,
  rate_limit_note text,
  records_discovered integer not null default 0,
  records_enriched integer not null default 0,
  confidence_sum integer not null default 0,
  confidence_n integer not null default 0,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_detail text,
  updated_at timestamptz not null default now(),
  primary key (user_id, source_id)
);

create table if not exists exports (
  id text primary key,
  user_id text not null,
  format text not null,
  scope text not null,
  filename text not null,
  row_count integer not null default 0,
  include_provenance boolean not null default true,
  status text not null default 'ready',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists exports_user_idx on exports (user_id, created_at desc);

create table if not exists audit_events (
  id text primary key,
  user_id text not null,
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_user_idx on audit_events (user_id, created_at desc);

create table if not exists dsar_requests (
  id text primary key,
  user_id text not null,
  subject_name text,
  subject_email text,
  request_type text not null,
  status text not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists run_companies (
  user_id text not null,
  run_id text not null,
  company_id text not null,
  match_reasons jsonb not null default '[]',
  is_new boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, run_id, company_id)
);
create index if not exists run_companies_run_idx on run_companies (user_id, run_id);
