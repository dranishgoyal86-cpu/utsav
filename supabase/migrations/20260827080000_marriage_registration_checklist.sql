-- Wave 7 follow-up: the one confirmed real, generic gap in the 26 universal
-- checklist items. Legal marriage registration is a procedural/legal fact,
-- not a ceremonial one - safe to write without specialized cultural
-- knowledge, unlike ceremony-specific content (deliberately not written
-- here, see the note at the bottom of this file).
--
-- Not inserted as a single event_type_slug=null row despite that being how
-- the existing 26 items work: null means "every event type in the app,"
-- not "every wedding type" - there's no array/tags column on this table to
-- express "these 7 slugs specifically." A single universal row would put
-- marriage-registration on a birthday or corporate-conference checklist,
-- which makes no sense. Confirmed with the user before building: 7
-- identical rows, one per wedding slug, is the correct (if repetitive)
-- way to express this given the schema's real constraints.
insert into public.event_todo_templates (event_type_slug, section, category, title, item_type, kind, sort_order) values
  ('hindu-wedding', 'venue', 'legal_registration', 'Complete legal marriage registration', 'manual', 'task', 4),
  ('nikah', 'venue', 'legal_registration', 'Complete legal marriage registration', 'manual', 'task', 4),
  ('anand-karaj', 'venue', 'legal_registration', 'Complete legal marriage registration', 'manual', 'task', 4),
  ('christian-wedding', 'venue', 'legal_registration', 'Complete legal marriage registration', 'manual', 'task', 4),
  ('parsi-wedding', 'venue', 'legal_registration', 'Complete legal marriage registration', 'manual', 'task', 4),
  ('jain-wedding', 'venue', 'legal_registration', 'Complete legal marriage registration', 'manual', 'task', 4),
  ('interfaith-wedding', 'venue', 'legal_registration', 'Complete legal marriage registration', 'manual', 'task', 4);

-- ── DEFERRED CONTENT — DO NOT FILL IN SILENTLY ──────────────────────────
-- Tradition-specific ceremonial checklist content for nikah, anand-karaj,
-- christian-wedding, parsi-wedding, jain-wedding, interfaith-wedding is
-- intentionally not written. Do not add AI-generated religious/ceremonial
-- content here - this needs real, community-sourced input before being
-- added. The generic layer (this file, plus the existing 26 universal
-- items) is the only checklist content these six traditions have, on
-- purpose, until that input exists.
