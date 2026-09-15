-- Menu planning vs. execution split (Menu-only version of the whole-event
-- planning/execution split from 20260916000000_planning_execution_split.sql).
-- See claude/menu-planning-vs-execution-split.md for the full design.
--
-- menu_stage gates whether MenuPlanner.js/MenuLibrary.js show the plain
-- dish-list (Selecting) or the Price/Quantity/Notes fields (Pricing) for
-- each picked dish. Same backfill technique as planning_stage: add the
-- column with the NEW default, then immediately flip every pre-existing
-- event to 'pricing' (today's actual behavior — price fields visible right
-- away), so only genuinely new post-migration events land on 'selecting'.
-- No event_menu_selections columns change — price/quantity/notes already
-- exist and keep their data; this is purely a display-layer gate.
alter table events
  add column if not exists menu_stage text not null default 'selecting';

update events set menu_stage = 'pricing' where menu_stage = 'selecting';

alter table events
  drop constraint if exists events_menu_stage_check;
alter table events
  add constraint events_menu_stage_check check (menu_stage in ('selecting', 'pricing'));
