import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// colourTheme (in 'media') is a plain free-text field the host fills in —
// this schema never infers or defaults a colour from genderRevealEnabled
// or anything else.
export default {
  slug: 'baby-shower',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.ceremonyType, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
    ]),
    section('family', [
      field(FIELD_DEFS.fatherToBeNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.family1Note, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.family2Note, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.colourTheme, FIELD_STATUS.OPTIONAL),
    ]),
    section('ritual', [
      field(FIELD_DEFS.ritualTime, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.blessingText, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.activitiesNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.genderRevealEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.registryUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.giftNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.WARM, WORDING_TONE.PLAYFUL, WORDING_TONE.TRADITIONAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
