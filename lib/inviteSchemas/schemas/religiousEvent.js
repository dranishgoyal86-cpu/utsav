import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// Does not infer religion from the generic 'religious-event' slug —
// religiousEventType/traditionNote/focusDeity are all plain host-entered
// text (with a suggestion list in the placeholder hint, never a forced
// selection), matching every other religious-content field in this
// registry. All sensitive religious content is explicitly host-entered.
export default {
  slug: 'religious-event',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.religiousEventType, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
    ]),
    section('ritual', [
      field(FIELD_DEFS.traditionNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.focusDeity, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.invocationText, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.religiousLeaderName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.aartiTime, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.bhajanTime, FIELD_STATUS.OPTIONAL),
    ]),
    section('schedule', [
      field(FIELD_DEFS.scheduleNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.prasadNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.bhandaraNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('dress', [
      field(FIELD_DEFS.headCoveringNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.shoeRemovalNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.FORMAL, WORDING_TONE.CALM, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
