-- Security hardening: API tokens (hashed), nonces, alerts, extraction counters.

create table if not exists api_tokens (
  id text primary key,
  user_id text not null,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text not null default 'company:read',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_tokens_user_idx on api_tokens (user_id);

create table if not exists service_nonces (
  nonce text primary key,
  created_at timestamptz not null default now()
);

create table if not exists security_alerts (
  id text primary key,
  kind text not null,
  severity text not null,
  user_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists security_alerts_created_idx on security_alerts (created_at desc);

alter table abuse_state add column if not exists unique_companies integer not null default 0;
alter table abuse_state add column if not exists searches integer not null default 0;
alter table abuse_state add column if not exists last_ip text;
alter table abuse_state add column if not exists reason text;

alter table exports add column if not exists watermark text;
alter table exports add column if not exists ip text;
alter table exports add column if not exists query_hash text;

create index if not exists companies_user_id_idx on companies (user_id, id);
