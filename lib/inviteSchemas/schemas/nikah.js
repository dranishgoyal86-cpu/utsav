import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// 'nikah' — couple-shaped like hindu-wedding, but its own religious-content
// fields (Bismillah/Qur'anic verse/dua) rather than reusing hindu-wedding's
// (deity/shloka/gotra) — see fields.js's header comment on why these stay
// distinct per tradition. Religious text must never auto-publish: every
// enabled/text pair below defaults to blank/false, host-selected only.
export default {
  slug: 'nikah',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
    ]),
    section('family', [
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.grandparentsNote, FIELD_STATUS.OPTIONAL),
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
      field(FIELD_DEFS.bismillahEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.bismillahText, FIELD_STATUS.CONDITIONAL, { conditionOn: 'bismillahEnabled' }),
      field(FIELD_DEFS.quranicVerseEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.quranicVerseText, FIELD_STATUS.CONDITIONAL, { conditionOn: 'quranicVerseEnabled' }),
      field(FIELD_DEFS.duaText, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.officiantName, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.guestNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: 'nikah',
  staticFunctionVocabulary: [
    { slug: 'mangni', name: 'Mangni', sortOrder: 0 },
    { slug: 'manjha', name: 'Manjha', sortOrder: 1 },
    { slug: 'mehendi', name: 'Mehendi', sortOrder: 2 },
    { slug: 'sangeet', name: 'Sangeet', sortOrder: 3 },
    { slug: 'nikah', name: 'Nikah', sortOrder: 4 },
    { slug: 'lunch', name: 'Lunch', sortOrder: 5 },
    { slug: 'dinner', name: 'Dinner', sortOrder: 6 },
    // Walima can carry its own host/date/time/venue per the spec — modeled
    // as its own event_functions row (source_sub_event_id/free text, same
    // as any other function), not a special-cased field here.
    { slug: 'walima', name: 'Walima', sortOrder: 7 },
    { slug: 'reception', name: 'Reception', sortOrder: 8 },
  ],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.FORMAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: true, partySize: true, travel: true, accommodation: true, dietary: true },
};
