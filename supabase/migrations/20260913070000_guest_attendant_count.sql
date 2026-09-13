-- "include nanny or any attendant marked as separate in RSVP rather than
-- hard cap" — a guest RSVPing may bring support staff (nanny, caretaker,
-- driver) alongside their invited party. This is informational only, not
-- a cap: it's tracked separately from plus_ones so it never eats into a
-- host's plus-one limit, but still counts toward real headcount for
-- catering/gate-pass purposes.
--
-- Deliberately NOT reusing guest_accompanying (see supabase/migrations for
-- that table) — that table is purpose-built for outstation travel
-- companions who need a govt-ID doc uploaded for hotel/logistics purposes,
-- gated behind the "I'm travelling from out of town" checkbox on the RSVP
-- screen. A nanny/attendant is a different concept (no ID doc needed,
-- shown on every RSVP regardless of outstation status), so it gets its
-- own simple counter column instead of overloading that table's meaning.
alter table event_invitees
  add column if not exists attendant_count integer not null default 0;
