-- Delegate/co-host access to guest-list management — a scoped role that can
-- manage guests/invites/functions for ONE event, without event-edit access
-- (no venue/budget/date, no deleting the event, no bookings).
--
-- Verified live via pg_policies before writing this:
--  - event_invitees: exactly one policy, "Owner manages invitees"
--    (FOR ALL USING (auth.uid() = owner_user_id), no WITH CHECK — Postgres
--    falls back to reusing USING for the write-side check when WITH CHECK
--    is omitted on a FOR ALL policy).
--  - event_invite_designs: exactly one policy, "hosts manage own invite
--    designs" (FOR ALL USING/WITH CHECK auth.uid() = host_id). Has a
--    nullable event_id column (a design can exist unlinked, before the host
--    picks/creates an event for it — see GuestList.js's linkInviteToEvent).
--  - event_functions / event_invitee_functions: table does NOT exist live
--    yet. That table was designed in an earlier task
--    (supabase/migrations/event_functions.sql) and printed for the user to
--    paste, but hasn't been applied. The delegate policies for these two
--    tables below are written to match that file's schema exactly, but
--    THIS FILE MUST BE APPLIED AFTER event_functions.sql, or the two
--    "create policy" statements for them will error against tables that
--    don't exist. If event_functions.sql is still unapplied when this is
--    pasted, skip/comment out the two event_functions*/policies at the
--    bottom and re-run just those once the base tables exist.
--  - events: has an existing SELECT policy "Anyone can view events by
--    invite code" with `qual = true` — i.e. any authenticated request can
--    already SELECT any event row (this is how RSVPScreen.js resolves an
--    event from a bare invite_code with no login). This means a delegate's
--    event-picker query needs NO new policy to read the delegated event's
--    name/date — the open SELECT already covers it. Per the task brief,
--    deliberately NOT touching events' INSERT/UPDATE/DELETE policies
--    (still host-only) — a delegate manages the guest list, not the event.

create table if not exists public.event_delegates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  host_id uuid not null references auth.users(id),
  delegate_user_id uuid references auth.users(id),
  delegate_phone text, -- who this was invited to, before they've signed in and claimed it
  invite_code text unique not null,
  status text not null default 'pending', -- 'pending' | 'accepted' | 'revoked'
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists event_delegates_event_id_idx on public.event_delegates(event_id);
create index if not exists event_delegates_delegate_user_id_idx on public.event_delegates(delegate_user_id);

alter table public.event_delegates enable row level security;

-- Host manages the delegates they've invited for their own events — invite,
-- see status, revoke. Same shape as every other "Owner manages X" policy in
-- this project.
create policy "Hosts manage own event delegates"
  on public.event_delegates for all
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

-- A delegate needs to read their OWN delegate rows — both to find which
-- events they have accepted access to (for the merged event picker) and to
-- see their own pending/accepted/revoked status. Read-only: deliberately no
-- UPDATE grant here. See claim_event_delegate() below for why the actual
-- pending -> accepted transition goes through a SECURITY DEFINER RPC
-- instead of a raw RLS UPDATE policy.
create policy "Delegates view own delegate rows"
  on public.event_delegates for select
  using (delegate_user_id = auth.uid());

-- Redeeming a pending invite (Step 4) is NOT done via a raw client-side
-- .update() + RLS policy. The claim has to verify "the code the user was
-- handed matches this specific pending row" — an RLS USING clause can only
-- see column values on the row itself, not the value the client searched
-- by, so a policy like `using (status = 'pending')` alone would let ANY
-- logged-in user claim ANY pending delegate invite for ANY event just by
-- guessing/enumerating rows, without ever knowing the real invite_code.
-- That's the exact kind of hole the brief asked to avoid ("scoped narrowly,
-- not open update access"). A SECURITY DEFINER function that takes the
-- code as an explicit argument and does the matching itself, server-side,
-- is the only way to actually enforce "you must supply the real code" as
-- part of the authorization check — same pattern already established by
-- link_guest_account_by_phone() and set_geofence_opted_in() in this project.
create or replace function public.claim_event_delegate(p_invite_code text)
returns table (event_id uuid, event_name text) as $$
declare
  v_row public.event_delegates%rowtype;
begin
  select * into v_row
  from public.event_delegates
  where invite_code = p_invite_code and status = 'pending'
  for update;

  if not found then
    raise exception 'This delegate invite is invalid, already used, or has been revoked.';
  end if;

  update public.event_delegates
  set delegate_user_id = auth.uid(), status = 'accepted', accepted_at = now()
  where id = v_row.id;

  return query
    select e.id, e.name from public.events e where e.id = v_row.event_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.claim_event_delegate(text) to authenticated;

-- Extend guest/invite/function access to an accepted delegate, scoped to
-- the one event they were invited to. Added as SEPARATE permissive
-- policies alongside the existing host-owner ones (Postgres OR's multiple
-- permissive policies for the same command together) — the host's own
-- policy is untouched, this only ever adds access, never narrows it.

create policy "Delegates manage invitees"
  on public.event_invitees for all
  using (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_invitees.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_invitees.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );

create policy "Delegates manage invite designs"
  on public.event_invite_designs for all
  using (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_invite_designs.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_invite_designs.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );

-- ── The two policies below require event_functions.sql to be applied
-- first (see note at the top of this file) — they reference tables that
-- don't exist on this database yet as of this writing. ──

create policy "Delegates manage event functions"
  on public.event_functions for all
  using (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_functions.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = event_functions.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );

create policy "Delegates manage invitee function tags"
  on public.event_invitee_functions for all
  using (
    exists (
      select 1 from public.event_invitees ei
      join public.event_delegates d on d.event_id = ei.event_id
      where ei.id = event_invitee_functions.invitee_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_invitees ei
      join public.event_delegates d on d.event_id = ei.event_id
      where ei.id = event_invitee_functions.invitee_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );
