-- Self-service account deletion — required by Google Play policy for any
-- app that supports account creation (must offer an in-app or documented
-- web path to request deletion of the account and its data). Verified
-- against the live schema before writing this: no deletion path of any
-- kind existed anywhere in the app before now.
--
-- Design (confirmed with the app owner before building):
-- 1. Tapping "Delete my account" immediately signs the user out and blocks
--    login — reuses the existing is_suspended gate in App.js (no new gate
--    needed), with deletion_requested_at as the distinguishing marker so
--    the login screen can show "deletion scheduled" instead of "suspended".
-- 2. A 14-day grace period follows — enough time to recover from an
--    accidental tap or resolve an in-flight support issue before anything
--    is actually removed.
-- 3. After 14 days, a daily cron job (purge-deleted-accounts edge
--    function) permanently removes the account. Booking/payment records
--    are retained for accounting/dispute purposes but anonymized
--    (customer_id set to null) rather than deleted outright — matches
--    what most apps do and was an explicit choice, not a default.
-- 4. Scoped to customer accounts only. A provider's account is tied to a
--    public business listing that other customers' bookings/reviews
--    reference — providers.user_id cascades from public.users, and letting
--    a provider self-delete would cascade into other people's booking
--    history. Providers are directed to contact support instead; nothing
--    here touches provider accounts.

alter table public.users
  add column if not exists deletion_requested_at timestamp with time zone;

-- Runs once a day. Needs the pg_cron and pg_net extensions enabled on the
-- project (both are on by default for most Supabase projects). Replace
-- <PROJECT_REF> with the real project ref, and <CRON_SECRET_VALUE> with
-- the actual value of the CRON_SECRET Supabase secret (same one
-- rsvp-reminders/todo-reminders/birthday-wishes already use — not visible
-- to me, only you have it) before running this in the SQL editor.
select cron.schedule(
  'purge-deleted-accounts',
  '0 3 * * *', -- 03:00 UTC daily — low-traffic hour
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-deleted-accounts',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET_VALUE>'),
    body := '{}'::jsonb
  );
  $$
);
