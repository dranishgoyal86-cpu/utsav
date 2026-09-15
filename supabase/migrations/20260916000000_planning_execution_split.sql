-- Planning vs. Execution split (Sept 2026). Design agreed in the project
-- doc "planning-vs-execution-split.md" before any code was touched, per
-- Anish's standing preference.
--
-- Two new, additive columns on events. Nothing else about the schema
-- changes, and no existing row's real behavior changes — see the backfill
-- below for exactly why.
--
--   planning_stage  — 'planning' | 'executing'. Decides whether a host
--                      lands on the new EventScope.js (decide what's
--                      included, no prices/vendors yet) or the existing
--                      PlanView.js (real prices, vendor browsing, booking
--                      — completely unchanged screen/behavior).
--   excluded_items   — event_requirements.item_name values the host
--                      explicitly said "skip this" for. Same shape/intent
--                      as the existing arranged_categories column (a
--                      text[] the host's own choices land in), just a
--                      sibling column rather than overloading that one —
--                      arranged_categories means "I'm handling this myself
--                      outside the app" (still counts as handled);
--                      excluded_items means "not part of my event at all."
--
-- The backfill matters: adding a NOT NULL column with a DEFAULT sets that
-- default on every row that exists at the moment this migration runs too
-- (Postgres doesn't distinguish "old" rows from "new" ones by default
-- value alone) — so immediately after the ALTER, this UPDATE flips every
-- row that already existed back to 'executing', which is what all of
-- them mean today (every event currently in the app already shows real
-- prices and vendor browsing, with no planning gate at all). Only a row
-- inserted AFTER this migration finishes running — i.e. a genuinely new
-- event — keeps the column's 'planning' default and goes through the new
-- flow. No host mid-way through planning a real event gets pushed
-- backward into a screen they've never seen.
alter table events
  add column if not exists planning_stage text not null default 'planning';

update events set planning_stage = 'executing' where planning_stage = 'planning';

alter table events
  drop constraint if exists events_planning_stage_check;
alter table events
  add constraint events_planning_stage_check check (planning_stage in ('planning', 'executing'));

alter table events
  add column if not exists excluded_items text[] default '{}';
