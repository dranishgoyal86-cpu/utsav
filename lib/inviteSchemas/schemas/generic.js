// Fallback schema — used ONLY for an event_type_slug with no dedicated
// schema entry in lib/inviteSchemas/index.js. As of the invite-architecture
// wave's Part 3 (26-schema expansion), every one of the 26 live
// EVENT_TYPE_NAMES slugs now has its own dedicated schema — this file is
// therefore the safety net for an unrecognized/future slug only (a typo, a
// slug added to EVENT_TYPE_NAMES before its own dedicated schema exists,
// etc.), never a slug this app actually issues today. Kept deliberately
// simple and couple-shaped (matching the pre-Part-3 default every
// celebratory event used to get) rather than empty, so an unrecognized
// slug still gets a sane, working invite form instead of a blank one —
// same "don't fail closed on an unknown slug" precedent
// eventTypeName()/isCelebratory() (lib/eventTypeNames.js) already set.
//
// slug: null is the fallback marker (not a real event_type_slug) —
// index.js never looks this schema up by slug, only returns it as the
// default. nonFestive is deliberately left undefined here (not false) —
// isNonFestive() in index.js falls back to eventTypeNames.js's
// isCelebratory() for any slug resolving to this schema, so an unknown
// solemn slug is never silently treated as festive.
import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

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
    section('custom', [
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
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
  supportedWordingTones: [WORDING_TONE.WARM, WORDING_TONE.MODERN, WORDING_TONE.FORMAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
