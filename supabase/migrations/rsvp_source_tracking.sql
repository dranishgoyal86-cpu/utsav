-- Distinguishes "guest confirmed this themselves" from "host is logging
-- this on the guest's behalf" for both RSVP status and check-in — verified
-- live via information_schema.columns that event_invitees has no existing
-- source/provenance column for RSVP (checkin_source already exists, added
-- in an earlier task, and needs no schema change — verified via
-- pg_constraint that it has no CHECK constraint restricting its values, so
-- the new 'host_manual' value is just a new string, not a migration).
alter table public.event_invitees add column if not exists rsvp_source text;
-- expected values: 'guest_self' | 'host_logged' | null (unset/legacy)
alter table public.event_invitees add column if not exists host_logged_note text;
-- optional free-text context a host can attach when logging on a guest's
-- behalf, e.g. "Called Aug 10, confirmed coming with 2 kids" — never
-- required, never shown to other guests (host-only screen, same RLS as
-- every other event_invitees field).
