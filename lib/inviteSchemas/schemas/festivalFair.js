import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'festival-fair',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.headlineText, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.organiserName, FIELD_STATUS.REQUIRED),
    ]),
    section('media', [
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.tagline, FIELD_STATUS.OPTIONAL),
    ]),
    section('logistics', [
      field(FIELD_DEFS.openingHoursNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.featuredAttractionsNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.closingDate, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.scheduleNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.chiefGuestName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.entryFeeNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.shuttleNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.parkingNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.vendorStallInfoNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.sponsorsNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.ENERGETIC, WORDING_TONE.WARM, WORDING_TONE.PLAYFUL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: false, perFunctionRsvp: false, partySize: false, travel: false, accommodation: false, dietary: false },
};
