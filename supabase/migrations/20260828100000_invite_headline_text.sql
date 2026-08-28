-- Wave 10 (Diya) — event-level headline override, same optional-override
-- shape as event_invite_content.kicker_text (Wave 8) and
-- event_functions.headline_text (Wave 9). Diya has no couple/subject name
-- fields to fall back on (it's the first non-wedding design), so its
-- headline defaults to the event's own real name (events.name) when this
-- is null, resolved client-side same as every other default in this system
-- — never a fixed occasion-specific string like "Our new beginning".
alter table public.event_invite_content add column if not exists headline_text text;
