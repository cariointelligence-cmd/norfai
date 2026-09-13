create table if not exists mail_unsub_tokens (
  email text primary key,
  token text not null unique,
  created_at timestamptz not null default now()
);

insert into mail_unsub_tokens (email, token, created_at)
select email, token, created_at from mail_unsubscribes
on conflict (email) do nothing;

delete from mail_unsubscribes where reason is null;

create table if not exists mail_settings (
  id text primary key,
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_pass text,
  smtp_secure boolean not null default false,
  resend_api_key text,
  mail_from text,
  updated_at timestamptz not null default now()
);

alter table support_tickets add column if not exists origin text not null default 'customer';
alter table support_tickets add column if not exists kind text not null default 'support';
alter table support_tickets add column if not exists opened_by text;
