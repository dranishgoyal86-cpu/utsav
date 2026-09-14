-- Adds email as a second matching key for linking a guest's real Utsav
-- account to their event_invitees row(s) — requested directly: phone OR
-- email should both be able to make the match, not phone alone. Additive
-- only, same shape as guest_account_link.sql (the original phone-only
-- version this extends).
--
-- Verified live via information_schema.columns: event_invitees has no
-- email column today (guest_account_link.sql's own header already listed
-- every column that existed at that point — none of them was email).
alter table public.event_invitees add column if not exists email text;
create index if not exists event_invitees_email_idx on public.event_invitees(lower(email));

-- Signup itself already requires both phone AND email in the app
-- (SignupScreen.js / GuestSignup.js both reject the form if either is
-- blank) — this is the matching half: extends the existing SECURITY
-- DEFINER RPC (see guest_account_link.sql for why this can't be a plain
-- client-side `.update()` — event_invitees' RLS only permits the host, not
-- the guest linking their own account) to OR-match on email as well as
-- phone, instead of phone alone.
--
-- p_email defaults to null so every existing call site that still only
-- passes p_phone (there were several before this) keeps working unchanged
-- — this replaces the function body, not its identity, so no caller needs
-- to be migrated in lockstep with this file landing.
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
    and (
      (v_digits <> '' and phone in (v_normalized, v_bare, '+' || v_normalized))
      or (v_email <> '' and lower(email) = v_email)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke execute on function public.link_guest_account_by_phone(text, text) from anon;
