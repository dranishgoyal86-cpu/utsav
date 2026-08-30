-- Provider verification, Task 4 (website ownership, meta-tag method).
-- Lives on providers, NOT provider_billing -- same reasoning already
-- established for logo_url/google_maps_url (see BillingProfile.js's own
-- comment): this is a signal that eventually needs to be publicly visible
-- to customers (part of the Trusted tier), and provider_billing's RLS is
-- owner+admin only. providers already has a working
-- "Providers can update own profile" USING (auth.uid() = user_id) policy,
-- so no new RLS is needed for the provider's own self-service submit/verify.
alter table public.providers add column if not exists website_url text;
alter table public.providers add column if not exists website_verify_token text;
alter table public.providers add column if not exists website_verified_at timestamptz;
