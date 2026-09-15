-- Fix: "Could not add that — new row violates row-level security policy
-- for table event_menu_selections" when a host tries to add a menu item
-- (Menu screen, lib/menuLibrary.js flow).
--
-- Root cause: event_menu_selections (20260913030000_event_menu.sql) and
-- event_extra_activities (20260913020000_event_extra_activities.sql) were
-- created as plain `create table` statements with no RLS setup at all.
-- This Supabase project has Row Level Security turned on by default for
-- new tables (same as every other host-owned table in this app — see
-- gate_pass.sql's identical pattern for guest_passes), so with RLS on and
-- zero policies, EVERY query — including the host's own insert — was
-- silently denied. event_extra_activities has the exact same gap; fixing
-- both now rather than waiting for that one to be reported too, since
-- it's the same table shape (event_id FK, no owner column) and the same
-- one-line fix.
--
-- Policy shape matches gate_pass.sql's "Hosts manage own event passes"
-- exactly: the host of the parent event can do anything (select/insert/
-- update/delete) to rows on their own event; nobody else can touch them.
-- Neither table is guest-facing (menu planning and the activity-ideas
-- picker are both host-only screens), so there's no separate guest-read
-- policy needed here, unlike event_invitees/events.

alter table public.event_menu_selections enable row level security;

drop policy if exists "Hosts manage own event menu selections" on public.event_menu_selections;
create policy "Hosts manage own event menu selections"
  on public.event_menu_selections for all
  using (event_id in (select id from public.events where host_id = auth.uid()))
  with check (event_id in (select id from public.events where host_id = auth.uid()));

alter table public.event_extra_activities enable row level security;

drop policy if exists "Hosts manage own event activities" on public.event_extra_activities;
create policy "Hosts manage own event activities"
  on public.event_extra_activities for all
  using (event_id in (select id from public.events where host_id = auth.uid()))
  with check (event_id in (select id from public.events where host_id = auth.uid()));
