import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'sports-event',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.sportName, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.headlineText, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.participationMode, FIELD_STATUS.REQUIRED),
    ]),
    section('media', [
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.tournamentType, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.categoryNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('logistics', [
      field(FIELD_DEFS.reportingTime, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.registrationInfo, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.entryFeeNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.prizesNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.kitEquipmentNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.parkingNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.sponsorsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.liveScoreUrl, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.ENERGETIC, WORDING_TONE.PROFESSIONAL, WORDING_TONE.PLAYFUL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: false, travel: false, accommodation: false, dietary: false },
};
