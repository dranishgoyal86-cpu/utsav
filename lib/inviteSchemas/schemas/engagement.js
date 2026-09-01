import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'engagement',
  nonFestive: false,
  sections: [
    section('identity', [
      // First semantic field per the spec — ceremonyName carries the
      // suggested-options hint (Engagement/Ring Ceremony/Roka/Sagai/
      // Mangni/Nishchayam/Nichayathartham/Custom) in its placeholder text,
      // not a fixed dropdown — same "suggest, never force" precedent
      // ceremonyType/riteType use elsewhere in this registry.
      field(FIELD_DEFS.ceremonyName, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
    ]),
    section('family', [
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.familySurname, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.couplePhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.coupleQuote, FIELD_STATUS.OPTIONAL),
    ]),
    section('presentation', [
      field(FIELD_DEFS.kickerText, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.headlineText, FIELD_STATUS.OPTIONAL),
    ]),
    section('ritual', [
      field(FIELD_DEFS.muhurat, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.ringExchangeTime, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.weddingDateAnnouncementEnabled, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.scheduleNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.MODERN, WORDING_TONE.FORMAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
