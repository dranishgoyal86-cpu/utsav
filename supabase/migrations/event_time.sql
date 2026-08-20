-- Event start time — a plain "HH:MM" 24-hour text column, same free-text
-- convention as the rest of the slot system (event_date is stored as a date,
-- but time-of-day has no natural DB type advantage here since it's always
-- rendered, never computed on). Stored on events (the single source of
-- truth for a plan's details) and mirrored onto bookings at booking time —
-- same shape as event_date/venue/guest_count, which CreateBookingScreen.js
-- already copies onto the booking row rather than re-deriving live.
alter table public.events add column if not exists event_time text;
alter table public.bookings add column if not exists event_time text;
