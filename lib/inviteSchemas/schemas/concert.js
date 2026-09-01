import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// Does not store actual ticket/pass records — websiteOrTicketUrl is a
// plain link out, same as every other schema's external-link fields.
export default {
  slug: 'concert',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.headlineText, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.RECOMMENDED),
    ]),
    section('media', [
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.doorsOpenTime, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.websiteOrTicketUrl, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.genreNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('logistics', [
      field(FIELD_DEFS.artistNamesNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.ageGuidance, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.ticketTiersNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.prohibitedItemsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.parkingNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.contactInfo, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.ENERGETIC, WORDING_TONE.MODERN, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: false, travel: false, accommodation: false, dietary: false },
};
