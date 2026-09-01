import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'exhibition',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.headlineText, FIELD_STATUS.REQUIRED),
    ]),
    section('media', [
      field(FIELD_DEFS.artistNamesNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.customMessage, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.OPTIONAL),
    ]),
    section('logistics', [
      field(FIELD_DEFS.curatorName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.galleryName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.closingDate, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.openingHoursNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.chiefGuestName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.entryFeeNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.registrationInfo, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.FORMAL, WORDING_TONE.MODERN, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: false, travel: false, accommodation: false, dietary: false },
};
