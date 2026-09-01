import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'christian-wedding',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
    ]),
    section('family', [
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.RECOMMENDED),
    ]),
    section('venue', [
      field(FIELD_DEFS.churchAddress, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.receptionVenue, FIELD_STATUS.RECOMMENDED),
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
      field(FIELD_DEFS.scriptureEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.scriptureText, FIELD_STATUS.CONDITIONAL, { conditionOn: 'scriptureEnabled' }),
      field(FIELD_DEFS.prayerText, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.officiantName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.massType, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.giftNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: 'christian-wedding',
  staticFunctionVocabulary: [
    { slug: 'engagement', name: 'Engagement', sortOrder: 0 },
    { slug: 'bridal-shower', name: 'Bridal Shower', sortOrder: 1 },
    { slug: 'wedding-service', name: 'Wedding Service', sortOrder: 2 },
    { slug: 'wedding-mass', name: 'Wedding Mass', sortOrder: 3 },
    { slug: 'cocktails', name: 'Cocktails', sortOrder: 4 },
    { slug: 'reception', name: 'Reception', sortOrder: 5 },
    { slug: 'dinner', name: 'Dinner', sortOrder: 6 },
    { slug: 'after-party', name: 'After Party', sortOrder: 7 },
  ],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.MODERN, WORDING_TONE.FORMAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: true, partySize: true, travel: true, accommodation: true, dietary: true },
};
