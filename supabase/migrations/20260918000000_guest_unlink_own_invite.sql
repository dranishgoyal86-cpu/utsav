-- "guest should be able to delete his invite" (Anish, Sept 18) — fixes two
-- real bugs found in the same feature:
--
-- 1. "it's getting deleted, but whenever we again enter the same screen, it
--    shows" — event_invitees' only UPDATE policy is "Owner manages
--    invitees" (auth.uid() = owner_user_id, the HOST — see
--    guest_account_link.sql). MyInvites.js's remove/decline actions were
--    calling a plain client-side `.update({ user_id: null })` as the GUEST,
--    which this project's own documented RLS gotcha (see that same file)
--    means silently touches 0 rows — no error, so the screen looked like it
--    worked until the next reload showed the untouched row again. Same
--    SECURITY DEFINER shape as link_guest_account_by_phone()/
--    set_geofence_opted_in() fixes this class of bug elsewhere in this
--    project.
--
-- 2. Even with (1) fixed, App.js calls linkGuestAccountByPhone() on every
--    login/signup/session-restore (fire-and-forget, "idempotent — only
--    fills still-null user_id rows") — which would silently RE-LINK the
--    very row the guest just removed, the next time they open the app,
--    since nothing previously distinguished "never linked" from
--    "deliberately unlinked by the guest". guest_unlinked_at marks that
--    distinction; link_guest_account_by_phone() below is updated to never
--    re-touch a row the guest explicitly removed themselves.
alter table public.event_invitees add column if not exists guest_unlinked_at timestamptz;

create or replace function public.remove_my_invite(p_event_id uuid, p_decline boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invitee_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select id into v_invitee_id
  from public.event_invitees
  where event_id = p_event_id and user_id = auth.uid() and anonymized_at is null
  limit 1;

  if v_invitee_id is null then
    return false;
  end if;

  update public.event_invitees
  set user_id = null,
      guest_unlinked_at = now(),
      rsvp_status = case when p_decline then 'no' else rsvp_status end
  where id = v_invitee_id;

  return true;
end;
$function$;

revoke execute on function public.remove_my_invite(uuid, boolean) from anon;
grant execute on function public.remove_my_invite(uuid, boolean) to authenticated;

-- Replaces link_guest_account_by_phone()'s body only (same identity, same
-- callers, no call site needs to change) — adds "and guest_unlinked_at is
-- null" to the match, so a row the guest deliberately removed via
-- remove_my_invite() above stays removed across every future login/signup/
-- session-restore instead of silently reappearing.
create or replace function public.link_guest_account_by_phone(p_phone text, p_email text default null)
returns integer
language plpgsql
security definer
as $function$
declare
  v_user_id uuid := auth.uid();
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_normalized text;
  v_bare text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_count integer;
begin
  if v_user_id is null or (v_digits = '' and v_email = '') then
    return 0;
  end if;

  if length(v_digits) = 10 then
    v_normalized := '91' || v_digits;
  elsif length(v_digits) = 11 and left(v_digits, 1) = '0' then
    v_normalized := '91' || substring(v_digits from 2);
  else
    v_normalized := v_digits;
  end if;
  v_bare := regexp_replace(v_normalized, '^91', '');

  update public.event_invitees
  set user_id = v_user_id
  where user_id is null
    and guest_unlinked_at is null
    and (
      (v_digits <> '' and phone in (v_normalized, v_bare, '+' || v_normalized))
      or (v_email <> '' and lower(email) = v_email)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke execute on function public.link_guest_account_by_phone(text, text) from anon;
