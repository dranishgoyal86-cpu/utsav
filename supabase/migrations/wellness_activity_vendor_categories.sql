-- Wellness/Spa + Activity-Facilitator vendor categories, and the
-- wellness-retreat/team-offsite event_requirements fix. Paste into the
-- Supabase SQL editor — not executed automatically (standing convention).
--
-- IMPORTANT CONTEXT (see conversation): this only fixes the PRICING side
-- (vendor_categories/category_aliases/event_requirements, which power the
-- host-facing "Essentials" budget list). The provider- and customer-facing
-- picker (AddServiceScreen.js, DiscoverScreen.js, CategoryList.js) reads
-- from a totally separate, code-only taxonomy in vendorTaxonomy.js, not
-- from this table at all — that side was already fixed directly in
-- vendorTaxonomy.js (added "Yoga Instructors" / "Meditation & Mindfulness"
-- / "Wellness Retreat Coordinators" under the existing "Beauty & Wellness"
-- parent, and "Corporate Trainers" / "Outdoor & Adventure Activities"
-- under the existing "Corporate Event Services" parent, which already had
-- "Team Building Activities"). No SQL needed for that part.

-- 1. New vendor_categories rows, same shape/domain-grouping convention as
--    the existing 54 rows.
insert into public.vendor_categories
  (slug, name, domain, pricing_model, unit_label, metro_low, metro_high, tier2_low, tier2_high, quote_on_request, price_from_listings, sort_order)
values
  ('wellness-spa', 'Wellness & Spa', 'personal-care', 'per_unit', 'per session', 800, 5000, 500, 3000, false, false, 73),
  ('activity-facilitators', 'Activity Facilitators / Team Building', 'entertainment', 'per_day', 'per day', 15000, 80000, 8000, 40000, false, false, 50);

-- 2. category_aliases — realistic search terms, same pattern as the
--    existing "resort" -> venues alias. NOTE (see conversation): this
--    table is currently fetched by hooks/useEventPlan.js but its resolver
--    (lib/eventResolver.js's resolveAlias()) is not actually called by any
--    live screen today — confirmed by grep, only exercised by
--    scripts/verifyPlanEngine.js's own test. Adding these rows is safe and
--    keeps the data complete for whenever that matching gets wired up, but
--    it will NOT change search results or price-estimate matching today.
insert into public.category_aliases (category_slug, alias) values
  ('wellness-spa', 'yoga'),
  ('wellness-spa', 'meditation'),
  ('wellness-spa', 'wellness'),
  ('wellness-spa', 'spa'),
  ('activity-facilitators', 'team building'),
  ('activity-facilitators', 'icebreaker'),
  ('activity-facilitators', 'outdoor activities'),
  ('activity-facilitators', 'corporate trainer'),
  ('activity-facilitators', 'adventure activities');

-- 3. Fix the wellness-retreat/team-offsite event_requirements rows from
--    the last task, which pointed at 'event-planning' as an imprecise
--    stand-in (flagged explicitly in that migration's contextual_label).
--    Matched by event_type_slug + the exact item_name/category_slug/
--    sort_order those rows were created with, not guessed at.
update public.event_requirements
set category_slug = 'wellness-spa',
    item_name = 'Yoga/wellness instructor',
    contextual_label = 'Retreat facilitator or instructor'
where event_type_slug = 'wellness-retreat'
  and category_slug = 'event-planning'
  and item_name = 'Event coordinator'
  and sort_order = 20;

update public.event_requirements
set category_slug = 'activity-facilitators',
    item_name = 'Activity facilitator',
    contextual_label = 'Team-building activity facilitator'
where event_type_slug = 'team-offsite'
  and category_slug = 'event-planning'
  and item_name = 'Event coordinator'
  and sort_order = 20;
