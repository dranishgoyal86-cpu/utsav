-- Birthday Event Improvement plan, Piece 3 (Activity Ideas Library).
--
-- A host can opt into browsing lib/activityIdeas.js's catalog and tap
-- "+ Add" on anything they like — this table is where that choice is
-- persisted, per event. Confirmed with Anish: these become real bookable
-- checklist items right away (not just a plain "interested" note), so
-- category_slug is a real vendorTaxonomy.js "Parent > Subcategory" key —
-- the same format event_requirements.category_slug already uses — and
-- useEventPlan.js folds these rows straight into the P5 checklist bucket
-- alongside everything resolved from event_requirements, so they get
-- estimates/booking-matching for free through the existing pipeline.
--
-- Deliberately its own table rather than new event_requirements rows:
-- event_requirements is the GLOBAL catalog (same rows apply to every event
-- of a type), but an activity library pick is inherently per-event — two
-- different hosts planning two different kids-birthdays should each be
-- able to add "Slime Making" independently without one insert affecting
-- the other's checklist.
--
-- is_featured_on_invite is added now (default false) rather than in a
-- second migration later — Piece 4 (invite integration) already confirmed
-- with Anish that hosts will curate which added activities show up on the
-- invite as a "What to expect" line, and that's a boolean on exactly this
-- row, not a new table of its own.
create table if not exists event_extra_activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_slug text not null,
  item_name text not null,
  category_slug text,
  age_hint text,
  note text,
  is_featured_on_invite boolean not null default false,
  added_at timestamptz not null default now()
);

create index if not exists event_extra_activities_event_id_idx on event_extra_activities(event_id);
