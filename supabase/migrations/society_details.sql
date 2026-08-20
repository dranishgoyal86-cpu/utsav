-- Society visitor list export: gate details on events + the columns needed
-- to build a plain-text/PDF visitor list a security guard can check names off.
--
-- venue_address was NOT added — verified against the live schema that
-- events.venue already exists and serves exactly this purpose (the invite
-- designer already reads/writes it, shown as the "View on Google Maps" link
-- on the RSVP page). Adding a second address column would immediately
-- diverge from it; the visitor list feature reuses the existing column.
alter table public.events
add column if not exists society_name text,
add column if not exists flat_number text,
add column if not exists entry_start_time text,
add column if not exists entry_end_time text,
add column if not exists guard_phone text;
