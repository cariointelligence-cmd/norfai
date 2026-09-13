-- Norf platform: plans, admins, blog, billing. Idempotent. PGLite-safe.

alter table workspaces add column if not exists plan text not null default 'starter';
alter table workspaces add column if not exists plan_period_start timestamptz not null default now();
alter table workspaces add column if not exists searches_used integer not null default 0;
alter table workspaces add column if not exists stripe_customer_id text;
alter table workspaces add column if not exists stripe_subscription_id text;
alter table workspaces add column if not exists locale text not null default 'fi';

create table if not exists platform_admins (
  user_id text primary key,
  email text not null unique,
  role text not null default 'admin',
  granted_by text,
  created_at timestamptz not null default now()
);
create index if not exists platform_admins_email_idx on platform_admins (email);

create table if not exists admin_invites (
  email text primary key,
  granted_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists blog_posts (
  id text primary key,
  slug text not null unique,
  locale text not null default 'fi',
  title text not null,
  excerpt text not null default '',
  body text not null,
  seo_title text,
  seo_description text,
  status text not null default 'draft',
  author_id text,
  source text not null default 'human',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_posts_pub_idx on blog_posts (status, published_at desc);
create index if not exists blog_posts_locale_idx on blog_posts (locale, status);

create table if not exists blog_auto_state (
  id text primary key default 'default',
  day date,
  published_today integer not null default 0,
  last_run_at timestamptz
);

insert into blog_auto_state (id, day, published_today)
  values ('default', null, 0)
  on conflict (id) do nothing;

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
