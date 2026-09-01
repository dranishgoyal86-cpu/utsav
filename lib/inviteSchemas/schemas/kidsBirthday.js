import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'kids-birthday',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.childName, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.turningAge, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.subjectPhotoUrl, FIELD_STATUS.RECOMMENDED),
      // partyTheme is deliberately BOTH semantic content (shown to guests,
      // e.g. "Jungle theme — dress the part!") AND a future visual input
      // for the design-archetype layer (per the spec) — this wave only
      // captures it as plain text, no theme-driven visuals yet.
      field(FIELD_DEFS.partyTheme, FIELD_STATUS.RECOMMENDED),
    ]),
    section('presentation', [
      field(FIELD_DEFS.tagline, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.kickerText, FIELD_STATUS.OPTIONAL),
    ]),
    section('schedule', [
      field(FIELD_DEFS.cakeCuttingTime, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.endTime, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.activitiesNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.giftNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.siblingsNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.PLAYFUL, WORDING_TONE.WARM, WORDING_TONE.ENERGETIC, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
