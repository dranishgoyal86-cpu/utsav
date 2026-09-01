import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// All terminology stays host-editable — ceremonyDescriptionNote below is
// exactly that: a plain optional field, no fixed doctrinal text generated
// anywhere in this schema.
export default {
  slug: 'parsi-wedding',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
    ]),
    section('family', [
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.familySurname, FIELD_STATUS.RECOMMENDED),
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
      field(FIELD_DEFS.religiousSymbolEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.familyBlessingText, FIELD_STATUS.CONDITIONAL, { conditionOn: 'religiousSymbolEnabled' }),
      field(FIELD_DEFS.ceremonyDescriptionNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.receptionVenue, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.mealNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: 'parsi-wedding',
  staticFunctionVocabulary: [
    { slug: 'engagement', name: 'Engagement', sortOrder: 0 },
    { slug: 'madhavsaro', name: 'Madhavsaro', sortOrder: 1 },
    { slug: 'adarni', name: 'Adarni', sortOrder: 2 },
    { slug: 'supra-nu-murat', name: 'Supra Nu Murat', sortOrder: 3 },
    { slug: 'wedding-ceremony', name: 'Wedding Ceremony', sortOrder: 4 },
    { slug: 'reception', name: 'Reception', sortOrder: 5 },
    { slug: 'dinner', name: 'Dinner', sortOrder: 6 },
  ],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.FORMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: true, partySize: true, travel: true, accommodation: true, dietary: true },
};
