import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// The name-is-secret conditional: babyName only reveals in invite content
// when nameIsSecret is NOT true — the inverse condition from birthday's
// surprise-party pattern (there, fields reveal WHEN the boolean is true;
// here, a field hides WHILE the boolean is true), exercising field()'s
// custom `condition` predicate rather than its default
// `values[conditionOn] === true` shape.
export default {
  slug: 'naming-ceremony',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.nameIsSecret, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.babyName, FIELD_STATUS.CONDITIONAL, {
        conditionOn: 'nameIsSecret',
        condition: (values) => values.nameIsSecret !== true,
      }),
    ]),
    section('family', [
      field(FIELD_DEFS.grandparentsNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.subjectPhotoUrl, FIELD_STATUS.OPTIONAL),
    ]),
    section('ritual', [
      field(FIELD_DEFS.cradleCeremonyEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.muhurat, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.pujaTime, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.WARM, WORDING_TONE.TRADITIONAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
