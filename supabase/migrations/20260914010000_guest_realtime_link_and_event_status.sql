-- Real-time guest-account linking, event cancellation state, and the
-- one-time celebratory-welcome marker — see claude/
-- guest-visibility-and-event-change-notifications-plan.md for the full
-- design this supports. Additive only, same defensive shape as every
-- other migration in this project.

-- ── Real-time linking ────────────────────────────────────────────────
-- link_guest_account_by_phone() (guest_account_link.sql /
-- 20260914000000_event_invitee_email_link.sql) only runs as a catch-up on
-- login/signup — fine for "I already had an account, now I RSVP'd," but
-- too late for "I'm already invited, and I just now created my account
-- with a matching phone/email" or "a host just added me and I already had
-- an account" — neither of those triggers a login event on their own.
--
-- This is the other direction: given ONE invitee row, find a matching
-- account (if any) and link + notify immediately. Called from:
--   - submit-rsvp/index.ts (service-role — auth.uid() is null there,
--     allowed below same as every other SECURITY DEFINER fn in this
--     project that's meant to run from an edge function)
--   - GuestList.js, right after a host adds a guest (auth.uid() = that
--     host's own session — checked against the event's host_id below so
--     a host can only ever trigger this for their own event's guests)
create or replace function public.link_and_notify_invitee(p_invitee_id uuid)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_invitee record;
  v_event record;
  v_matched_user uuid;
  v_digits text;
  v_normalized text;
  v_bare text;
  v_email text;
begin
  select * into v_invitee from public.event_invitees where id = p_invitee_id;
  if v_invitee.id is null or v_invitee.user_id is not null then
    return v_invitee.user_id; -- not found, or already linked — nothing to do
  end if;

  select * into v_event from public.events where id = v_invitee.event_id;
  if v_event.id is null then
    return null;
  end if;

  -- Client callers (the host, via GuestList.js) may only trigger this for
  -- their own event; a service-role caller (submit-rsvp) has no auth.uid()
  -- at all and is trusted the same way every other admin-client write in
  -- this project already is.
  if auth.uid() is not null and auth.uid() <> v_event.host_id then
    return null;
  end if;

  -- Same normalization as link_guest_account_by_phone().
  v_digits := regexp_replace(coalesce(v_invitee.phone, ''), '\D', '', 'g');
  if length(v_digits) = 10 then
    v_normalized := '91' || v_digits;
  elsif length(v_digits) = 11 and left(v_digits, 1) = '0' then
    v_normalized := '91' || substring(v_digits from 2);
  else
    v_normalized := v_digits;
  end if;
  v_bare := regexp_replace(v_normalized, '^91', '');
  v_email := lower(trim(coalesce(v_invitee.email, '')));

  select id into v_matched_user
  from public.users
  where (v_digits <> '' and regexp_replace(coalesce(phone, ''), '\D', '', 'g') in (v_normalized, v_bare))
     or (v_email <> '' and lower(email) = v_email)
  limit 1;

  if v_matched_user is null then
    return null;
  end if;

  update public.event_invitees set user_id = v_matched_user where id = p_invitee_id;

  insert into public.notifications (user_id, title, body, data)
  values (
    v_matched_user,
    'You''re invited! 🎉',
    'You''ve been invited to "' || coalesce(v_event.name, 'an event') || '".',
    jsonb_build_object('type', 'guest_invited', 'event_id', v_event.id, 'invitee_id', p_invitee_id, 'invite_code', v_event.invite_code)
  );

  return v_matched_user;
end;
$function$;

revoke execute on function public.link_and_notify_invitee(uuid) from anon;

-- ── Event cancellation state ────────────────────────────────────────
alter table public.events add column if not exists is_cancelled boolean not null default false;
alter table public.events add column if not exists cancelled_at timestamptz;
alter table public.events add column if not exists cancellation_reason text;

-- ── One-time celebratory-welcome marker ─────────────────────────────
-- Separate from notifications.is_read on purpose — the celebratory
-- full-screen moment (App.js) should show exactly once regardless of
-- whether the guest has opened the Notifications tab yet, and never show
-- again once it has, even if the notification itself is still unread.
alter table public.notifications add column if not exists celebrated_at timestamptz;
