-- Per-user lead preferences and list rules. Idempotent. Does not drop data.

alter table workspaces add column if not exists preferences jsonb not null default '{}';
alter table lists add column if not exists rules jsonb;
