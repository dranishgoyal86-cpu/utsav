import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'anand-karaj',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
    ]),
    section('family', [
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.grandparentsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.familySurname, FIELD_STATUS.OPTIONAL),
    ]),
    section('venue', [
      field(FIELD_DEFS.gurdwaraAddress, FIELD_STATUS.REQUIRED),
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
      field(FIELD_DEFS.ikOnkarEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.gurbaniLine, FIELD_STATUS.CONDITIONAL, { conditionOn: 'ikOnkarEnabled' }),
      field(FIELD_DEFS.langarTime, FIELD_STATUS.OPTIONAL),
    ]),
    section('dress', [
      field(FIELD_DEFS.headCoveringNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: 'anand-karaj',
  staticFunctionVocabulary: [
    { slug: 'roka', name: 'Roka', sortOrder: 0 },
    { slug: 'kurmai', name: 'Kurmai', sortOrder: 1 },
    { slug: 'mehendi', name: 'Mehendi', sortOrder: 2 },
    { slug: 'jaggo', name: 'Jaggo', sortOrder: 3 },
    { slug: 'chooda', name: 'Chooda', sortOrder: 4 },
    { slug: 'sangeet', name: 'Sangeet', sortOrder: 5 },
    { slug: 'baraat', name: 'Baraat', sortOrder: 6 },
    { slug: 'milni', name: 'Milni', sortOrder: 7 },
    { slug: 'breakfast', name: 'Breakfast', sortOrder: 8 },
    { slug: 'anand-karaj', name: 'Anand Karaj', sortOrder: 9 },
    { slug: 'ardas', name: 'Ardas', sortOrder: 10 },
    { slug: 'langar', name: 'Langar', sortOrder: 11 },
    { slug: 'reception', name: 'Reception', sortOrder: 12 },
  ],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.FORMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: true, partySize: true, travel: true, accommodation: true, dietary: true },
};
