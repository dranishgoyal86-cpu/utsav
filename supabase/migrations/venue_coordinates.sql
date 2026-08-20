-- Coordinate-capture plumbing for upcoming proximity/geofencing features
-- (foreground "you're near the venue" prompt, later background auto
-- check-in). This migration ONLY adds columns — no geofencing logic yet.
--
-- Two separate coordinate homes, matching the two ways a host sets a venue:
--  - events.venue_lat/venue_lng: the free-text/home-address path
--    (components/LocationAutocomplete.js -> events.venue). Verified live
--    via information_schema.columns that neither column existed before this.
--  - venues.latitude/longitude: the booked-marketplace-venue path
--    (events.venue_id -> venues). Verified live that the venues table has
--    no coordinate columns at all (name/venue_type/city/address/maps_link/
--    capacity/pricing/catering columns only) — venues predates this
--    entirely, so this is a net-new capability for that table too.
alter table public.events add column if not exists venue_lat double precision;
alter table public.events add column if not exists venue_lng double precision;

alter table public.venues add column if not exists latitude double precision;
alter table public.venues add column if not exists longitude double precision;
