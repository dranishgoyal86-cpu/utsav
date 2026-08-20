-- Capability resolver: makes feature visibility data-driven instead of
-- hardcoded. capability_key strings and category labels below follow the
-- same informal/legacy vocabulary already used in event_requirements.sql
-- (e.g. 'Photographers' rather than the current vendorTaxonomy.js subcategory
-- name 'Event Photography') — precise alignment with the real marketplace
-- taxonomy is a Phase 2 concern, same call made for event_requirements.
--
-- event_type_slugs below use the live event_type_slug vocabulary
-- (lib/eventTypeNames.js's EVENT_TYPE_NAMES). This file originally used four
-- slugs from the app's old, largely-abandoned event_types table
-- (corporate-event, godh-bharai, griha-pravesh, satyanarayan-katha) that
-- lib/eventTypeNames.js's own header comment already documents as having
-- zero matching event_requirements rows today — dead vocabulary no real
-- event.event_type_slug value has ever equaled. Fixed to their real
-- equivalents before this migration was ever run (confirmed live: this
-- table doesn't exist yet, so no data migration is needed): corporate-event
-- -> corporate-conference, godh-bharai -> baby-shower, griha-pravesh ->
-- housewarming, satyanarayan-katha -> religious-event.

-- ============================================================
-- events: physical venue type + dry/veg flags
-- ============================================================
alter table public.events add column if not exists venue_type text;
alter table public.events add column if not exists is_dry_event boolean default false;
alter table public.events add column if not exists is_veg_only boolean default false;

-- ============================================================
-- capability_rules — customer-facing feature visibility
-- ============================================================
create table if not exists public.capability_rules (
  id uuid default gen_random_uuid() primary key,
  capability_key text not null unique,
  name text not null,
  group_key text,
  priority int4 not null default 0,
  visibility text not null default 'gated' check (visibility in ('always', 'gated', 'secondary')),
  venue_types text[],
  event_type_slugs text[],
  excluded_event_type_slugs text[],
  min_guest_count int4,
  max_guest_count int4,
  min_age int4,
  max_age int4,
  contextual_labels jsonb not null default '{}'::jsonb,
  requires_budget boolean not null default false,
  requires_sub_events boolean not null default false,
  requires_booking boolean not null default false,
  requires_completed_booking boolean not null default false,
  suppressed_when_dry boolean not null default false,
  suppressed_when_veg boolean not null default false,
  description text,
  created_at timestamp with time zone default now()
);

alter table public.capability_rules enable row level security;

create policy "Anyone can read capability rules"
  on public.capability_rules for select
  using (true);

create policy "Admins manage capability rules"
  on public.capability_rules for all
  using (exists (select 1 from public.users where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.users where id = auth.uid() and is_admin = true));

create index if not exists idx_capability_rules_group on public.capability_rules(group_key);

-- ============================================================
-- provider_capability_rules — provider-facing form/dashboard features
-- ============================================================
create table if not exists public.provider_capability_rules (
  id uuid default gen_random_uuid() primary key,
  capability_key text not null unique,
  name text not null,
  categories text[],
  min_service_price int4,
  requires_verified boolean not null default false,
  min_completed_bookings int4,
  config_value int4,
  description text,
  created_at timestamp with time zone default now()
);

alter table public.provider_capability_rules enable row level security;

create policy "Anyone can read provider capability rules"
  on public.provider_capability_rules for select
  using (true);

create policy "Admins manage provider capability rules"
  on public.provider_capability_rules for all
  using (exists (select 1 from public.users where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.users where id = auth.uid() and is_admin = true));

-- ============================================================
-- Seed: capability_rules
-- ============================================================
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
  -- Entry control (mutually exclusive via group_key, highest priority wins)
  ('society_gate_pass', 'Society Gate Pass', 'entry_control', 100, 'gated',
    array['society_flat','society_clubhouse'], null::text[], null::text[], null, null, null, null,
    '{}', false, false, false, false, false, false,
    'QR gate passes for a housing-society flat or clubhouse venue'),
  ('venue_attendance_qr', 'Venue Attendance QR', 'entry_control', 90, 'gated',
    array['banquet_hall','farmhouse','hotel','outdoor'], null, null, 30, null, null, null,
    '{}', false, false, false, false, false, false,
    'QR check-in for larger commercial/rented venues'),
  ('corporate_visitor_register', 'Corporate Visitor Register', 'entry_control', 80, 'gated',
    array['office'], null, null, null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Visitor sign-in list for an office venue'),
  ('no_entry_control', 'No Entry Control', 'entry_control', 10, 'gated',
    array['independent_house','temple'], null, null, null, null, null, null,
    '{}', false, false, false, false, false, false,
    'Fallback: no gate/attendance tracking needed'),

  -- Guest management
  ('guest_list', 'Guest List', null, 0, 'always',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false, 'Core guest list, always available'),
  ('rsvp_tracking', 'RSVP Tracking', null, 0, 'gated',
    null, null, null, 15, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('digital_invites', 'Digital Invites', null, 0, 'gated',
    null, null, array['corporate-conference'], null, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('family_groups', 'Family Groups', null, 0, 'gated',
    null, null, array['corporate-conference'], null, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('seating_chart', 'Seating Chart', null, 0, 'gated',
    null, array['hindu-wedding','engagement','anniversary','corporate-conference'], null, 50, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('meal_preferences', 'Meal Preferences', null, 0, 'gated',
    null, null, null, 30, null, null, null,
    '{"religious-event":"Satvik and Jain count","housewarming":"Satvik and Jain count","mundan":"Satvik and Jain count"}',
    false, false, false, false, false, false, null),
  ('vip_flagging', 'VIP Flagging', null, 0, 'secondary',
    null, array['hindu-wedding','engagement','corporate-conference'], null, null, null, null, null,
    '{}', false, false, false, false, false, false, null),

  -- Gifts
  ('gift_register', 'Gift Register', null, 0, 'gated',
    null, array['hindu-wedding','engagement','baby-shower','mundan','housewarming','anniversary'], null, null, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('gift_qr_stickers', 'Gift QR Stickers', null, 0, 'gated',
    null, array['hindu-wedding','engagement','baby-shower','mundan','housewarming','anniversary'], null, 50, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('return_gifts', 'Return Gifts', null, 0, 'gated',
    null, array['kids-birthday','baby-shower','hindu-wedding','engagement','religious-event','housewarming','mundan'], null, null, null, null, null,
    '{"religious-event":"Prasad distribution","housewarming":"Prasad distribution","mundan":"Prasad distribution"}',
    false, false, false, false, false, false, null),
  ('reciprocity_ledger', 'Reciprocity Ledger', null, 0, 'secondary',
    null, array['hindu-wedding','engagement'], null, null, null, null, null,
    '{}', false, false, false, false, false, false, null),

  -- Photos
  ('photo_album', 'Photo Album', null, 0, 'always',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('face_recognition', 'Face Recognition Search', null, 0, 'gated',
    null, null, null, 40, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('album_share_link', 'Album Share Link', null, 0, 'always',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false, null),

  -- Planning
  ('vendor_checklist', 'Vendor Checklist', null, 0, 'always',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('budget_planner', 'Budget Planner', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', true, false, false, false, false, false, null),
  ('sub_event_timeline', 'Sub-event Timeline', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, true, false, false, false, false, null),
  ('ai_planner', 'AI Planner', null, 0, 'always',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false, null),

  -- Vendor interaction
  ('search_booking', 'Search & Booking', null, 0, 'always',
    null, null, null, null, null, null, null,
    '{}', false, false, false, false, false, false, null),
  ('chat', 'Chat with Vendor', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, false, true, false, false, false, null),
  ('write_review', 'Write a Review', null, 0, 'gated',
    null, null, null, null, null, null, null,
    '{}', false, false, false, true, false, false, null),
  ('bar_vendors', 'Bar & Alcohol Vendors', null, 0, 'gated',
    null, null, array['religious-event','housewarming','mundan','kids-birthday'], null, null, null, null,
    '{}', false, false, false, false, true, false, null)
) as v(
  capability_key, name, group_key, priority, visibility, venue_types,
  event_type_slugs, excluded_event_type_slugs, min_guest_count, max_guest_count,
  min_age, max_age, contextual_labels, requires_budget, requires_sub_events,
  requires_booking, requires_completed_booking, suppressed_when_dry, suppressed_when_veg,
  description
)
on conflict (capability_key) do nothing;

-- ============================================================
-- Seed: provider_capability_rules
-- ============================================================
insert into public.provider_capability_rules (
  capability_key, name, categories, min_service_price, requires_verified,
  min_completed_bookings, config_value, description
)
select
  v.capability_key, v.name, v.categories, v.min_service_price::int4, v.requires_verified,
  v.min_completed_bookings::int4, v.config_value::int4, v.description
from (values
  ('menu_builder', 'Menu Builder', array['Caterers','Prasad Caterer'], null, false, null, null, null),
  ('dietary_certification', 'Dietary Certification', array['Caterers','Prasad Caterer','Cake'], null, false, null, null, null),
  ('package_tiers', 'Package Tiers', array['Photographers','Videography','Decorators','Makeup'], null, false, null, null, null),
  ('portfolio_video', 'Portfolio Video', array['Photographers','Videography','Choreographer','DJ & Music','Dhol'], null, false, null, null, null),
  ('equipment_inventory', 'Equipment Inventory', array['Sound System','Lighting','Tent House','Generator'], null, false, null, null, null),
  ('team_size', 'Team Size', array['Caterers','Tent House','Decorators'], null, false, null, null, null),
  ('muhurat_availability', 'Muhurat Availability', array['Pandit'], null, false, null, null, null),
  ('age_range_served', 'Age Range Served', array['Mascot','Game Host','Magician','Face Painter','Puppet Show','Science Show'], null, false, null, null, null),
  ('travel_radius', 'Travel Radius', array['Tent House','Sound System','Lighting','Generator','Bouncy Castle'], null, false, null, null, null),
  ('sub_event_tagging', 'Sub-event Tagging', array['Decorators','Caterers','Photographers','DJ & Music','Makeup','Lighting'], null, false, null, null, null),
  ('advance_policy', 'Advance Payment Policy', null, 25000, false, null, null, null),
  ('featured_listing', 'Featured Listing', null, null, true, 5, null, null),
  ('analytics_dashboard', 'Analytics Dashboard', null, null, false, 10, null, null),
  ('portfolio_slots_extended', 'Extended Portfolio Slots', array['Photographers','Videography','Decorators','Makeup','Mehendi'], null, false, null, 40, null)
) as v(
  capability_key, name, categories, min_service_price, requires_verified,
  min_completed_bookings, config_value, description
)
on conflict (capability_key) do nothing;
