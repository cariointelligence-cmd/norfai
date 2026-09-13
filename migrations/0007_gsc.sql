-- Google Search Console connection (platform SEO). Tokens encrypted at rest.

create table if not exists gsc_connections (
  id text primary key,
  mode text not null default 'oauth',
  client_id text,
  client_secret_enc text,
  refresh_token_enc text,
  access_token_enc text,
  access_expires_at timestamptz,
  sa_email text,
  sa_key_enc text,
  google_email text,
  site_url text,
  sites_json jsonb not null default '[]',
  snapshot_json jsonb,
  snapshot_range jsonb,
  connected_by text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gsc_oauth_states (
  state text primary key,
  user_id text not null,
  redirect_origin text,
  created_at timestamptz not null default now()
);

create index if not exists gsc_oauth_states_created_idx on gsc_oauth_states (created_at desc);
