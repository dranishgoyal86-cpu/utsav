-- Plan-screen UX pass, follow-up (Sept 2026) — "differentiation between
-- kids birthday and normal birthday has to be placed in the event plan
-- itself, like whose birthday and birthdate, so we get to know the age...
-- kids theme if below 15." Previously events.event_type_slug ('kids-
-- birthday' vs 'adult-birthday') was set once at creation by guessing from
-- free-text ("kids"/"daughter"/etc. in matchEventTypeText, lib/
-- eventTypeNames.js), with no way to correct a wrong guess. Additive only.
--
-- birthday_person_name — optional, host's own reference only (not shown
-- to guests anywhere today), e.g. "Aarav" or "Dad".
-- birthday_person_dob  — the actual signal: components/SlotField.js's new
-- BirthdayPersonField computes an age from this (lib/eventContext.js's
-- computeAgeOn) and silently corrects event_type_slug between
-- 'kids-birthday' and 'adult-birthday' whenever it disagrees with the
-- current value — which is what unlocks/hides ThemeField and
-- ActivityIdeasLibrary elsewhere on the Plan screen.
alter table events
  add column if not exists birthday_person_name text,
  add column if not exists birthday_person_dob date;
