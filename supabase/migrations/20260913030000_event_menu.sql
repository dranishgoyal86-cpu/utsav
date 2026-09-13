-- Birthday Event Improvement plan, Piece 5 (last piece) — the home-catering
-- menu planner. Host-planning-only, not guest-facing (confirmed with Anish
-- back at the very start of this plan).
--
-- Single-value choices live directly on `events`, same pattern as
-- theme_slug/theme_palette from Piece 2 — every event has at most one menu
-- type and one course size, so these don't need their own table:
--   menu_type        — 'customized' (built from lib/menuLibrary.js) or
--                       'caterer_provided' (caterer brings their own menu;
--                       menu_provider_note is the only other field used).
--   menu_course_size — 3, 4, or 5 (lib/menuLibrary.js's COURSE_SIZES keys).
--   menu_provider_note — free text, only meaningful when menu_type is
--                       'caterer_provided' (e.g. "Caterer confirmed a North
--                       Indian veg menu, will share details closer to the
--                       date").
--
-- The actual dish picks are many-per-event, so — same reasoning as
-- event_extra_activities in Piece 3 — they get their own table rather than
-- a jsonb blob, so a future caterer-facing view can query real rows.
alter table events
  add column if not exists menu_type text,
  add column if not exists menu_course_size smallint,
  add column if not exists menu_provider_note text;

create table if not exists event_menu_selections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  course_category text not null,
  cuisine_slug text not null,
  dish_name text not null,
  is_veg boolean not null default true,
  added_at timestamptz not null default now()
);

create index if not exists event_menu_selections_event_id_idx on event_menu_selections(event_id);
