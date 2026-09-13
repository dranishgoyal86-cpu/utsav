-- Birthday Event Improvement plan — menu planner rebuild (Piece 5 revision).
-- Additive only: 20260913030000_event_menu.sql already ran, so this is a
-- NEW migration rather than an edit to that file.
--
-- The rebuilt planner replaces the old 3/4/5-course-size model with a
-- Food Type -> Cuisine -> Category -> Dish flow (lib/menuLibrary.js), and
-- adds a per-pick Price/Quantity/Notes and a free-text custom-dish option
-- per category (both explicitly requested). None of that fits the old
-- event_menu_selections columns, so:
--   food_type   — which of lib/menuLibrary.js's FOOD_TYPES chip the host
--                 had selected when they added this dish (nullable — old
--                 rows from before this migration won't have one).
--   price       — numeric, host's own estimate/quote for this item.
--   quantity    — free text ("50 plates", "2 kg", "for 80 guests") rather
--                 than a number+unit pair — caterers quote quantity in
--                 whatever unit fits the dish, so forcing a single numeric
--                 unit would be less useful, not more.
--   notes       - free text per pick (spice level, dietary notes,
--                 "ask for extra chutney", etc.) — this is also where the
--                 spice/dairy/nut/gluten/prep-style/meal-time detail from
--                 Anish's filter list lives, since tagging ~150 catalog
--                 dishes with those would mean guessing, not real data.
--   is_custom   — true for a dish the host typed in themselves rather than
--                 picked from lib/menuLibrary.js's DISH_CATALOG (the
--                 "add your own dish" ask) — lets the UI distinguish a
--                 free-text pick without needing a magic cuisine_slug.
--
-- course_category/cuisine_slug stay as-is: the rebuilt UI now writes
-- lib/menuLibrary.js's new category/cuisine slugs into those same
-- columns (cuisine_slug is nullable in practice going forward, since many
-- dishes in the new catalog have no forced cuisine — handled at the app
-- layer, not enforced here to avoid touching the already-applied
-- not-null constraint from the prior migration).
alter table event_menu_selections
  add column if not exists food_type text,
  add column if not exists price numeric,
  add column if not exists quantity text,
  add column if not exists notes text,
  add column if not exists is_custom boolean not null default false;
