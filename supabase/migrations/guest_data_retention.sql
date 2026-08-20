-- General guest-data retention/anonymization policy.
--
-- Full live inventory of event_invitees (verified via information_schema
-- before writing this — the household/multi-subcategory/geofence/guest-
-- account/functions work earlier this session had already added several
-- columns beyond what any single prior task's summary covered):
--
--   IDENTIFYING / free-text — STRIPPED on anonymization:
--     name                the guest's name
--     phone                their phone number
--     allergies            free-text medical note
--     host_logged_note      free-text note a host typed on this guest
--     tag                  free-text group label (e.g. "Riya's college
--                          friends") — can name/describe real people
--     gift_note            free-text "what did they bring" description
--     user_id              severs the link to a real Utsav account
--     geofence_opted_in    reset to false — once anonymized there's no
--                          identifiable person left to background-track,
--                          so any live opt-in is turned off, not just left
--                          dangling against a now-nameless row
--
--   AGGREGATE-SAFE — KEPT unchanged (numbers/status/timestamps a host has
--   a legitimate reason to keep indefinitely, per the decided policy):
--     id, event_id, owner_user_id, rsvp_status, food_pref, plus_ones,
--     created_at, invite_sent_at, gift_type, gift_amount,
--     return_gift_given, is_vip, table_number, checked_in_at,
--     checkin_source, rsvp_reminder_sent_at, thank_you_sent_at,
--     rsvp_source, entry_type, household_size
--
-- Identity surface beyond event_invitees, checked and deliberately NOT
-- touched by this migration (flagging per the task brief rather than
-- silently expanding scope):
--   - guest_passes has no name/phone of its own — only a guest_id FK into
--     event_invitees, so once the linked row is anonymized there's nothing
--     identifying left on the pass row itself. No change needed there.
--   - photos.uploaded_by (FK to the uploader's real account) +
--     uploaded_by_name (a text snapshot) + rekognition_face_id (a stored
--     biometric face embedding reference for the face-matching album
--     feature) is a MATERIALLY LARGER, separate identity surface — a
--     genuinely different kind of personal data (biometric) with its own
--     retention questions. Left entirely out of this task's scope; flagged
--     for a follow-up decision rather than folded in here.
--   - messages / personal_vendor_messages checked and are unrelated
--     (customer<->provider chat, not guest/invitee data at all).
--
-- Scheduling: this project already has real pg_cron + pg_net
-- infrastructure in production (verified live via `select * from
-- cron.job`) — two active daily/hourly jobs (rsvp-reminders-hourly,
-- birthday-wishes-daily) call deployed edge functions via
-- net.http_post(), authenticated with a shared x-cron-secret header
-- checked against the CRON_SECRET env var inside each function. Reused
-- that exact mechanism below rather than introducing a second scheduling
-- approach — see the cron.schedule statement at the bottom and
-- supabase/functions/anonymize-guests/index.ts.

alter table public.event_invitees add column if not exists anonymized_at timestamptz;

-- The one shared anonymization routine — called by the daily batch job
-- (via the anonymize-guests edge function, service role) AND by both guest
-- self-service paths below, so the field list only ever needs to change in
-- one place. Deliberately NOT security-checked internally (no auth.uid()
-- gate) — it trusts its caller completely, which is exactly why EXECUTE is
-- revoked from public below and never granted to anon/authenticated
-- directly. Only reachable via: (a) the service-role batch job, or (b) the
-- three SECURITY DEFINER wrapper functions below, which each do their own
-- real authorization check (matching an invite code + phone, a pass code,
-- or auth.uid()) before ever calling this.
create or replace function public.anonymize_guest_row(p_invitee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.event_invitees
  set name = 'Guest',
      phone = null,
      allergies = null,
      host_logged_note = null,
      tag = null,
      gift_note = null,
      user_id = null,
      geofence_opted_in = false,
      anonymized_at = now()
  where id = p_invitee_id and anonymized_at is null;
end;
$function$;

revoke execute on function public.anonymize_guest_row(uuid) from public;
grant execute on function public.anonymize_guest_row(uuid) to service_role;

-- ── Guest self-service deletion, entry point 1: unauthenticated, has only
-- their RSVP link (RSVPScreen.js). invite_code is EVENT-wide (shared by
-- every guest on that event, unlike a per-guest pass_code), so it alone
-- can't identify which single row to act on — phone is the second factor,
-- matching submit-rsvp's own existing "find this guest within this event
-- by phone" logic exactly (supabase/functions/submit-rsvp/index.ts).
-- Verifies the (invite_code, phone) pair actually matches a real row
-- before touching anything — never a bare policy/table scan. ──
create or replace function public.request_guest_deletion_by_invite(p_invite_code text, p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invitee_id uuid;
begin
  select ei.id into v_invitee_id
  from public.event_invitees ei
  join public.events e on e.id = ei.event_id
  where e.invite_code = upper(p_invite_code)
    and ei.phone = p_phone
    and ei.anonymized_at is null
  limit 1;

  if v_invitee_id is null then
    return false;
  end if;

  perform public.anonymize_guest_row(v_invitee_id);
  return true;
end;
$function$;

revoke execute on function public.request_guest_deletion_by_invite(text, text) from public;
grant execute on function public.request_guest_deletion_by_invite(text, text) to anon, authenticated;

-- ── Guest self-service deletion, entry point 2: unauthenticated, has only
-- their gate-pass link (GuestPassScreen.js — the actual public /p/:passCode
-- landing screen; PassCard.js, despite the similar name/layout, is the
-- HOST's own internal preview reached with an internal passId + eventId,
-- not reachable without being logged in as the host — the real guest-
-- facing equivalent is GuestPassScreen.js, so that's where this is wired).
-- pass_code is only unique PER EVENT (guest_passes' real constraint is
-- UNIQUE(event_id, pass_code), confirmed live) — a bare pass_code could in
-- principle collide across two different events' codes, so this refuses
-- to guess if that ever actually happens rather than silently acting on
-- the wrong person's data. ──
create or replace function public.request_guest_deletion_by_pass_code(p_pass_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invitee_id uuid;
  v_match_count int;
begin
  select count(*), (array_agg(gp.guest_id))[1]
  into v_match_count, v_invitee_id
  from public.guest_passes gp
  where gp.pass_code = upper(p_pass_code);

  if v_match_count = 0 then
    return false;
  end if;
  if v_match_count > 1 then
    raise exception 'Multiple passes matched this code — please contact support.';
  end if;

  perform public.anonymize_guest_row(v_invitee_id);
  return true;
end;
$function$;

revoke execute on function public.request_guest_deletion_by_pass_code(text) from public;
grant execute on function public.request_guest_deletion_by_pass_code(text) to anon, authenticated;

-- ── Guest self-service deletion, entry point 3: logged-in guest account
-- (GuestAccess.js — the same account model set_geofence_opted_in() already
-- serves). Scoped to auth.uid() matching user_id on THAT ONE event's row
-- only, not every event this guest is linked to — matches
-- set_geofence_opted_in()'s own scoping exactly (supabase/migrations/
-- geofence_opt_in.sql). ──
create or replace function public.request_guest_deletion_by_account(p_event_id uuid)
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

  perform public.anonymize_guest_row(v_invitee_id);
  return true;
end;
$function$;

revoke execute on function public.request_guest_deletion_by_account(uuid) from public;
grant execute on function public.request_guest_deletion_by_account(uuid) to authenticated;

-- ── Scheduled batch job — same pg_cron + pg_net + x-cron-secret mechanism
-- already running rsvp-reminders-hourly/birthday-wishes-daily. Daily is
-- plenty (the brief only needs "more than 90 days past", not a precise
-- boundary), scheduled a couple hours after the other daily jobs to avoid
-- piling everything onto the same minute. Uses the SAME cron secret value
-- already configured for the other jobs (the CRON_SECRET Supabase secret
-- the deployed edge functions already check against) — no new secret to
-- set up. Replace <CRON_SECRET_VALUE> with that same real value when
-- pasting (visible in the other two active jobs' cron.job rows). ──
select cron.schedule(
  'anonymize-guests-daily',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://puvhqusauipotmiicrrm.supabase.co/functions/v1/anonymize-guests',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET_VALUE>'),
    body := '{}'::jsonb
  );
  $$
);
