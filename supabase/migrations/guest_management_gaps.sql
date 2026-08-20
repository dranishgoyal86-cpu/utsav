-- Consolidated migration for the 4-part guest-management gap-closing task.
-- All columns verified live via information_schema.columns before writing
-- this — none existed. No new RLS-sensitive write paths here (all four
-- columns are written by the HOST from their own session, which
-- event_invitees' existing "Owner manages invitees" policy already covers
-- — unlike the earlier phone-linking/geofence-opt-in work, none of this
-- needs a SECURITY DEFINER RPC).

-- Part 1a: RSVP reminder nudges — mirrors invite_sent_at's existing shape.
alter table public.event_invitees add column if not exists rsvp_reminder_sent_at timestamptz;

-- Part 1b: plus-one cap — event-wide default only (no evidence anywhere in
-- this codebase of per-guest limits being modeled; going with the simpler
-- of the two options per the task brief's own guidance). Null = unlimited
-- (today's actual behavior, so existing events don't suddenly gain a cap).
alter table public.events add column if not exists default_plus_one_limit integer;

-- Part 4b: thank-you note tracking — mirrors invite_sent_at/
-- rsvp_reminder_sent_at's shape.
alter table public.event_invitees add column if not exists thank_you_sent_at timestamptz;
