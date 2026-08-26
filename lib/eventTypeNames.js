// Display names for event_requirements.event_type_slug values, used by
// PlanHero.js's free-text matching and by every screen that needs a label
// for an event type. There is no name/label column on event_requirements
// itself, and the pre-existing event_types table (built in an earlier pass
// of this app) only covers 6 of the 16 slugs actually seeded here and
// includes 4 slugs (corporate-event, godh-bharai, griha-pravesh,
// satyanarayan-katha) that have zero matching event_requirements rows today
// — verified live before writing this, not assumed — so it's stale for this
// engine's purposes. This list was built from the real distinct
// event_type_slug values in the live event_requirements table.
export const EVENT_TYPE_NAMES = {
  'hindu-wedding': 'Hindu Wedding',
  // Wave 7 — PlanHero.js (the real live event-creation flow) had exactly
  // one wedding option before this. Added alongside hindu-wedding, not
  // replacing anything. interfaith-wedding is a single slug, not a
  // dual-tradition selector — deliberate scope decision, not an oversight.
  'nikah': 'Nikah',
  'anand-karaj': 'Anand Karaj (Sikh)',
  'christian-wedding': 'Christian Wedding',
  'parsi-wedding': 'Parsi Wedding',
  'jain-wedding': 'Jain Wedding',
  'interfaith-wedding': 'Interfaith Wedding',
  'engagement': 'Engagement',
  'kids-birthday': "Kids' Birthday",
  'adult-birthday': 'Birthday',
  'anniversary': 'Anniversary',
  'mundan': 'Mundan',
  'baby-shower': 'Baby Shower',
  'housewarming': 'Housewarming',
  'naming-ceremony': 'Naming Ceremony',
  'religious-event': 'Religious Event',
  'corporate-conference': 'Corporate Conference',
  'product-launch': 'Product Launch',
  'exhibition': 'Exhibition',
  'concert': 'Concert',
  'festival-fair': 'Festival / Fair',
  'sports-event': 'Sports Event',
  'other': 'Other',
  'funeral-last-rites': 'Funeral / Last Rites',
  'wellness-retreat': 'Wellness Retreat',
  'team-offsite': 'Team Offsite',
};

export function eventTypeName(slug) {
  return EVENT_TYPE_NAMES[slug] || slug;
}

// Whether an event type's UI treatment should be celebratory (countdown
// hero, milestone flourish, warm accent color) or muted/solemn — see
// PlanView.js's isCelebratory(event.event_type_slug) gates. Kept as its own
// map rather than folded into EVENT_TYPE_NAMES's values: only 4 call sites
// read EVENT_TYPE_NAMES today (eventTypeName, matchEventTypeText below,
// PlanHero.js x2), every one of them treating EVENT_TYPE_NAMES[slug] as a
// plain string — reshaping those values into {name, isCelebratory} objects
// would mean touching all 4 call sites for no real benefit over a second,
// purely additive map.
const EVENT_TYPE_CELEBRATORY = {
  'hindu-wedding': true,
  'nikah': true,
  'anand-karaj': true,
  'christian-wedding': true,
  'parsi-wedding': true,
  'jain-wedding': true,
  'interfaith-wedding': true,
  'engagement': true,
  'kids-birthday': true,
  'adult-birthday': true,
  'anniversary': true,
  'mundan': true,
  'baby-shower': true,
  'housewarming': true,
  'naming-ceremony': true,
  'religious-event': true,
  'corporate-conference': true,
  'product-launch': true,
  'exhibition': true,
  'concert': true,
  'festival-fair': true,
  'sports-event': true,
  'other': true,
  'funeral-last-rites': false,
  'wellness-retreat': true,
  'team-offsite': true,
};

// Defaults to true (celebratory) for any unrecognized/unset slug — the one
// value that actively suppresses UI is false, so an unknown slug should
// never silently go solemn. Mirrors eventTypeName()'s own "don't fail
// closed on an unknown slug" precedent above.
export function isCelebratory(slug) {
  return EVENT_TYPE_CELEBRATORY[slug] !== false;
}

// Checked before the generic name-substring pass below. A plain substring
// match against display names alone put 'adult-birthday' ("Birthday") ahead
// of 'kids-birthday' ("Kids' Birthday") for almost any kids'-birthday text,
// because the apostrophe meant the literal display name almost never
// appeared verbatim in normal typed text, while the bare "birthday"
// substring always did — e.g. "a birthday party for my daughter" silently
// resolved to adult-birthday. These patterns catch the common phrasings a
// generic substring check can't.
const KEYWORD_OVERRIDES = [
  {
    slug: 'kids-birthday',
    pattern: /\b(kids?|child(ren)?'?s?|son'?s?|daughter'?s?)\b.{0,20}\bbirthday\b|\bbirthday\b.{0,20}\b(kids?|child(ren)?'?s?|son'?s?|daughter'?s?)\b/i,
  },
  {
    // Checked before team-offsite below: a "retreat for our team" that
    // names a wellness activity (yoga/meditation/mindfulness/spa) is a
    // wellness-retreat, not a generic team-offsite — the activity, not the
    // presence of the word "team," decides the split. Bare "yoga" alone is
    // treated as a strong enough signal on its own (no other event type in
    // this app's taxonomy plausibly mentions it), so it doesn't need to be
    // paired with retreat/weekend/etc.
    slug: 'wellness-retreat',
    pattern: /\byoga\b|\b(wellness|mindfulness|meditation|spa)\b.{0,25}\b(retreat|weekend|getaway|offsite)\b|\b(retreat|weekend|getaway)\b.{0,25}\b(wellness|mindfulness|meditation|spa)\b/i,
  },
  {
    // Only reached once wellness-retreat's pattern above has already ruled
    // out a wellness/yoga/mindfulness activity — e.g. "company retreat with
    // workshops and team bonding" has no wellness keyword, so it falls
    // through to here and matches on "team bonding".
    slug: 'team-offsite',
    pattern: /\bteam\s*(bonding|building|outing)\b|\boffsite\b/i,
  },
  {
    slug: 'funeral-last-rites',
    pattern: /\bfunerals?\b|\blast\s*rites?\b|\bantim\s*sanskar\b|\bshraddha?\b|\bcondolence\b|\bbereavement\b|\bcremation\b/i,
  },
];

// Best-effort free-text match: keyword overrides first, then exact/substring
// match against the display names above. Returns a slug or null — PlanHero.js
// falls back to asking with chips when this can't decide.
export function matchEventTypeText(text) {
  if (!text) return null;
  const normalized = text.toLowerCase();

  for (const { slug, pattern } of KEYWORD_OVERRIDES) {
    if (pattern.test(normalized)) return slug;
  }

  for (const [slug, name] of Object.entries(EVENT_TYPE_NAMES)) {
    // 'Other' is a deliberate, explicit chip choice only (PlanHero.js's
    // askingType fallback) — its display name is too common a plain word to
    // safely substring-match free text against (e.g. "let me check with the
    // other guests" would otherwise silently resolve here).
    if (slug === 'other') continue;
    if (normalized.includes(name.toLowerCase())) return slug;
  }
  return null;
}
