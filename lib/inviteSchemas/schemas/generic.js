// Fallback schema — used for any event_type_slug with no dedicated schema
// entry in lib/inviteSchemas/index.js (which today means all 25 of the 26
// live EVENT_TYPE_NAMES slugs except 'hindu-wedding' and
// 'funeral-last-rites'; see that file's own header comment for why only
// those two are worth a dedicated entry in this first pass).
//
// Reproduces exactly the couple-shaped field set every celebratory event
// already gets today via ToranInvites.js's default (non-stillness,
// non-diya) branch — same 7 fields, same status, same placeholders — so
// switching an existing event with no dedicated schema over to this
// registry is a no-op for its content, not a behavior change.
//
// slug: null is the fallback marker (not a real event_type_slug) —
// index.js never looks this schema up by slug, only returns it as the
// default. nonFestive is deliberately left undefined here (not false) —
// isNonFestive() in index.js falls back to eventTypeNames.js's
// isCelebratory() for any slug resolving to this schema, which is the
// correct behavior for the ~25 slugs sharing it (some celebratory, and if
// a future slug is added to EVENT_TYPE_CELEBRATORY as solemn, this schema
// must not silently override that with a hardcoded `false`).
import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS } from '../types';

export default {
  slug: null,
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
  ],
  // No DB-backed sub_events vocabulary is assumed for a generic/unknown
  // event type — the function-vocabulary resolver (lib/functionVocabulary.js)
  // still checks live sub_events first regardless of this key (it's keyed
  // by event_type_slug via the caller, not by this schema field), so a
  // slug using this fallback schema still gets real DB suggestions if any
  // exist; this is only the schema-declared static fallback, and generic
  // deliberately has none.
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  // Placeholder for the future guest-response schema (attendance,
  // per-function RSVP, travel, etc.) — see lib/inviteSchemas/index.js's
  // header comment on why this stays null in this wave.
  guestResponseSchema: null,
};
