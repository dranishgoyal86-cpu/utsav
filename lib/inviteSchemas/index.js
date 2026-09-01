// Invite schema registry — the single lookup point from an event's
// event_type_slug to its content schema (sections/fields/status/wording
// modes/function-vocabulary key). Design-independent by construction: see
// types.js's FORBIDDEN_SCHEMA_KEYS and validateSchemaRegistry() below.
//
// Only 3 schemas exist this wave, per the brief's explicit scope: a
// dedicated 'hindu-wedding' schema (proves the architecture against a real
// event type with live sub_events data), a dedicated 'funeral-last-rites'
// schema (the one real non-celebratory type, and the concrete case the
// funeral safeguards are written against), and a generic fallback that
// reproduces today's default couple-shaped behavior for every other slug.
// The other 24 of the 26 live EVENT_TYPE_NAMES slugs are intentionally NOT
// given dedicated schemas yet — this is the same "prove the architecture,
// don't encode all 26 in one pass" scoping the brief asked for; adding one
// is a new schemas/*.js file + one registry entry, no other code changes.
import { EVENT_TYPE_NAMES, isCelebratory } from '../eventTypeNames';
import { FORBIDDEN_SCHEMA_KEYS } from './types';
import hinduWeddingSchema from './schemas/hinduWedding';
import funeralLastRitesSchema from './schemas/funeralLastRites';
import genericSchema from './schemas/generic';

const SCHEMAS_BY_SLUG = Object.freeze({
  'hindu-wedding': hinduWeddingSchema,
  'funeral-last-rites': funeralLastRitesSchema,
});

// Returns the dedicated schema for eventTypeSlug if one is registered,
// otherwise the generic fallback — never null, never throws. Matches this
// codebase's existing "unknown slug never fails closed" precedent
// (eventTypeName()/isCelebratory() in lib/eventTypeNames.js).
export function getInviteSchema(eventTypeSlug) {
  if (eventTypeSlug && SCHEMAS_BY_SLUG[eventTypeSlug]) return SCHEMAS_BY_SLUG[eventTypeSlug];
  return genericSchema;
}

export function isKnownEventTypeSlug(slug) {
  return !!slug && Object.prototype.hasOwnProperty.call(EVENT_TYPE_NAMES, slug);
}

// Dev/test-time integrity check, not a runtime guard (nothing calls this on
// the hot path — it's exercised by scripts/verifyInviteSchemaFoundation.js
// and meant to be re-run any time a schema is added). Confirms:
//  1. every dedicated schema is registered under a real, live
//     event_type_slug (this wave's explicit "do not create a new
//     religion/tradition taxonomy — event_type_slug stays the one
//     discriminator" rule),
//  2. a schema's own internal `slug` field agrees with the key it's
//     registered under (catches a copy-paste mistake adding a 4th schema),
//  3. no schema declares a forbidden visual/design key (the "content must
//     stay design-independent" rule).
// Returns an array of human-readable problem strings — empty means clean.
export function validateSchemaRegistry() {
  const problems = [];
  for (const [slug, schema] of Object.entries(SCHEMAS_BY_SLUG)) {
    if (!isKnownEventTypeSlug(slug)) {
      problems.push(`Schema registered under unknown event_type_slug "${slug}" — not present in EVENT_TYPE_NAMES.`);
    }
    if (schema.slug !== slug) {
      problems.push(`Schema for "${slug}" has mismatched internal slug "${schema.slug}".`);
    }
    for (const forbiddenKey of FORBIDDEN_SCHEMA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(schema, forbiddenKey)) {
        problems.push(`Schema for "${slug}" declares forbidden visual/design key "${forbiddenKey}" — inviteSchemas must stay design-independent.`);
      }
    }
  }
  return problems;
}

// The one centralized non-festive resolver the brief asks for. Checked in
// order: (1) a dedicated schema's own explicit nonFestive boolean, when
// present — today only funeralLastRites.js sets one (true); (2) fallback to
// lib/eventTypeNames.js's existing isCelebratory() (the pre-existing,
// already-shipped mechanism) for every other slug, including any resolving
// to the generic schema. This is the "existing isCelebratory() behaviour as
// rollout fallback" the brief specifies — a slug with no dedicated schema
// behaves identically to before this wave.
//
// Migrated call sites (see each file's own comment for the swap):
//   - screens/customer/ToranInvites.js (design-picker gating + prefill gate)
//   - screens/customer/GuestList.js (per-function design-picker gating)
//   - screens/customer/PlanView.js (countdown hero + accent-color gating)
// lib/todoResolver.js's own isCelebratory() usage (checklist template
// filtering) was deliberately left untouched — reviewed, out of scope for
// the invite architecture, still correct as-is.
export function isNonFestive(eventTypeSlug) {
  const schema = eventTypeSlug && SCHEMAS_BY_SLUG[eventTypeSlug];
  if (schema && typeof schema.nonFestive === 'boolean') return schema.nonFestive;
  return !isCelebratory(eventTypeSlug);
}
