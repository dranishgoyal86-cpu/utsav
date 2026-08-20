-- Per-guest opt-in flag for background geofenced auto check-in
-- (GuestAccess.js's toggle). Verified live via information_schema.columns
-- before writing this: no existing column with this name.
--
-- NOTE: this depends on event_invitees.user_id, added by an earlier
-- migration (supabase/migrations/guest_account_link.sql) — verified live
-- that migration has NOT been applied yet (only guest_account_link.sql's
-- own printed SQL exists on disk, event_invitees still has no user_id
-- column and link_guest_account_by_phone() does not exist as a function).
-- Both need to be pasted together for the geofencing opt-in to actually
-- work end to end — this column alone isn't sufficient.
alter table public.event_invitees add column if not exists geofence_opted_in boolean default false;

-- Same RLS problem as link_guest_account_by_phone() (see
-- guest_account_link.sql): event_invitees' only policy is "Owner manages
-- invitees" (auth.uid() = owner_user_id, the HOST) — a guest flipping their
-- OWN geofence_opted_in flag is a different auth.uid() entirely and would
-- silently update 0 rows under a plain client-side .update(). SECURITY
-- DEFINER + auth.uid() read internally, same shape as this project's other
-- functions in this class.
create or replace function public.set_geofence_opted_in(p_event_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
as $function$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.event_invitees
  set geofence_opted_in = p_enabled
  where event_id = p_event_id and user_id = auth.uid();
end;
$function$;

revoke execute on function public.set_geofence_opted_in(uuid, boolean) from anon;
