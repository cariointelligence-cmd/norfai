-- Operational extras: seed uploads. Idempotent. PGLite-safe.

create table if not exists seed_uploads (
  id text primary key,
  user_id text not null,
  filename text not null,
  row_count integer not null default 0,
  identifiers jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists seed_uploads_user_idx on seed_uploads (user_id, created_at desc);
