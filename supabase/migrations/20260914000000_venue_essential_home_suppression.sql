-- Reported bug: PlanView.js's "Essentials" (P1) tier showed a "Venue"
-- requirement even for a host who picked "At home" during planning and
-- never needed to book one. Every event type's seeded 'Venue' row
-- (event_requirements.sql) has condition_flag = null, i.e. unconditional.
--
-- lib/eventResolver.js's resolveRequirements() already gained a
-- 'notHomeVenue' condition-flag check (context.isHomeVenue was already
-- computed by lib/checklistContext.js's buildChecklistContext() and
-- already threaded through by hooks/useEventPlan.js — it just wasn't read
-- there). This migration is the other half: tagging the actual rows that
-- check should apply to. condition_flag only supports "include this row
-- when the flag is true," never "suppress when true," hence the flag name
-- being the negation (notHomeVenue) rather than (isHomeVenue).
--
-- Scoped narrowly to item_name/category_slug so this can never touch any
-- other requirement row, across every event type and sub-event.
update event_requirements
set condition_flag = 'not_home_venue'
where item_name = 'Venue'
  and category_slug = 'venues'
  and condition_flag is null;
