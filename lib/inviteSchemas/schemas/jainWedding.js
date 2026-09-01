import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'jain-wedding',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.REQUIRED),
    ]),
    section('family', [
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.grandparentsNote, FIELD_STATUS.OPTIONAL),
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
      field(FIELD_DEFS.muhurat, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.navkarMantraEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.navkarMantraText, FIELD_STATUS.CONDITIONAL, { conditionOn: 'navkarMantraEnabled' }),
      field(FIELD_DEFS.familyBlessingText, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.mealNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.dietaryNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: 'jain-wedding',
  staticFunctionVocabulary: [
    { slug: 'sagai', name: 'Sagai', sortOrder: 0 },
    { slug: 'lagna-lekhan', name: 'Lagna Lekhan', sortOrder: 1 },
    { slug: 'mehendi', name: 'Mehendi', sortOrder: 2 },
    { slug: 'sangeet', name: 'Sangeet', sortOrder: 3 },
    { slug: 'haldi', name: 'Haldi', sortOrder: 4 },
    { slug: 'baraat', name: 'Baraat', sortOrder: 5 },
    { slug: 'wedding-ceremony', name: 'Wedding Ceremony', sortOrder: 6 },
    { slug: 'reception', name: 'Reception', sortOrder: 7 },
  ],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.FORMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: true, partySize: true, travel: true, accommodation: true, dietary: true },
};
