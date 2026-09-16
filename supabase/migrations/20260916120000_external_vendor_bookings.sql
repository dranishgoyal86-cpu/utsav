-- "guest [host] has booked outside the utsav app can mark booked with
-- details ... vendor name, email, contact details and address and
-- specific instructions for the vendor, which can be then conveyed to
-- vendor through app itself by email or whatsapp/text" (Anish, Sept 16).
--
-- events.arranged_categories already exists (ItemDetail.js's "Mark as
-- arranged" button) and stays exactly as-is — a bare category_slug flag
-- that useEventPlan.js reads to mark a checklist item "handled". That flag
-- keeps working for anyone who just wants a one-tap "I've sorted this
-- myself" with no details at all (confirmed with Anish: filling in vendor
-- details is always optional, never required to mark something arranged).
--
-- This table is the OPTIONAL, richer layer on top: when a host wants to
-- actually message their own vendor through the app (not just flag the
-- item), this is where those details live. Deliberately its own table,
-- not new columns on `events`, for the same reason event_extra_activities
-- got its own table — this is a per-item record (an event can have many
-- categories each with their own outside vendor), not a single per-event
-- value.
--
-- One row per (event, category) — a host filling the form again for the
-- same item updates their own vendor's details rather than creating a
-- second, conflicting record. No RLS policy here, matching
-- event_extra_activities and most other per-event tables in this codebase
-- (see 20260913020000_event_extra_activities.sql) — this app does not use
-- RLS on event-scoped tables in general.
create table if not exists external_vendor_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category_slug text not null,
  item_name text,
  vendor_name text,
  vendor_email text,
  vendor_phone text,
  vendor_address text,
  budget numeric,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, category_slug)
);

create index if not exists external_vendor_bookings_event_id_idx on external_vendor_bookings(event_id);
