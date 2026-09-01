import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// organisationName reuses hostedBy (identical semantic role: "who's
// putting this on") rather than a near-duplicate field; heroPhotoUrl
// doubles as the logo slot. Programme items (time/title/type/speaker/
// room/description per item) are deliberately NOT modeled as individual
// structured fields this wave — scheduleNote (freeform) plus the
// universal customSections extension point cover this without inventing
// a bespoke array field; a future design-archetype pass can promote it to
// a first-class repeatable field if real usage calls for it. Does not
// duplicate actual registration/attendee records — registrationInfo is
// guest-facing instructions/links only.
export default {
  slug: 'corporate-conference',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.headlineText, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.registrationInfo, FIELD_STATUS.REQUIRED),
    ]),
    section('media', [
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.tagline, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.conferenceEdition, FIELD_STATUS.OPTIONAL),
    ]),
    section('programme', [
      field(FIELD_DEFS.scheduleNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.speakersNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.chiefGuestName, FIELD_STATUS.OPTIONAL),
    ]),
    section('logistics', [
      field(FIELD_DEFS.checkInTime, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.parkingNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.accommodationInfoNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.sponsorsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.websiteOrTicketUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.contactInfo, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.PROFESSIONAL, WORDING_TONE.FORMAL, WORDING_TONE.MODERN, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: false, travel: true, accommodation: true, dietary: true },
};
