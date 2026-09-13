-- Security events, abuse state, export tracing. Idempotent.

create table if not exists security_events (
  id text primary key,
  user_id text,
  action text not null,
  risk text not null default 'normal',
  ip text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on security_events (created_at desc);
create index if not exists security_events_user_idx on security_events (user_id, created_at desc);

create table if not exists abuse_state (
  user_id text primary key,
  score integer not null default 0,
  classification text not null default 'normal',
  company_views integer not null default 0,
  exports_today integer not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table exports add column if not exists watermark text;
