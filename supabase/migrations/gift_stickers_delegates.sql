-- Extends gift_stickers to the same host-or-accepted-delegate RLS shape
-- event_functions/event_accommodations already have (see event_delegates.sql
-- and outstation_travel.sql) — closing the gap flagged but deliberately left
-- unfixed during the delegate task.
--
-- Verified live: gift_stickers has exactly one policy today, "Hosts manage
-- own event stickers" (FOR ALL USING (event_id IN (SELECT events.id FROM
-- events WHERE events.host_id = auth.uid()))) — host-only, no delegate
-- access. Added as a SEPARATE permissive policy alongside it (Postgres ORs
-- multiple permissive policies for the same command together), same as
-- every other delegate extension — the host's own policy is untouched.
create policy "Delegates manage gift stickers"
  on public.gift_stickers for all
  using (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = gift_stickers.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  )
  with check (
    exists (
      select 1 from public.event_delegates d
      where d.event_id = gift_stickers.event_id
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );
