// Bridges two taxonomies that were built independently in this codebase and
// were never reconciled: eventTaxonomy.js's ~110 fine-grained `subs` (used by
// EventPlanner.js's actual category/sub-event picker UI) and the 10
// `event_types.slug` values seeded in event_requirements.sql (used by the
// capability resolver's event_type_slugs/excluded_event_type_slugs filters,
// and by lib/eventRequirements.js's vendor-requirement resolver).
//
// Coverage is intentionally partial — only the subs with a confident,
// unambiguous match are mapped. Anything else (and any event type outside
// wedding/religious/personal/corporate) resolves to null, which the
// capability resolver already treats safely: event-type-gated rules just
// won't match, venue/guest-count/budget/booking-gated rules are unaffected.
// Extending coverage should mean adding rows to event_types (SQL-only) plus
// a new line here — not a resolver change.
const SUB_EVENT_TO_SLUG = {
  hindu_wedding: 'hindu-wedding',
  engagement: 'engagement',
  satyanarayan_puja: 'satyanarayan-katha',
  griha_pravesh: 'griha-pravesh',
  mundan: 'mundan',
  baby_shower: 'godh-bharai',
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

// Every corporate sub-event collapses to the single 'corporate-event' slug —
// the capability/requirement system doesn't distinguish a conference from an
// offsite, only "this is a corporate event."
export function resolveEventTypeSlug(categoryId, subEventId) {
  if (categoryId === 'corporate') return 'corporate-event';
  if (subEventId && SUB_EVENT_TO_SLUG[subEventId]) return SUB_EVENT_TO_SLUG[subEventId];
  return null;
}
