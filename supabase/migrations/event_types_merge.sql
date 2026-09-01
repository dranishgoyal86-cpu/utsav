-- Merges the pre-existing event_types table (10 rows, built in an earlier
-- pass of this app) with the live taxonomy in lib/eventTypeNames.js's
-- EVENT_TYPE_NAMES (26 slugs, the actual source of truth for every
-- customer-facing screen — PlanHero.js's event-creation flow, PlanView.js's
-- celebratory/solemn UI gate, matchEventTypeText's free-text matching).
--
-- Why this table still exists at all rather than being deleted outright:
-- GuestList.js (screens/customer/GuestList.js, ~line 811) does a real,
-- live two-query lookup — event_types.id (by slug) → sub_events.event_type_id
-- — to suggest real function/sub-event names (Haldi/Sangeet/Reception-style)
-- when building an event's guest list. EVENT_TYPE_NAMES is a plain
-- slug→string object with no id column, so it cannot serve as an FK anchor
-- for sub_events. That FK relationship is the one real reason to keep this
-- table alive and worth actually merging rather than abandoning as dead.
--
-- Verified live before writing this (not assumed):
--   - griha-pravesh, satyanarayan-katha, godh-bharai, corporate-event have
--     ZERO rows in event_requirements.event_type_slug, saved_plans.event_type,
--     and events.event_type_slug — genuinely stale, safe to delete.
--   - Only hindu-wedding (of all 10 existing rows) has any sub_events rows
--     (7 of them) — every other row, old or new, has none today.
--   - icon/name/has_sub_events/sort_order are not read by any live code path
--     today — GuestList.js's query is `.select('id')` only. They're kept and
--     completed here anyway so the table is a real, ready-to-use superset
--     the moment a screen wants to render icons or richer event-type lists
--     from the DB instead of the hardcoded EVENT_TYPE_NAMES object, rather
--     than a half-finished one that would need yet another pass first.
--
-- Result: event_types becomes a true superset of EVENT_TYPE_NAMES (26 slugs,
-- same slugs, same order via sort_order), with the 4 confirmed-stale slugs
-- removed and the id of every currently-matching row left untouched so the
-- one real dependency (hindu-wedding's sub_events FK) is undisturbed.

begin;

-- 1) Drop the 4 confirmed-stale slugs (zero usage anywhere, checked above).
delete from public.event_types
  where slug in ('griha-pravesh', 'satyanarayan-katha', 'godh-bharai', 'corporate-event');

-- 2) Re-sequence the 6 kept rows' sort_order to match EVENT_TYPE_NAMES's
--    real key order (ids untouched — hindu-wedding's id is what sub_events
--    actually points to, and must not change).
update public.event_types set sort_order = 0 where slug = 'hindu-wedding';
update public.event_types set sort_order = 7 where slug = 'engagement';
update public.event_types set sort_order = 8 where slug = 'kids-birthday';
update public.event_types set sort_order = 9 where slug = 'adult-birthday';
update public.event_types set sort_order = 10 where slug = 'anniversary';
update public.event_types set sort_order = 11 where slug = 'mundan';

-- 3) Insert the 20 EVENT_TYPE_NAMES slugs not yet in event_types, in the
--    same order, all has_sub_events = false (matches every existing row
--    except hindu-wedding — no sub_events data is being seeded for these).
insert into public.event_types (slug, name, icon, has_sub_events, sort_order) values
  ('nikah', 'Nikah', '🕌', false, 1),
  ('anand-karaj', 'Anand Karaj (Sikh)', '🙏', false, 2),
  ('christian-wedding', 'Christian Wedding', '⛪', false, 3),
  ('parsi-wedding', 'Parsi Wedding', '🔥', false, 4),
  ('jain-wedding', 'Jain Wedding', '🤍', false, 5),
  ('interfaith-wedding', 'Interfaith Wedding', '🤝', false, 6),
  ('baby-shower', 'Baby Shower', '🍼', false, 12),
  ('housewarming', 'Housewarming', '🏡', false, 13),
  ('naming-ceremony', 'Naming Ceremony', '🏷️', false, 14),
  ('religious-event', 'Religious Event', '🛕', false, 15),
  ('corporate-conference', 'Corporate Conference', '💼', false, 16),
  ('product-launch', 'Product Launch', '🚀', false, 17),
  ('exhibition', 'Exhibition', '🖼️', false, 18),
  ('concert', 'Concert', '🎤', false, 19),
  ('festival-fair', 'Festival / Fair', '🎪', false, 20),
  ('sports-event', 'Sports Event', '🏆', false, 21),
  ('other', 'Other', '✨', false, 22),
  ('funeral-last-rites', 'Funeral / Last Rites', '🕯️', false, 23),
  ('wellness-retreat', 'Wellness Retreat', '🧘', false, 24),
  ('team-offsite', 'Team Offsite', '🧑‍🤝‍🧑', false, 25)
on conflict (slug) do nothing;

commit;
