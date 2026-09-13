-- Plan-screen UX pass (Sept 2026) — Anish asked that event timing be
-- "confirmed in the plan only" and then relayed to guests through invites,
-- rather than needing separate re-entry. events.event_time already flows
-- into every guest-facing screen through one shared formatter
-- (lib/eventContext.js's formatTimeLabel — used by the invite designer,
-- RSVPScreen.js, bookings, provider screens), so the only real gap is that
-- there was never anywhere to record how LONG the event runs. Adding that
-- here, additive only.
--
-- event_duration_hours — nullable numeric, host-entered in the same
-- EventTimeField as the start time (components/SlotField.js). When set,
-- lib/eventContext.js's new formatTimeRangeLabel() turns "18:00" + 3 into
-- "6:00 PM – 9:00 PM" for guest-facing invite text; when left blank,
-- guests just see the start time as before (no forced entry).
alter table events
  add column if not exists event_duration_hours numeric;
