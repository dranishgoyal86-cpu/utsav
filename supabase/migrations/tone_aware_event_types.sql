-- Tone-aware event types: Other, Funeral/Last-Rites, Wellness Retreat, Team
-- Offsite. Paste into the Supabase SQL editor — not executed automatically
-- (standing project convention).

-- 1. requires_celebratory column: default false is a no-op for all 16
--    existing event types (all celebratory=true in lib/eventTypeNames.js),
--    only ever suppresses a row once a non-celebratory type exists.
alter table public.event_todo_templates add column if not exists requires_celebratory boolean not null default false;

-- 2. Flip the specific universal rows that are unmistakably festive/
--    performative in connotation. 'rehearsal' ("Rehearsal / run-through")
--    deliberately left alone — a walkthrough of who-does-what-when is still
--    genuinely useful for a solemn event (getting the order of rites right
--    matters), unlike DJ/decor/makeup/seating which are wedding-ladder
--    flourishes with no funeral equivalent.
update public.event_todo_templates
set requires_celebratory = true
where category in ('beauty_makeup', 'decor', 'music', 'seating');

-- 3. event_requirements — the priced "Essentials" list. All four new types
--    start from zero rows today (fully additive, nothing to disrupt).
--    "guest list" from the task brief isn't a real vendor_categories slug
--    (guest-list tracking is a todo-template item, not a bookable vendor
--    service) — mapped to 'invitations' instead, the closest real
--    bookable line item, matching how engagement/hindu-wedding/
--    kids-birthday already represent the same need.

-- other: deliberately sparse — venue + caterer only, nothing else.
insert into public.event_requirements (event_type_slug, item_name, category_slug, priority, sort_order) values
  ('other', 'Venue', 'venues', 'P1', 1),
  ('other', 'Caterer', 'catering', 'P1', 2);

-- funeral-last-rites: respectful, real needs only — no wedding-ladder items.
insert into public.event_requirements (event_type_slug, item_name, category_slug, priority, contextual_label, sort_order) values
  ('funeral-last-rites', 'Venue', 'venues', 'P1', 'Hall or venue for the ceremony', 1),
  ('funeral-last-rites', 'Caterer', 'catering', 'P1', 'Post-ceremony meal', 2),
  ('funeral-last-rites', 'Priest / officiant', 'priests-officiants', 'P2', 'If required for the rites', 10),
  ('funeral-last-rites', 'Invitations', 'invitations', 'P2', 'Notify family and attendees', 11);

-- wellness-retreat: venue/resort, catering, multi-day stay, invites, and a
-- facilitator line standing in for the missing Wellness/Spa vendor category
-- (flagged in the investigation — the checklist item exists even though the
-- marketplace can't fully serve it yet).
insert into public.event_requirements (event_type_slug, item_name, category_slug, priority, contextual_label, sort_order) values
  ('wellness-retreat', 'Venue', 'venues', 'P1', 'Resort or retreat center', 1),
  ('wellness-retreat', 'Caterer', 'catering', 'P1', 'Wellness-friendly menu', 2),
  ('wellness-retreat', 'Guest accommodation', 'guest-accommodation', 'P2', 'Multi-day stay for attendees', 10),
  ('wellness-retreat', 'Invitations', 'invitations', 'P2', null, 11),
  ('wellness-retreat', 'Event coordinator', 'event-planning', 'P3', 'Yoga/wellness instructor or facilitator — no dedicated Wellness/Spa vendor category exists yet, closest real category used', 20);

-- team-offsite: same shape, same facilitator caveat.
insert into public.event_requirements (event_type_slug, item_name, category_slug, priority, contextual_label, sort_order) values
  ('team-offsite', 'Venue', 'venues', 'P1', 'Offsite venue or resort', 1),
  ('team-offsite', 'Caterer', 'catering', 'P1', null, 2),
  ('team-offsite', 'Guest accommodation', 'guest-accommodation', 'P2', 'If a multi-day offsite', 10),
  ('team-offsite', 'Invitations', 'invitations', 'P2', null, 11),
  ('team-offsite', 'Event coordinator', 'event-planning', 'P3', 'Team-building activity facilitator — no dedicated facilitator vendor category exists yet, closest real category used', 20);

-- 4. event_todo_templates — type-scoped additions only where the (now
--    tone-filtered) universal set genuinely doesn't cover a real need.
--    'other' and 'wellness-retreat'/'team-offsite' generic logistics are
--    already covered by the universal set; funeral-last-rites keeps almost
--    all of it too (budget/guest_list/invites/rsvp/transport/thankyou/
--    vendor_chat/venue/catering/photography all still apply) — just add the
--    one real gap, priest/officiant coordination.
insert into public.event_todo_templates (event_type_slug, section, category, title, sort_order) values
  ('funeral-last-rites', 'vendors', 'priest_coordination', 'Coordinate priest / officiant for the rites', 2);

insert into public.event_todo_templates (event_type_slug, section, category, title, sort_order) values
  ('wellness-retreat', 'vendors', 'wellness_facilitator', 'Book yoga / wellness instructor or retreat facilitator', 2);

insert into public.event_todo_templates (event_type_slug, section, category, title, sort_order) values
  ('team-offsite', 'vendors', 'activity_facilitator', 'Book team-building activity facilitator', 2);
