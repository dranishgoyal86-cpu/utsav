-- Provider verification, Task 5 (Google Business Profile check). Lives on
-- providers (not provider_billing) -- same reasoning as website_url/
-- google_maps_url/logo_url: this needs to eventually be a publicly visible
-- trust signal, and provider_billing's RLS is owner+admin only.
--
-- checked_at is the cache marker -- verify-google-listing refuses to
-- search again once it's set (checked server-side, not just skipped
-- client-side), which is what keeps this at one search per provider ever,
-- confirmed against the real usage math: 5 claimed providers today out of
-- 27,462 total (the rest are unclaimed OSM-seeded listings this check
-- never runs against), comfortably inside the 10,000/month free tier even
-- as the claimed count grows, since volume tracks new claims, not
-- database size.
alter table public.providers add column if not exists google_listing_checked_at timestamptz;
alter table public.providers add column if not exists google_listing_found boolean;
alter table public.providers add column if not exists google_listing_name text;
alter table public.providers add column if not exists google_listing_address text;

-- No new RLS needed -- providers already has a working
-- "Providers can update own profile" USING (auth.uid() = user_id) policy
-- (same one website verification already relies on), and the edge
-- function itself uses the service-role client for the actual write.
