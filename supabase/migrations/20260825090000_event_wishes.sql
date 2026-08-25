-- Wave 2, Task 2: Wishing Wall. Guest-visible (explicit, confirmed decision
-- — this codebase's first guest-facing READ of other guests' content, not
-- just a write of their own data). No relationship to gift data at all —
-- no column here references gift_amount/gift_type/any table from the
-- original investigation's gift-tracking section, deliberately.
create table if not exists public.event_wishes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invitee_id uuid not null references public.event_invitees(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists event_wishes_event_id_idx on public.event_wishes(event_id);

alter table public.event_wishes enable row level security;

-- Host/delegate full read-write, matching the established pattern.
create policy "Hosts manage own event wishes"
  on public.event_wishes for all
  using (event_id in (select id from public.events where host_id = auth.uid()))
  with check (event_id in (select id from public.events where host_id = auth.uid()));

create policy "Delegates manage event wishes"
  on public.event_wishes for all
  using (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_wishes.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_wishes.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );

-- No guest-facing RLS policy — guest read/write goes through guest-pass's
-- service-role client (get_wishes/submit_wish), same trust model as every
-- other guest-writable table in this codebase. The guest-VISIBLE part of
-- "guest-visible" is enforced in the edge function's own logic, not RLS.

-- anonymize_guest_row() note: display name is joined through
-- event_invitees.name at READ time (never stored on the wish itself), so a
-- wish automatically shows "Guest" after anonymization — no cascade/
-- cleanup needed here. Confirmed, not assumed: this table has no name
-- column to clean up in the first place.
