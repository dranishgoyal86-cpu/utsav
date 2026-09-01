import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// anniversaryYears' own placeholder documents the derived-suggestion rule
// (25 = Silver, 50 = Golden, 60 = Diamond) as guidance text — the actual
// derivation is a future rendering/wording concern (not implemented this
// wave, no visual redesign), and the host can always override by simply
// typing a different value; nothing here computes or locks a label.
export default {
  slug: 'anniversary',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.anniversaryYears, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.couplePhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.originalWeddingDate, FIELD_STATUS.OPTIONAL),
    ]),
    section('presentation', [
      field(FIELD_DEFS.coupleQuote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.kickerText, FIELD_STATUS.OPTIONAL),
    ]),
    section('schedule', [
      field(FIELD_DEFS.vowRenewalEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.cakeCuttingTime, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.childrenAsHosts, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.WARM, WORDING_TONE.TRADITIONAL, WORDING_TONE.FORMAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
