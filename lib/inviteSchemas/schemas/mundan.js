import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'mundan',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.ceremonyCustomName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.childName, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.REQUIRED),
    ]),
    section('media', [
      field(FIELD_DEFS.subjectPhotoUrl, FIELD_STATUS.RECOMMENDED),
    ]),
    section('ritual', [
      field(FIELD_DEFS.muhurat, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.grandparentsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.invocationText, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.prasadNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
