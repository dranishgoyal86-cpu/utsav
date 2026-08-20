-- Links a guest's real Utsav account (once they create one — see
-- screens/GuestSignup.js) to every event_invitees row that matches their
-- phone number, across every event they've ever been invited to. This is
-- the identity foundation the (separately speced, not-yet-built)
-- background-geofencing auto check-in needs: a background task has to be
-- registered against a real persistent account, not an anonymous RSVP link.
--
-- Verified live via information_schema.columns: event_invitees has no
-- user_id (or similarly named) column today — id/event_id/owner_user_id/
-- name/phone/rsvp_status/food_pref/plus_ones/created_at/tag/
-- invite_sent_at/allergies/gift_type/gift_amount/gift_note/
-- return_gift_given/is_vip/table_number/checked_in_at/checkin_source only.
-- (checked_in_at/checkin_source already existing here is a separate,
-- pre-existing check-in system from earlier in this project — unrelated to
-- the guest_passes-based one built in a prior session; not touched here.)
alter table public.event_invitees add column if not exists user_id uuid references auth.users(id);
create index if not exists event_invitees_user_id_idx on public.event_invitees(user_id);

-- A plain client-side `update ... where phone = x` CANNOT work here: RLS on
-- event_invitees is "Owner manages invitees" (auth.uid() = owner_user_id)
-- only — the HOST, not the guest linking their own unrelated account.
-- Verified live via pg_policies before writing this; the naive client
-- update would silently touch 0 rows with no error (this project's own
-- documented RLS-silent-no-op gotcha). SECURITY DEFINER + auth.uid() read
-- internally (never trusted from the caller) instead, same shape as
-- get_booking_invoice_billing() from an earlier migration.
create or replace function public.link_guest_account_by_phone(p_phone text)
returns integer
language plpgsql
security definer
as $function$
declare
  v_user_id uuid := auth.uid();
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_normalized text;
  v_bare text;
  v_count integer;
begin
  if v_user_id is null or v_digits = '' then
    return 0;
  end if;

  -- Mirrors helpers.js's toWhatsappNumber(): bare 10-digit -> 91-prefixed;
  -- 11-digit leading 0 -> strip the 0, then 91-prefix; anything else as-is.
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
    and phone in (v_normalized, v_bare, '+' || v_normalized);

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke execute on function public.link_guest_account_by_phone(text) from anon;
