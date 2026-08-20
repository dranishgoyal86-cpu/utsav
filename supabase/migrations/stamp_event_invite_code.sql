-- Fixes a real silent-failure gap from the delegate-access task: a delegate
-- opening the invite designer for an event that's never had an invite
-- before hits GuestList.js's openInviteDesigner(), which stamps
-- events.invite_code directly via the client. events' UPDATE policy is
-- host-only ("Host can update events" — auth.uid() = host_id), so that
-- write silently no-ops for a delegate (the code checked `if (!error)` and
-- did nothing on failure) — they end up sharing a broken/empty RSVP link
-- with zero indication anything went wrong. A host hitting a genuine
-- network error on this same call got the identical silent non-feedback.
--
-- Verified live before writing this: event_delegates does NOT exist on
-- this database yet (the event_delegates.sql migration from the delegate-
-- access task is still unapplied, printed-only, same as this file). THIS
-- MIGRATION MUST BE APPLIED AFTER event_delegates.sql — the authorization
-- check below queries event_delegates directly, and will error at CREATE
-- FUNCTION time... actually plpgsql function bodies aren't checked against
-- table existence at creation time (no table-existence validation happens
-- until the function actually runs), so applying this first won't error
-- immediately, but calling it before event_delegates.sql exists will fail
-- at runtime with "relation does not exist". Apply event_delegates.sql
-- first regardless, to avoid that.
--
-- Code format: the existing client-side generator (still used everywhere
-- else a code is minted — see GuestList.js's linkInviteToEvent()) is
-- `Math.random().toString(36).substring(2, 8).toUpperCase()` — a 6-char
-- string drawn from the 36-symbol base36 alphabet (0-9, A-Z). The brief's
-- draft used `upper(substr(md5(random()::text), 1, 6))`, which is HEX only
-- (0-9, A-F) — a narrower 16-symbol alphabet, not a format match. Replaced
-- below with an explicit per-character draw from the same 36-symbol
-- alphabet the client uses, so a code stamped by this RPC is
-- indistinguishable in shape from one stamped directly by a host's client.
-- (The two generators aren't bit-for-bit identical algorithms — one is
-- base36-encoding a random fraction, this is uniform-per-character — but
-- nothing anywhere in this codebase parses or validates invite_code beyond
-- "it's a short alphanumeric string," so that difference doesn't matter.)
create or replace function public.stamp_event_invite_code(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code text;
  v_authorized boolean;
  v_chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  i int;
begin
  -- Authorized if the caller is the event's host OR an accepted delegate —
  -- same two-way check as the RLS policies extending event_invitees/
  -- event_invite_designs/event_functions/event_invitee_functions to
  -- delegates (event_delegates.sql), just expressed as a function guard
  -- instead of a policy, since events' own UPDATE policy stays host-only
  -- (per the delegate task's explicit "no events access" boundary) and
  -- this RPC is the one deliberate, narrow exception carved out for it.
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.host_id = auth.uid()
  ) or exists (
    select 1 from public.event_delegates d
    where d.event_id = p_event_id and d.delegate_user_id = auth.uid() and d.status = 'accepted'
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized';
  end if;

  select invite_code into v_code from public.events where id = p_event_id;
  if v_code is not null then
    return v_code; -- already stamped — idempotent, just return the existing one
  end if;

  v_code := '';
  for i in 1..6 loop
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
  end loop;

  update public.events set invite_code = v_code where id = p_event_id;
  return v_code;
end;
$function$;

revoke execute on function public.stamp_event_invite_code(uuid) from public;
grant execute on function public.stamp_event_invite_code(uuid) to authenticated;
