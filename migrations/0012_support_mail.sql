alter table workspaces add column if not exists last_seen_at timestamptz;

create table if not exists support_tickets (
  id text primary key,
  public_token text not null unique,
  user_id text,
  email text not null,
  name text not null default '',
  subject text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_customer_at timestamptz,
  last_admin_at timestamptz
);
create index if not exists support_tickets_user_idx on support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on support_tickets (status, updated_at desc);
create index if not exists support_tickets_email_idx on support_tickets (lower(email), created_at desc);

create table if not exists support_messages (
  id text primary key,
  ticket_id text not null references support_tickets(id) on delete cascade,
  author_kind text not null,
  author_id text,
  author_email text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on support_messages (ticket_id, created_at);

create table if not exists mail_unsubscribes (
  email text primary key,
  token text not null unique,
  created_at timestamptz not null default now(),
  reason text
);

create table if not exists mail_outbox (
  id text primary key,
  campaign text not null,
  user_id text,
  email text not null,
  to_name text,
  subject text not null,
  text_body text not null,
  html_body text not null,
  status text not null default 'queued',
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  provider text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists mail_outbox_status_idx on mail_outbox (status, scheduled_at);
create index if not exists mail_outbox_email_idx on mail_outbox (lower(email), created_at desc);
create index if not exists mail_outbox_campaign_idx on mail_outbox (campaign, created_at desc);
create unique index if not exists mail_outbox_once_idx
  on mail_outbox (campaign, lower(email))
  where campaign in ('welcome','day3_checkin','winback_1','winback_2','winback_3','first_search','billing_thanks');
