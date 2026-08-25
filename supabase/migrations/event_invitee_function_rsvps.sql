-- Wave 1: per-function RSVP + making guest_passes.pass_code globally unique.
--
-- pass_code fix: was unique(event_id, pass_code) only — safe while pass_code
-- only mattered for gate check-in (one event, one day). Wave 1 repurposes it
-- as the actual invite credential distributed via WhatsApp, forwarded and
-- screenshotted indefinitely — a cross-event collision now means "wrong
-- person's invite," not just an annoyance. Verified live before writing
-- this: 0 existing guest_passes rows today, so this ALTER is guaranteed
-- safe to apply (no existing duplicates to violate the new constraint).
alter table public.guest_passes
  add constraint guest_passes_pass_code_unique unique (pass_code);
-- The pre-existing (event_id, pass_code) unique constraint is now redundant
-- (global uniqueness implies per-event uniqueness) but left in place —
-- harmless, not worth the risk of dropping a constraint on a live table.

-- Per-function guest RSVP. Verified live against the real event_functions/
-- event_invitee_functions schema before writing this (see Task 1 report):
-- event_functions.id and event_invitee_functions(invitee_id, function_id)
-- are exactly as assumed, no adjustments needed.
create table if not exists public.event_invitee_function_rsvps (
  id uuid primary key default gen_random_uuid(),
  invitee_id uuid not null references public.event_invitees(id) on delete cascade,
  function_id uuid not null references public.event_functions(id) on delete cascade,
  status text not null default 'pending', -- 'yes' | 'no' | 'pending'
  responded_at timestamptz,
  rsvp_source text, -- 'guest_self' | 'host_logged', same convention as event_invitees.rsvp_source
  created_at timestamptz not null default now(),
  unique (invitee_id, function_id)
);
create index if not exists event_invitee_function_rsvps_function_idx
  on public.event_invitee_function_rsvps(function_id);

alter table public.event_invitee_function_rsvps enable row level security;

-- Host/delegate read-write, mirroring event_invitee_functions' own two
-- policies exactly (event_delegates.sql:172-191) — same "no direct event_id
-- column, goes through the invitee's owner" shape. No guest-facing
-- SELECT/INSERT policy here, by design: guest access goes through
-- guest-pass's service-role client (Task 0's decision), same as every
-- other guest-writable table in this codebase.
create policy "Hosts manage own invitee function rsvps"
  on public.event_invitee_function_rsvps for all
  using (invitee_id in (select id from public.event_invitees where owner_user_id = auth.uid()))
  with check (invitee_id in (select id from public.event_invitees where owner_user_id = auth.uid()));

create policy "Delegates manage invitee function rsvps"
  on public.event_invitee_function_rsvps for all
  using (
    exists (
      select 1 from public.event_invitees ei
      join public.event_delegates d on d.event_id = ei.event_id
      where ei.id = event_invitee_function_rsvps.invitee_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_invitees ei
      join public.event_delegates d on d.event_id = ei.event_id
      where ei.id = event_invitee_function_rsvps.invitee_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );

-- anonymize_guest_row() deliberately NOT updated: this table's `status` is
-- the same kind of data as event_invitees.rsvp_status, which
-- anonymize_guest_row() already documents as AGGREGATE-SAFE and keeps
-- indefinitely. And since anonymization patches columns on the
-- event_invitees row rather than deleting it, this table's rows (FK'd via
-- on delete cascade) are never touched by anonymization either way — no
-- cascade/cleanup gap exists to fix here.
