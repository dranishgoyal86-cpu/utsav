// Kids Birthday Theme-Aware Invite Designer — prefill adapter.
//
// Maps REAL, already-verified planning data (see Phase 0 investigation:
// events.birthday_person_name, events.birthday_person_dob,
// events.theme_slug, events.theme_palette, event_extra_activities via
// is_featured_on_invite) into defaults for the kids-birthday invite
// schema's own fields (lib/inviteSchemas/schemas/kidsBirthday.js:
// childName, turningAge, partyTheme, activitiesNote, ...). No DB column
// invented from the spec's prose — every field read below was confirmed
// live in the repository before this file was written.
//
// Precedence (verbatim from the spec):
//   1. explicit host invite customization
//   2. existing saved invite content
//   3. Event Planner data          <- this file implements exactly this rung
//   4. schema default
//   5. wording fallback
// Rungs 1+2 are already resolved into `values` by
// normalizeInviteContent() before withKidsBirthdayPlannerDefaults() ever
// runs (see ToranInvites.js's normalize effect) — this module only ever
// fills a key that is still empty, and rungs 4/5 already happen inside
// normalizeInviteContent()/InviteSchemaForm and are untouched here.
// Planning data prefills MISSING invite fields; it must never
// continuously overwrite a host's edited wording on reopen.
import { getKidsBirthdayInviteOptions } from './kidsBirthdayThemes';

// birthDate (child's DOB) and eventDate (party date) are never
// substituted for one another anywhere in this file. The DOB is used
// ONLY to compute the age being celebrated ON the party date — it is
// never itself surfaced as invite text. Per the spec's privacy rule, the
// child's full date of birth is not printed on the invite; only the age
// turning and the party date are.
export function computeAgeTurningOnDate(birthDateStr, eventDateStr) {
  if (!birthDateStr || !eventDateStr) return null;
  const birth = new Date(birthDateStr);
  const event = new Date(eventDateStr);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(event.getTime())) return null;
  let age = event.getFullYear() - birth.getFullYear();
  const hasHadBirthdayByPartyDate =
    event.getMonth() > birth.getMonth() ||
    (event.getMonth() === birth.getMonth() && event.getDate() >= birth.getDate());
  if (!hasHadBirthdayByPartyDate) age -= 1;
  return age >= 0 ? age : null;
}

// event: a real `events` row. opts.featuredActivities: item_name[] the
// host starred is_featured_on_invite on event_extra_activities (the same
// array ToranInvites.js already fetches for the "What to expect" line —
// reused here, not refetched or reimplemented).
export function buildKidsBirthdayInviteDefaults(event, { featuredActivities = [] } = {}) {
  if (!event) return {};
  const defaults = {};

  if (event.birthday_person_name) {
    defaults.childName = event.birthday_person_name;
  }

  const age = computeAgeTurningOnDate(event.birthday_person_dob, event.event_date);
  if (age != null) {
    defaults.turningAge = String(age);
  }

  if (event.theme_slug) {
    const options = getKidsBirthdayInviteOptions(event.theme_slug, event.theme_palette);
    // Guest-facing copy gets the theme's plain name only ("Jungle
    // Safari") — the palette is a separate visual choice, not wording a
    // guest needs to read.
    if (!options.isFallback) defaults.partyTheme = options.displayLabel.split(' — ')[0];
  }

  // Activity labels are already guest-friendly by the time they reach
  // here — lib/activityIdeas.js's catalog names (e.g. "Magic Show", "Face
  // Painting") are what ActivityIdeasLibrary.js/PlanView.js store as
  // item_name, and ToranInvites.js already reads exactly this array for
  // its own "What to expect" presentation line. This default just seeds
  // the schema's own free-text activitiesNote field with the same
  // curated, starred list, joined the same way — no internal task/vendor
  // terminology, no separate mapping table to maintain or drift.
  if (featuredActivities.length > 0) {
    defaults.activitiesNote = featuredActivities.join(' · ');
  }

  return defaults;
}

// Merges planner defaults strictly UNDER already-resolved schema values.
// Only ever called for a kids-birthday event; a no-op for every other
// event type so no other invite flow is touched by this file at all.
export function withKidsBirthdayPlannerDefaults(values, event, opts) {
  if (event?.event_type_slug !== 'kids-birthday') return values;
  const defaults = buildKidsBirthdayInviteDefaults(event, opts);
  const merged = { ...values };
  for (const [key, val] of Object.entries(defaults)) {
    if (!merged[key]) merged[key] = val;
  }
  return merged;
}
