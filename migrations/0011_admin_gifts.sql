-- Admin-gifted plans. Idempotent.

alter table workspaces add column if not exists plan_source text not null default 'self';
alter table workspaces add column if not exists gifted_by text;
alter table workspaces add column if not exists gifted_at timestamptz;
