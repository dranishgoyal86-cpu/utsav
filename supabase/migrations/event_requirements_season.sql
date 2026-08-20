-- Two real, sensible season-relevant seed rows — a starting point, not a
-- comprehensive season taxonomy (deliberately small per the task brief).
-- Matches the live event_requirements convention confirmed before writing
-- this: every condition_flag row is scoped to a specific event_type_slug
-- (never null) — checked live, all 9 existing condition_flag rows follow
-- this. Both new rows use real vendor_categories slugs (confirmed live:
-- 'tent-mandap', 'power-utilities' both exist) rather than inventing ones
-- with no real marketplace listings behind them.
--
-- Sits alongside the existing 'is_outdoor' row (same category_slug
-- tent-mandap, item_name 'Weather backup', P5) — distinct item_name so
-- resolveRequirements()'s item_name dedup doesn't collide the two; a
-- monsoon outdoor wedding can and should show both.
insert into public.event_requirements
  (event_type_slug, sub_event_slug, item_name, category_slug, priority, contextual_label, condition_flag, sort_order)
values
  ('hindu-wedding', null, 'Rain cover / weather tent', 'tent-mandap', 'P4', 'Monsoon-season backup', 'is_monsoon', 43),
  ('hindu-wedding', null, 'Extra cooling', 'power-utilities', 'P4', 'Fans / AC for summer-season guests', 'is_summer', 44);
