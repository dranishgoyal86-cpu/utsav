-- Outstation guest travel/stay coordination — additive layer, most events
-- never touch it. Verified live before writing this: no accommodation/
-- hotel/travel/arrival/pickup/departure/room columns exist anywhere in the
-- schema yet. The one adjacent thing that DOES exist — events.
-- has_outstation_guests (a general "should I plan for this at all" flag the
-- host sets once during EventPlanner intake, feeding budget/vendor-category
-- suggestions via lib/eventContext.js's resolveRequirements()) — is a
-- coarse EVENT-level expectation, not per-guest data, and is left
-- untouched; this migration is the actual per-guest detail layer that flag
-- has no visibility into today.
--
-- Kept as flat columns on event_invitees rather than a separate 1:1 table:
-- every other per-guest optional attribute already added this session
-- (household_size, geofence_opted_in, is_vip, gift_*, ...) follows this
-- exact shape, and a 1:1 table would only be worth the join overhead if
-- these fields were themselves multi-valued or independently
-- RLS-scoped — they're neither. event_accommodations stays a REAL separate
-- table because it's genuinely one-to-many (one hotel block, many guests
-- assigned to it), same reasoning event_functions used.

create table if not exists public.event_accommodations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null, -- e.g. "Taj Hotel — Block A"
  address text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists event_accommodations_event_id_idx on public.event_accommodations(event_id);

alter table public.event_accommodations enable row level security;

-- Host-owned, same shape as every other "Owner manages X" policy —
-- PLUS an accepted event_delegates row, same as event_functions
-- (supabase/migrations/event_delegates.sql). Judgment call, flagging it:
-- event_accommodations is a brand-new table, not one of the four the
-- delegate task named explicitly (event_invitees/event_invite_designs/
-- event_functions/event_invitee_functions) — but it's schema created BY
-- this task in direct service of "manage guests" (coordinating an
-- outstation guest's stay is guest-list work, same category as which
-- function they're invited to), so it gets the same host-or-delegate
-- shape as event_functions rather than being silently host-only. Confirm
-- this reads right — easy to narrow back to host-only if delegates
-- shouldn't have this.
create policy "Hosts manage own event accommodations"
  on public.event_accommodations for all
  using (event_id in (select id from public.events where host_id = auth.uid()))
  with check (event_id in (select id from public.events where host_id = auth.uid()));

create policy "Delegates manage event accommodations"
  on public.event_accommodations for all
  using (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_accommodations.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_accommodations.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );

-- Guest-writable (via submit-rsvp, self-service — see Step 3):
alter table public.event_invitees add column if not exists is_outstation boolean default false;
alter table public.event_invitees add column if not exists arrival_date date;
alter table public.event_invitees add column if not exists arrival_time text; -- same "HH:MM" free-text convention as events.event_time
alter table public.event_invitees add column if not exists arrival_details text; -- flight/train number, free text
alter table public.event_invitees add column if not exists departure_date date;
alter table public.event_invitees add column if not exists departure_time text;
alter table public.event_invitees add column if not exists pickup_needed boolean default false;

-- Host-only (never written by submit-rsvp; only via GuestDetailModal.js,
-- which already goes through event_invitees' existing owner/delegate RLS —
-- no new policy needed, same table, same rows):
alter table public.event_invitees add column if not exists pickup_notes text; -- who's assigned, contact info
alter table public.event_invitees add column if not exists accommodation_id uuid references public.event_accommodations(id);
alter table public.event_invitees add column if not exists room_number text;
