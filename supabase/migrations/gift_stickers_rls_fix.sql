-- Fix for "new row violates row-level security policy for table
-- gift_stickers" on printSheet's insert.
--
-- The original policy (gift_stickers.sql) was `for all using (...)` with
-- no explicit `with check`. Postgres is documented to fall back to reusing
-- `using` as the check when `with check` is omitted on a FOR ALL policy —
-- but rather than rely on that implicit behavior, this makes it explicit,
-- which is also Postgres's own recommended practice. This alone may not
-- have been the actual cause (the real bug was PlanScreen.js's
-- openEventTool() passing an undefined eventId into GiftStickers.js before
-- today's fix — that would fail differently, on the eventId itself, not
-- on RLS), but there's no reason to leave this ambiguous either way.
drop policy if exists "Hosts manage own event stickers" on public.gift_stickers;

create policy "Hosts manage own event stickers"
  on public.gift_stickers for all
  using (
    event_id in (select id from public.events where host_id = auth.uid())
  )
  with check (
    event_id in (select id from public.events where host_id = auth.uid())
  );

-- Same gap, same fix, found while checking for it elsewhere: guest_passes'
-- "Hosts manage own event passes" policy (gate_pass.sql) had the identical
-- FOR ALL + no explicit WITH CHECK shape — PassIssue.js's insert would hit
-- the same RLS failure the first time someone actually issues gate passes.
drop policy if exists "Hosts manage own event passes" on public.guest_passes;

create policy "Hosts manage own event passes"
  on public.guest_passes for all
  using (
    event_id in (select id from public.events where host_id = auth.uid())
  )
  with check (
    event_id in (select id from public.events where host_id = auth.uid())
  );
