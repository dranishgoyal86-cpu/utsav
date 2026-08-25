-- Wave 1, Task 5: rate limiting on guest-facing code lookups (pass_code via
-- guest-pass, invite_code via submit-rsvp). Deliberately failure-counted,
-- not volume-counted — see the task brief's own reasoning: dozens of real
-- wedding guests on shared venue/hotel wifi must never get locked out by a
-- volume limiter, only repeated *failures* from one source should throttle.
--
-- identifier is a SHA-256 hash of the caller's IP (+ a server secret salt),
-- never the raw IP — this table only needs to know "same source repeating,"
-- not who that source is. Table-based, not Upstash/Redis (Supabase's own
-- recommended pattern): this project has no existing Redis infrastructure,
-- and traffic at wedding-guest-list scale doesn't need it.
create table if not exists public.guest_code_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  action text not null,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists guest_code_attempts_lookup_idx
  on public.guest_code_attempts (identifier, action, created_at);

-- No RLS policy of any kind: this table is written and read exclusively by
-- edge functions' service-role clients, never by anon/authenticated
-- clients directly, same access model as every other guest-facing write in
-- this codebase. RLS enabled anyway, as a default-deny backstop matching
-- the pattern on every other table in this project.
alter table public.guest_code_attempts enable row level security;

-- Cleanup: a single DELETE, no edge function needed — pg_cron's own
-- simplest, most common use case. The two existing cron jobs in this
-- codebase (anonymize-guests-daily, purge-deleted-accounts) call an edge
-- function only because their cleanup logic is genuinely multi-table; this
-- one line doesn't need that indirection.
select cron.schedule(
  'guest-code-attempts-cleanup',
  '30 4 * * *', -- daily, off-peak, staggered from the other two daily jobs
  $$ delete from public.guest_code_attempts where created_at < now() - interval '48 hours'; $$
);

-- anonymize_guest_row() note: this table is keyed by hashed IP, never by
-- invitee_id/guest identity, and has no FK to event_invitees or any guest
-- table — confirmed by its own schema above. It does not intersect with
-- guest anonymization at all; no change needed there.
