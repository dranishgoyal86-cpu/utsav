-- Event context propagation — adds the columns lib/eventContext.js resolves
-- against, plus an audit trail for date/venue/dietary changes so vendors can
-- be notified when a confirmed booking's event date moves.
--
-- Two deliberate deviations from the original spec, both verified against
-- the live schema before writing this:
--
-- 1. No `venue_address` column. `events.venue` already exists and has held
--    the free-text venue/address string since before this session — adding
--    a second column would just create two sources of truth. Home-path
--    address text continues to live in `events.venue`; resolveVenue() in
--    lib/eventContext.js reads it from there.
--
-- 2. `entry_start_time`, `entry_end_time`, `guard_phone` added even though
--    the spec didn't list them. screens/customer/VisitorList.js already has
--    a live, reachable save function (saveSocietyDetails) that writes these
--    two fields plus society_name/flat_number to `events` — none of the five
--    columns exist on the table today, so every save through that screen has
--    been failing silently. society_name/flat_number were already in the
--    spec's list; adding the other three here closes the same bug instead of
--    leaving it half-fixed.

alter table public.events
  add column if not exists venue_label text,
  add column if not exists society_name text,
  add column if not exists flat_number text,
  add column if not exists entry_start_time text,
  add column if not exists entry_end_time text,
  add column if not exists guard_phone text,
  add column if not exists dietary_profile text[] default '{}',
  add column if not exists dietary_notes text,
  add column if not exists rsvp_deadline date;

create table if not exists public.event_change_log (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

alter table public.event_change_log enable row level security;

create policy "Hosts read own event change log"
  on public.event_change_log for select
  using (
    event_id in (select id from public.events where host_id = auth.uid())
  );

create policy "Hosts insert own event change log"
  on public.event_change_log for insert
  with check (
    event_id in (select id from public.events where host_id = auth.uid())
  );

create index if not exists idx_event_change_log_event on public.event_change_log(event_id);
