import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// Tone defaults stay calm/spacious/non-festive per the spec — this schema
// intentionally excludes PLAYFUL/ENERGETIC from supportedWordingTones
// below (unlike kids-birthday/concert), even though it isn't marked
// nonFestive:true (a wellness retreat is still a celebratory-adjacent,
// positive event per lib/eventTypeNames.js's EVENT_TYPE_CELEBRATORY —
// "calm" is a tone choice, not the same axis as the isNonFestive() safety
// gate).
export default {
  slug: 'wellness-retreat',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.headlineText, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.destinationNote, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.facilitatorName, FIELD_STATUS.REQUIRED),
    ]),
    section('media', [
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customMessage, FIELD_STATUS.RECOMMENDED),
    ]),
    section('programme', [
      field(FIELD_DEFS.scheduleNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.accommodationInfoNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.bookingInfoNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.activitiesNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('logistics', [
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.dietaryNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.includedNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.notIncludedNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.packingListNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.fitnessLevelNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.medicalNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.pricingNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.capacityNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.CALM, WORDING_TONE.MINIMAL, WORDING_TONE.WARM, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: false, travel: true, accommodation: true, dietary: true },
};
