// Dedicated schema for 'hindu-wedding' — chosen as one of this wave's two
// proof-of-architecture slugs because it's the one event type with real,
// live sub_events rows (7, seeded in event_requirements.sql) for the
// function-vocabulary resolver to actually exercise against real data
// rather than an empty table.
//
// Field set is identical to schemas/generic.js's (same 7 legacy-column
// fields, same status) plus one new field, invocationText — a JSONB-only
// (no legacyColumn) semantic field added specifically to prove the new
// schema_content storage path end-to-end. It is optional and not yet
// rendered by any card component (ToranCoverCard/StillnessCard stay
// visually unchanged this wave), so its presence has zero effect on
// existing hindu-wedding invites unless a host actively fills it in.
import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS } from '../types';

export default {
  slug: 'hindu-wedding',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.couplePhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.coupleQuote, FIELD_STATUS.OPTIONAL),
    ]),
    section('presentation', [
      field(FIELD_DEFS.kickerText, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.headlineText, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.invocationText, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  // Tells lib/functionVocabulary.js's resolver "this event type has a real
  // vocabulary concept" — the resolver itself is the one place that
  // actually knows this maps to a sub_events lookup keyed by
  // event_types.slug == this same string; this schema only names the key,
  // per the brief's explicit "schema must not know suggestions live in
  // sub_events" rule.
  functionVocabularyKey: 'hindu-wedding',
  staticFunctionVocabulary: [],
  guestResponseSchema: null,
};
