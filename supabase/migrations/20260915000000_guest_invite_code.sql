-- "so every event planned should have a code which is pasted in invite as
-- well, so invite will also have his own unique code in continuation to
-- event code so if some user who downloaded the app can track his own
-- invitations by putting that code inside my invitation. it will be
-- easier than matching phone no. and email id."
--
-- events.invite_code already exists (stamp_event_invite_code.sql) — a
-- 6-char base36 code (0-9, A-Z) shared by every guest on that event. This
-- adds a second, per-GUEST code that continues it: event_invitees.guest_code,
-- a 4-char hex suffix. Shown together as e.g. "AB12CD-F19B" — the event
-- code identifies the event, the suffix identifies which invitee row.
--
-- Deliberately a GENERATED ALWAYS ... STORED column, not something the app
-- writes: it's derived purely from the row's own id (already a random
-- uuid, already unique), so it needs no sequence, no trigger, no
-- collision-retry loop, and — most usefully — it fills in automatically
-- for every existing insert path (GuestList.js's saveGuest, the bulk
-- import flow, submit-rsvp's self-serve insert) with zero app-code changes
-- required for generation itself. Only *reading* and *displaying* it is
-- new app code (RSVPScreen.js, MyInvites.js, submit-rsvp/index.ts).
alter table public.event_invitees
  add column if not exists guest_code text
  generated always as (upper(substr(md5(id::text), 1, 4))) stored;

create index if not exists event_invitees_guest_code_idx
  on public.event_invitees(event_id, guest_code);

-- Lets a logged-in guest who was matched by neither phone nor email (a
-- forwarded WhatsApp message with a different number, a typo, an invite
-- sent to a relative's phone, etc.) manually claim their invite by typing
-- the code shown on it into "My Invitations". Accepts the code with or
-- without the separating dash, case-insensitive, since it's meant to be
-- typed by hand from a screenshot or forwarded text.
--
-- SECURITY DEFINER + auth.uid() read internally, same shape as
-- link_guest_account_by_phone/link_and_notify_invitee — a plain client
-- update can't do this (event_invitees' RLS is host-only, same
-- "Owner manages invitees" policy documented in guest_account_link.sql).
create or replace function public.claim_invite_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_clean text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_event_code text;
  v_guest_code text;
  v_event record;
  v_invitee record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if length(v_clean) <> 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_format');
  end if;

  v_event_code := substr(v_clean, 1, 6);
  v_guest_code := substr(v_clean, 7, 4);

  select * into v_event from public.events where upper(invite_code) = v_event_code;
  if v_event.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select * into v_invitee from public.event_invitees
    where event_id = v_event.id and guest_code = v_guest_code and anonymized_at is null
    limit 1;
  if v_invitee.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if v_invitee.user_id is not null and v_invitee.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  if v_invitee.user_id is null then
    update public.event_invitees set user_id = v_uid where id = v_invitee.id;

    insert into public.notifications (user_id, title, body, data) values (
      v_uid, 'You''re invited! 🎉',
      'You''ve been invited to "' || coalesce(v_event.name, 'an event') || '".',
      jsonb_build_object('type', 'guest_invited', 'event_id', v_event.id, 'invitee_id', v_invitee.id, 'invite_code', v_event.invite_code)
    );
  end if;

  return jsonb_build_object('ok', true, 'event_id', v_event.id, 'event_name', v_event.name, 'invitee_id', v_invitee.id);
end;
$function$;

revoke execute on function public.claim_invite_by_code(text) from anon;
