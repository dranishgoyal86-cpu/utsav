-- Gate pass system. Verified against the live schema before writing this —
-- `guest_passes` already exists (created by an earlier, apparently
-- incomplete pass at this same feature: RLS, its policy, and its indexes
-- already match the shape below exactly, and the table is empty — 0 rows,
-- so nothing here risks real data). The one thing wrong with it: guest_id
-- references guest_list(id), not event_invitees(id).
--
-- guest_list has 1 row and is legacy/vestigial — nothing guest-facing in
-- this app reads from it. The real, actively-used guest table is
-- event_invitees (33 real rows today) — what GuestList.js, RSVP, and every
-- other guest feature actually use. A pass FK'd to guest_list would never
-- find a real guest. This is the same class of error the gift-sticker spec
-- made earlier this session with the identical guest_list/event_invitees
-- mix-up.
--
-- gate_pass_issued_at / entry_start_time / entry_end_time / guard_phone
-- already exist live on `events` too (same earlier pass) — the ADD COLUMN
-- lines below are IF NOT EXISTS no-ops, kept only so this file is a
-- complete, standalone record of what the feature needs.

create table if not exists public.guest_passes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  guest_id uuid references public.event_invitees(id) on delete cascade,
  pass_code text not null,
  party_size int4 default 1,
  status text default 'issued' check (status in ('issued','checked_in','void')),
  checked_in_at timestamp with time zone,
  checked_in_by uuid references auth.users(id),
  arrived_count int4 default 0,
  issued_at timestamp with time zone default now(),
  unique(event_id, pass_code),
  unique(event_id, guest_id)
);

-- The fix — drops the existing FK to guest_list and points it at
-- event_invitees instead. Safe: guest_passes has 0 rows today.
alter table public.guest_passes drop constraint if exists guest_passes_guest_id_fkey;
alter table public.guest_passes
  add constraint guest_passes_guest_id_fkey
  foreign key (guest_id) references public.event_invitees(id) on delete cascade;

alter table public.guest_passes enable row level security;

drop policy if exists "Hosts manage own event passes" on public.guest_passes;
create policy "Hosts manage own event passes"
  on public.guest_passes for all
  using (event_id in (select id from public.events where host_id = auth.uid()));

create index if not exists idx_passes_event on public.guest_passes(event_id);
create index if not exists idx_passes_code on public.guest_passes(pass_code);

alter table public.events
  add column if not exists gate_pass_issued_at timestamp with time zone,
  add column if not exists entry_start_time text,
  add column if not exists entry_end_time text,
  add column if not exists guard_phone text;
