-- Structured service pricing + inquiry-based confirmation flow.
-- Paste into the Supabase SQL editor — not executed automatically.
--
-- No bookings.status enum/constraint exists (confirmed live: it's a plain
-- text column with real values including payment_pending/confirmed/
-- completed/cancelled/payment_failed/declined/reviewed already), so
-- 'inquiry' needs no schema change to become a valid value — application
-- code already writes/reads it (CreateBookingScreen.js/ChatScreen.js/
-- BookingsScreen.js/ProviderERP.js/lib/eventResolver.js, all fixed in this
-- same change — see conversation for the full Step 5 audit).

-- 1. Structured pricing columns on services. Vocabulary matches
--    venues.pricing_model / vendor_categories.pricing_model exactly (flat/
--    per_guest/per_hour/per_day — a subset, since per_unit and
--    percent_of_budget don't apply to an individual service the way they
--    do to a venue or an event-level category). NULL pricing_model (the
--    default) means "just use price_from/price_to" — flat stays valid and
--    unforced for every category, exactly as before this migration.
alter table public.services add column if not exists pricing_model text;
alter table public.services add column if not exists price_per_guest numeric;
alter table public.services add column if not exists price_per_hour numeric;
alter table public.services add column if not exists price_per_day numeric;
alter table public.services add column if not exists travel_surcharge_per_km numeric;
alter table public.services add column if not exists travel_free_radius_km numeric;

-- 2. One-time backfill from the existing package_details jsonb — confirmed
--    live: exactly 1 real service (a Caterer) has package_details
--    populated at all, with a pricePerPlate field. Everything else stays
--    untouched (pricing_model null = flat, unchanged behavior).
update public.services
set pricing_model = 'per_guest',
    price_per_guest = (package_details->>'pricePerPlate')::numeric
where category = 'Caterers'
  and package_details ? 'pricePerPlate'
  and (package_details->>'pricePerPlate') ~ '^[0-9]+\.?[0-9]*$'
  and pricing_model is null;
