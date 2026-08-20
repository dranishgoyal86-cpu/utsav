-- Per-function guest-list scoping (multi-function weddings) — guest-list
-- partitioning only, deliberately NOT full sub-events with their own
-- venue/date/booking/checklist (see task brief).
--
-- Verified live before designing this:
--  - events has no parent/child-event column at all.
--  - A real "sub-event" concept already exists, but at the wrong
--    granularity for this task: sub_events is keyed by event_type_id (a
--    GLOBAL per-event-TYPE taxonomy — e.g. Hindu Wedding always has the
--    same 7 rows: Roka/Mehendi/Haldi/Sangeet/Baraat/Pheras/Reception),
--    consumed by bookings.sub_event_id and event_requirements.sub_event_id.
--    Checked live: zero bookings have ever had sub_event_id set, and
--    EventTodo.js never groups the checklist by sub-event visibly — this
--    is real but dormant schema, not an active feature being duplicated
--    here. event_functions below is deliberately a NEW, separate table
--    (per-EVENT, host-named/free-text) rather than repurposing sub_events
--    itself, since sub_events' global shape can't hold "this specific
--    host's Sangeet on Dec 18" and two other systems already depend on
--    its current shape — but it links back optionally via
--    source_sub_event_id so the host-facing UI can suggest the real
--    taxonomy names (Haldi, Sangeet, ...) instead of a blank text field,
--    for event types that have them.
--  - arranged_categories (events) is the one existing simple-array
--    precedent in this codebase, but it's one-directional (host marks a
--    category arranged, nothing ever queries "which events have category
--    X"). Guest<->function is genuinely many-to-many with real bidirectional
--    query needs ("who's invited to sangeet" AND "which functions is this
--    guest in") — a join table fits better than an array column here.

create table if not exists public.event_functions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  date date,
  time text, -- same "HH:MM" 24-hour text convention as events.event_time
  sort_order integer default 0,
  source_sub_event_id uuid references public.sub_events(id), -- optional, informational only
  created_at timestamptz default now()
);
create index if not exists event_functions_event_id_idx on public.event_functions(event_id);

alter table public.event_functions enable row level security;
create policy "Hosts manage own event functions"
  on public.event_functions for all
  using (event_id in (select id from public.events where host_id = auth.uid()))
  with check (event_id in (select id from public.events where host_id = auth.uid()));

create table if not exists public.event_invitee_functions (
  invitee_id uuid not null references public.event_invitees(id) on delete cascade,
  function_id uuid not null references public.event_functions(id) on delete cascade,
  primary key (invitee_id, function_id)
);
create index if not exists event_invitee_functions_function_idx on public.event_invitee_functions(function_id);

alter table public.event_invitee_functions enable row level security;
-- No direct event_id column here — goes through the invitee's own owner,
-- same shape "Owner manages invitees" already uses on event_invitees itself.
create policy "Hosts manage own invitee function tags"
  on public.event_invitee_functions for all
  using (invitee_id in (select id from public.event_invitees where owner_user_id = auth.uid()))
  with check (invitee_id in (select id from public.event_invitees where owner_user_id = auth.uid()));
