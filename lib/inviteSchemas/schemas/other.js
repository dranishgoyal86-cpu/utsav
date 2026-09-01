import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// Explicit catch-all only — this schema must never be reached via free-text
// matching (lib/eventTypeNames.js's matchEventTypeText() already excludes
// 'other' from its substring-match pass for exactly this reason: too
// common a word to safely infer). It's reached only when a host explicitly
// picks 'Other' as the event type in EventPlanner.js, or via
// getInviteSchema()'s registry lookup for the literal slug 'other' — this
// is a real, deliberately-chosen dedicated schema (distinct from the
// registry's separate, slug-less generic fallback used for any of the
// other ~unmapped slugs).
export default {
  slug: 'other',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.headlineText, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.subtitleNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.honoureesNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
    ]),
    section('schedule', [
      field(FIELD_DEFS.scheduleNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.guestNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.galleryReferenceNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.WARM, WORDING_TONE.FORMAL, WORDING_TONE.MINIMAL, WORDING_TONE.MODERN, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
