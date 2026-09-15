-- "still not able to see my invitations in webapp or on invites tab" —
-- root cause, found by re-checking this instead of assuming a deploy
-- problem: event_invitees' only existing SELECT policy is host-only
-- ("Owner manages invitees" — auth.uid() = owner_user_id, documented in
-- guest_account_link.sql, verified live via pg_policies at the time).
-- link_and_notify_invitee/claim_invite_by_code/link_guest_account_by_phone
-- are all SECURITY DEFINER, so writing event_invitees.user_id has always
-- worked — but MyInvites.js and InviteHub.js read event_invitees and
-- events straight from the client as the logged-in GUEST, which RLS was
-- never given a rule for. The guest genuinely was linked; they just had
-- no permission to read their own row afterward. This is a client-facing
-- read gap, not something a SECURITY DEFINER RPC can paper over — the
-- guest needs a real, narrow SELECT policy of their own.
--
-- events has no tracked SELECT policy in this repo's migrations either
-- (same "set up live, not in a migration file" situation) — added
-- defensively here rather than assumed. If a broader events SELECT
-- policy already exists live, this is additive (its own named policy)
-- and does not conflict with or replace anything.
drop policy if exists "Guests read own linked invitee rows" on public.event_invitees;
create policy "Guests read own linked invitee rows"
  on public.event_invitees for select
  using (user_id = auth.uid());

drop policy if exists "Guests read events they are invited to" on public.events;
create policy "Guests read events they are invited to"
  on public.events for select
  using (
    exists (
      select 1 from public.event_invitees ei
      where ei.event_id = events.id and ei.user_id = auth.uid()
    )
  );
