-- Team, exclusions, activity, snapshots, CRM, digests. Idempotent.

create table if not exists workspace_members (
  id text primary key,
  owner_user_id text not null,
  member_user_id text,
  email text not null,
  role text not null default 'member',
  status text not null default 'invited',
  invited_at timestamptz not null default now(),
  joined_at timestamptz
);
create unique index if not exists workspace_members_owner_email_idx on workspace_members (owner_user_id, email);
create index if not exists workspace_members_member_idx on workspace_members (member_user_id) where member_user_id is not null;

create table if not exists account_exclusions (
  id text primary key,
  user_id text not null,
  kind text not null,
  value text not null,
  value_normalized text not null,
  label text,
  source text not null default 'upload',
  created_at timestamptz not null default now(),
  unique (user_id, kind, value_normalized)
);
create index if not exists account_exclusions_user_idx on account_exclusions (user_id);

create table if not exists company_activities (
  id text primary key,
  user_id text not null,
  company_id text not null,
  actor_id text not null,
  kind text not null,
  outcome text,
  body text,
  created_at timestamptz not null default now()
);
create index if not exists company_activities_co_idx on company_activities (user_id, company_id, created_at desc);

create table if not exists company_snapshots (
  id text primary key,
  user_id text not null,
  company_id text not null,
  taken_at timestamptz not null default now(),
  website text,
  content_hash text,
  decision_maker text,
  revenue text,
  profit text,
  ads text,
  people_hash text,
  phone text,
  email text,
  business_status text
);
create index if not exists company_snapshots_co_idx on company_snapshots (user_id, company_id, taken_at desc);

create table if not exists company_changes (
  id text primary key,
  user_id text not null,
  company_id text not null,
  field text not null,
  old_value text,
  new_value text,
  summary text not null,
  severity text not null default 'info',
  detected_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists company_changes_user_idx on company_changes (user_id, detected_at desc);

create table if not exists crm_connections (
  id text primary key,
  user_id text not null,
  provider text not null,
  token_last4 text,
  portal text,
  last_push_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists crm_pushes (
  id text primary key,
  user_id text not null,
  company_id text not null,
  provider text not null,
  remote_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists digests (
  id text primary key,
  user_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists digests_user_idx on digests (user_id, created_at desc);

alter table companies add column if not exists parent_company_id text;
alter table companies add column if not exists parent_business_id text;
alter table companies add column if not exists parent_name text;
alter table companies add column if not exists group_role text;
alter table companies add column if not exists phone_class text;
alter table companies add column if not exists call_brief jsonb;
alter table companies add column if not exists activity_outcome text;
alter table companies add column if not exists last_activity_at timestamptz;
alter table companies add column if not exists assigned_owner text;

alter table contacts add column if not exists phone_role text;

alter table lists add column if not exists kind text not null default 'list';
