import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// Does not duplicate canonical accommodation/travel records
// (event_accommodations, event_invitees' travel columns) — every field
// here is guest-facing summary/itinerary copy only. "The invite should
// later be able to behave partly like an itinerary" per the spec — this
// wave's fields are the content substrate for that; the actual itinerary
// UI is a future rendering concern.
export default {
  slug: 'team-offsite',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.destinationNote, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.contactInfo, FIELD_STATUS.REQUIRED),
    ]),
    section('media', [
      field(FIELD_DEFS.tagline, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.OPTIONAL),
    ]),
    section('logistics', [
      field(FIELD_DEFS.accommodationInfoNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.scheduleNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.meetingPoint, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.departureTime, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.returnTime, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.activitiesNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.packingListNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.documentsToCarryNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.PROFESSIONAL, WORDING_TONE.ENERGETIC, WORDING_TONE.WARM, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: false, travel: true, accommodation: true, dietary: true },
};
