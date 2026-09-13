-- Core recovery: schema contract for search_runs + job leases + capability state.
alter table search_runs add column if not exists updated_at timestamptz not null default now();

alter table jobs add column if not exists lease_until timestamptz;
alter table jobs add column if not exists generation integer not null default 1;
alter table jobs add column if not exists capability text;

alter table companies add column if not exists financial_source text;
alter table companies add column if not exists equity numeric;
alter table companies add column if not exists assets numeric;
alter table companies add column if not exists liabilities numeric;
alter table companies add column if not exists equity_ratio numeric;

create table if not exists company_capabilities (
  user_id text not null,
  company_id text not null,
  capability text not null,
  status text not null default 'UNKNOWN',
  evidence jsonb not null default '{}',
  last_error text,
  duration_ms integer,
  observed_at timestamptz not null default now(),
  primary key (user_id, company_id, capability)
);
create index if not exists company_capabilities_status_idx
  on company_capabilities (user_id, capability, status);

create table if not exists search_stages (
  run_id text not null,
  user_id text not null,
  stage text not null,
  status text not null default 'PENDING',
  started_at timestamptz,
  finished_at timestamptz,
  detail jsonb not null default '{}',
  primary key (run_id, stage)
);
