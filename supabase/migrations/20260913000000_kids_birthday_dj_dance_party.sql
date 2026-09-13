-- Adds a "DJ / Dance Party" entertainment option to the kids-birthday
-- checklist. adult-birthday already has a DJ item (category_slug
-- 'dj-music', see event_requirements.sql line ~178) but kids-birthday never
-- did — a real, live gap (part of the Birthday Event Improvement plan,
-- Piece 1: see the project doc claude/birthday-event-improvement-plan.md).
--
-- Reuses the same category_slug ('dj-music') as adult-birthday's DJ item
-- rather than lumping it under the generic 'kids-entertainment' slug, so it
-- matches the same real "DJs" vendor subcategory in the marketplace
-- (ItemDetail.js's resolveMatchKey) instead of returning no vendors.
--
-- Age-gated 5+ (min_age only, no max) — a dance session isn't typically
-- something a first-birthday or toddler party books, same reasoning/shape
-- as the existing 'Games host' (min_age 4) and 'Live cartoon artist'
-- (min_age 4) rows just above it.
--
-- sort_order 30 — placed after the existing P3 entertainment rows (20-29:
-- Face painting through Ice cream cart) without renumbering any of them,
-- same gap-tolerant convention already used between this table's P3 (ends
-- at 29) and P4 (starts at 40) tiers.
insert into event_requirements (
  event_type_slug, sub_event_slug, item_name, category_slug, priority, contextual_label,
  min_guest_count, max_guest_count, min_age, max_age, condition_flag,
  suppressed_when_dry, suppressed_when_veg, sort_order
) values
  ('kids-birthday', null, 'DJ / Dance Party', 'dj-music', 'P3', 'Music and a dance session for the kids', null, null, 5, null, null, false, false, 30);
