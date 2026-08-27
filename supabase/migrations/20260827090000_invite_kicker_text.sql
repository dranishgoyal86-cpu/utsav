-- Wave 8 (Ivory) — the mockup's "SAVE THE DATE" is wrong for every
-- tradition where the invite itself carries full details, not just an
-- early heads-up (same lesson as Toran's "weds" needing to become
-- configurable). Real, nullable, host-editable field rather than a fixed
-- string. Only Ivory reads/writes this today (Toran/Kalamkari/Stillness
-- keep their own fixed kickers, untouched, per this wave's scope) — but
-- it's a generic column name, not ivory-specific, so extending kicker
-- customization to another design later needs no schema change.
alter table public.event_invite_content add column if not exists kicker_text text;
