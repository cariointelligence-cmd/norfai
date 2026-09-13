-- Phase 2 intelligence: financial periods, search traces, actor attribution.
-- Idempotent.

alter table companies add column if not exists previous_revenue numeric;
alter table companies add column if not exists financial_conflict text;
alter table search_runs add column if not exists created_by_user_id text;
alter table search_runs add column if not exists correlation_id text;
alter table search_runs add column if not exists coverage jsonb not null default '{}';

create table if not exists financial_periods (
  id text primary key,
  user_id text not null,
  company_id text not null,
  year text,
  period_end date,
  revenue numeric,
  profit numeric,
  equity numeric,
  assets numeric,
  liabilities numeric,
  equity_ratio numeric,
  currency text not null default 'EUR',
  source_id text not null,
  source_url text,
  conflict_state text,
  observed_at timestamptz not null default now()
);
create index if not exists financial_periods_company_idx on financial_periods (user_id, company_id, year);

create table if not exists search_traces (
  id text primary key,
  user_id text not null,
  run_id text,
  correlation_id text not null,
  stages jsonb not null default '[]',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists search_traces_run_idx on search_traces (user_id, run_id);
