-- Household/group guest entries — additive second entry type alongside the
-- existing implicit 'individual' (named person + plus_ones). Verified live
-- via information_schema.columns: neither column exists yet.
--
-- No backfill needed: `alter table ... add column ... default 'individual'`
-- sets that default value on every existing row as part of the same DDL
-- statement (Postgres does this in-place for a simple scalar default,
-- no separate UPDATE required) — every current row becomes 'individual'
-- automatically, matching what it already implicitly was.
alter table public.event_invitees add column if not exists entry_type text default 'individual';
-- expected values: 'individual' | 'household'
alter table public.event_invitees add column if not exists household_size integer;
-- only meaningful when entry_type = 'household'; the host's estimate, e.g. 4
