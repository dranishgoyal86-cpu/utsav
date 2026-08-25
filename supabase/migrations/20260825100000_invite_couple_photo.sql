-- Wave 4, Task 1 — couple's photo pane. Verified live before writing this:
-- event_invite_content (Wave 1's partner_1_name/partner_2_name/hosted_by
-- table) has no photo-related column yet, so this is new, not a rename.
alter table public.event_invite_content add column if not exists couple_photo_url text;
alter table public.event_invite_content add column if not exists couple_quote text;
