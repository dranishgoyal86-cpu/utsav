-- Wave 9 — per-function design cards. Additive only, both nullable.
-- null template_id = inherit the event's overall design (event_invite_content
-- .template_id) exactly as today; every existing function keeps its current
-- compact-row behavior with zero migration risk to real data.
-- headline_text: host-editable override for a design's large headline (e.g.
-- Night Bloom) — same optional-override shape as event_invite_content
-- .kicker_text (Wave 8/Ivory). Falls back to the function's own name when null.
alter table public.event_functions add column if not exists template_id text;
alter table public.event_functions add column if not exists headline_text text;
