-- Per-function budget — host-manually-set, never auto-allocated from the
-- whole-event budget. null = not set by this function, in which case it
-- simply gets no budget card at all (PlanView.js), not a fallback/inherited
-- number from the whole event.
alter table public.event_functions add column if not exists budget_total numeric;
