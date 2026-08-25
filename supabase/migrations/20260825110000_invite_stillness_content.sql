-- Wave 6 (Stillness) — a memorial/prayer-meeting invite has no "partners,"
-- so it needs its own nullable fields rather than being forced onto
-- partner_1_name/partner_2_name. subject_name is split into two explicit
-- line fields (not one field with wrap logic) so the host controls the
-- line break, matching the reference's "two lines if needed, not forced
-- onto one." All nullable, purely additive — same shape as Wave 4's
-- couple_photo_url/couple_quote addition to this same table.
alter table public.event_invite_content add column if not exists subject_name_line1 text;
alter table public.event_invite_content add column if not exists subject_name_line2 text;
alter table public.event_invite_content add column if not exists subject_years text;
alter table public.event_invite_content add column if not exists detail_line1 text;
alter table public.event_invite_content add column if not exists detail_line2 text;
