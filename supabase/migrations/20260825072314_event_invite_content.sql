-- Wave 1: structured partner names for the Toran guest invite page.
-- One row per event (unique event_id) — Wave 1 is deliberately single-
-- design (Toran only, no selector), so one active row is all this needs
-- today. template_id is stored (default 'toran') rather than assumed, per
-- the explicit reasoning this task was scoped with: Task 4 will likely add
-- more fields (motion style, etc.) later, and storing template_id now
-- avoids a second migration purely to introduce the column when that
-- happens — the row shape doesn't change, only which fields get used.
--
-- Deliberately separate from event_invite_designs (the old 40-template
-- system) — that table is explicitly untouched by this whole wave.
create table if not exists public.event_invite_content (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  host_id uuid not null references auth.users(id),
  template_id text not null default 'toran',
  partner_1_name text,
  partner_2_name text,
  hosted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_invite_content enable row level security;

-- Host/delegate read-write, mirroring event_invite_designs' own two
-- policies exactly (event_delegates.sql) — same table family, same
-- ownership shape. No guest-facing policy: the guest page reads this via
-- guest-pass's service-role client, same pattern as every other
-- guest-facing surface in this codebase.
create policy "Hosts manage own invite content"
  on public.event_invite_content for all
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "Delegates manage invite content"
  on public.event_invite_content for all
  using (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_invite_content.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_invite_content.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );
