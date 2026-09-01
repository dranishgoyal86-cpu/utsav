-- Invite schema foundation — two purely additive pieces, per the invite-
-- architecture brief.
--
-- 1) event_invite_content.schema_content: one JSONB column for future
--    semantic invite-content fields that have no better canonical home
--    (invocation text, family display wording, custom ceremony
--    descriptions, etc. — see lib/inviteSchemas/fields.js's fields with
--    legacyColumn: null). All 12 existing named columns (partner_1_name,
--    partner_2_name, hosted_by, couple_photo_url, couple_quote,
--    subject_name_line1, subject_name_line2, subject_years, detail_line1,
--    detail_line2, kicker_text, headline_text) are left exactly as they
--    are — untouched, still the read/write path for the 5 already-shipped
--    designs (Toran/Kalamkari/Stillness/Ivory/Diya) and for the
--    separately-deployed theutsavapp.com/invite/[code] guest page, which
--    this repo does not control and must not risk breaking.
alter table public.event_invite_content add column if not exists schema_content jsonb not null default '{}'::jsonb;

-- 2) capability_rules — 8 new rows for the invite-architecture brief's
--    "operational module" concepts that had no existing capability_key at
--    all (verified live before writing this: 26 existing rows, none of
--    these 8 keys present). Three other named concepts (maps aside) —
--    gallery, gifts, gate pass — already have an existing key/group and
--    get NO new row here; see lib/eventCapabilities.js's own comment for
--    the full mapping and the reasoning per concept. Same idempotent
--    `on conflict (capability_key) do nothing` pattern capabilities.sql's
--    own seed already uses.
--
-- Deliberately NOT excluding funeral-last-rites via event_type_slugs on
-- any of these rows (including countdown) — the brief's non-festive
-- suppression is enforced in ONE place, lib/inviteSchemas's isNonFestive()
-- resolver, not duplicated here as a second, potentially-drifting
-- capability_rules exclusion list. See lib/eventCapabilities.js.
insert into public.capability_rules (
  capability_key, name, group_key, priority, visibility, venue_types,
  event_type_slugs, excluded_event_type_slugs, min_guest_count, max_guest_count,
  min_age, max_age, contextual_labels, requires_budget, requires_sub_events,
  requires_booking, requires_completed_booking, suppressed_when_dry, suppressed_when_veg,
  description
)
select
  v.capability_key, v.name, v.group_key, v.priority::int4, v.visibility, v.venue_types,
  v.event_type_slugs, v.excluded_event_type_slugs, v.min_guest_count::int4, v.max_guest_count::int4,
  v.min_age::int4, v.max_age::int4, v.contextual_labels::jsonb, v.requires_budget, v.requires_sub_events,
  v.requires_booking, v.requires_completed_booking, v.suppressed_when_dry, v.suppressed_when_veg,
  v.description
from (values
  ('maps', 'Maps & Location', null, 0, 'always',
    null::text[], null::text[], null::text[], null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Venue location / Google Maps link on the guest-facing invite'),
  -- requires_sub_events reuses the exact existing context flag
  -- sub_event_timeline already gates on (context.hasSubEvents) — per-
  -- function RSVP is meaningful once an event actually has functions
  -- defined, the same precondition that flag already means.
  ('per_function_rsvp', 'Per-Function RSVP', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, true, false, false, false, false,
    'Guests RSVP separately per function/ceremony, not just once for the whole event'),
  ('travel_coordination', 'Travel Coordination', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Outstation guest arrival/departure/flight-train details'),
  ('accommodation_coordination', 'Accommodation Coordination', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Hotel/stay block assignment for outstation guests'),
  ('transport_pickup', 'Transport / Pickup', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Local pickup coordination for arriving guests'),
  ('wishing_wall', 'Wishing Wall', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Guest-visible message wall — available for every event type; wording tone (celebratory vs. solemn) is resolved separately via lib/inviteSchemas isNonFestive(), not by excluding this capability'),
  ('countdown', 'Countdown', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Days-until-event countdown hero — availability only; non-festive suppression enforced via lib/inviteSchemas isNonFestive(), see PlanView.js'),
  ('dress_code', 'Dress Code', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Host-set dress-code note shown to guests')
) as v(
  capability_key, name, group_key, priority, visibility, venue_types,
  event_type_slugs, excluded_event_type_slugs, min_guest_count, max_guest_count,
  min_age, max_age, contextual_labels, requires_budget, requires_sub_events,
  requires_booking, requires_completed_booking, suppressed_when_dry, suppressed_when_veg,
  description
)
on conflict (capability_key) do nothing;
