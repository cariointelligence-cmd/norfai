-- Admin-granted extra searches/leads. Runtime ALTER in platform.ts is the live
-- path; this keeps schema-contract and fresh DBs aligned.

alter table workspaces add column if not exists bonus_searches integer not null default 0;
alter table workspaces add column if not exists bonus_leads integer not null default 0;
