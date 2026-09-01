// Bridges two taxonomies that were built independently in this codebase and
// were never reconciled: eventTaxonomy.js's ~110 fine-grained `subs` (used by
// EventPlanner.js's actual category/sub-event picker UI) and the
// `event_type_slug` values in lib/eventTypeNames.js's EVENT_TYPE_NAMES (used
// by the capability resolver's event_type_slugs/excluded_event_type_slugs
// filters, and by lib/eventRequirements.js's vendor-requirement resolver) —
// this is the function EventPlanner.js actually calls (line ~392) to set a
// real event's event_type_slug, so its output must be a live EVENT_TYPE_NAMES
// key or the event silently gets a slug with no display name.
//
// 2026-09-01: four entries here (satyanarayan_puja, griha_pravesh,
// baby_shower, and the 'corporate' categoryId branch below) still pointed at
// slugs from the old event_types table's original 10-row seed
// (satyanarayan-katha, griha-pravesh, godh-bharai, corporate-event) that
// never existed in EVENT_TYPE_NAMES and have now been dropped from
// event_types too (see supabase/migrations/event_types_merge.sql) — verified
// live via capability_rules that nothing gates on those slugs, so this was a
// pure display-degradation bug (raw slug shown instead of a name), not a
// gating break. Repointed to the closest real EVENT_TYPE_NAMES equivalent.
//
// Coverage is intentionally partial — only the subs with a confident,
// unambiguous match are mapped. Anything else (and any event type outside
// wedding/religious/personal/corporate) resolves to null, which the
// capability resolver already treats safely: event-type-gated rules just
// won't match, venue/guest-count/budget/booking-gated rules are unaffected.
// Extending coverage should mean adding the slug to EVENT_TYPE_NAMES (and to
// event_types, so GuestList.js's sub_events lookup can find it) plus a new
// line here — not a resolver change.
const SUB_EVENT_TO_SLUG = {
  hindu_wedding: 'hindu-wedding',
  engagement: 'engagement',
  satyanarayan_puja: 'religious-event',
  griha_pravesh: 'housewarming',
  mundan: 'mundan',
  baby_shower: 'baby-shower',
  anniversary: 'anniversary',
  birthday_kids: 'kids-birthday',
  birthday_milestone: 'adult-birthday',
  first_birthday: 'kids-birthday',
  // Wave 6 (Stillness): this was the one gap that mattered — without it, a
  // host selecting "Last Rites / Antim Sanskar" ended up with
  // event_type_slug: null, meaning isCelebratory() defaulted to true and
  // the invite design picker would have offered Toran/Kalamkari to a
  // grieving family. Confirmed via live data before fixing: 0 of 60 real
  // events had event_type_slug='funeral-last-rites', and this was why.
  last_rites: 'funeral-last-rites',
};

// Every corporate sub-event collapses to the single 'corporate-conference'
// slug — the capability/requirement system doesn't distinguish a conference
// from an offsite, only "this is a corporate event."
export function resolveEventTypeSlug(categoryId, subEventId) {
  if (categoryId === 'corporate') return 'corporate-conference';
  if (subEventId && SUB_EVENT_TO_SLUG[subEventId]) return SUB_EVENT_TO_SLUG[subEventId];
  return null;
}
