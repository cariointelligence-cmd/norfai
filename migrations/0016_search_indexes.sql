-- Search hot-path indexes. Idempotent. PGLite-safe (no CONCURRENTLY).
-- Claim, steal, run listing, and company join queries — not speculative.

-- Worker claim: user + queued + due + FIFO
create index if not exists jobs_queued_claim_idx
  on jobs (user_id, run_after, created_at)
  where status = 'queued';

-- Steal stale running leases
create index if not exists jobs_running_steal_idx
  on jobs (user_id, locked_at)
  where status = 'running' and locked_at is not null;

-- Live queue depth / poll / drain
create index if not exists jobs_live_user_idx
  on jobs (user_id, run_id, type)
  where status in ('queued', 'running');

-- Dedupe scrape/score/email per company in a run
create index if not exists jobs_run_company_type_idx
  on jobs (user_id, run_id, company_id, type);

-- Discover/email lookup by type
create index if not exists jobs_run_type_status_idx
  on jobs (user_id, run_id, type, status);

-- EXISTS join from claim onto active runs
create index if not exists search_runs_active_idx
  on search_runs (user_id, id)
  where status in ('queued', 'running');

-- Result page: run_companies -> companies (already PK), reverse lookup for delete/compare
create index if not exists run_companies_company_idx
  on run_companies (user_id, company_id, run_id);

-- Overview recent companies
create index if not exists companies_user_updated_idx
  on companies (user_id, updated_at desc)
  where deleted_at is null;

-- Find-missing-emails scan
create index if not exists companies_missing_email_idx
  on companies (user_id, id)
  where deleted_at is null and general_email is null;

-- Decision-maker subquery on the run page
create index if not exists people_company_name_idx
  on people (user_id, company_id, confidence desc)
  where deleted_at is null;
