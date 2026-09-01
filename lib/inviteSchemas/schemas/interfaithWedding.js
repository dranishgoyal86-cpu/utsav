import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// Deliberately no bride/groom labels anywhere in this schema — partner1Name/
// partner2Name (already neutral names, not "bride"/"groom") and
// family1Note/family2Note throughout. Default wording/content stays
// neutral; no religious symbolism is attached automatically anywhere here
// — traditionExplainerNote/etiquetteNote are plain host-written fields,
// never auto-generated.
export default {
  slug: 'interfaith-wedding',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
    ]),
    section('family', [
      field(FIELD_DEFS.family1Note, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.family2Note, FIELD_STATUS.RECOMMENDED),
    ]),
    section('media', [
      field(FIELD_DEFS.couplePhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.coupleQuote, FIELD_STATUS.OPTIONAL),
    ]),
    section('presentation', [
      field(FIELD_DEFS.kickerText, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.headlineText, FIELD_STATUS.OPTIONAL),
    ]),
    // Support for multiple ceremonies (each with its own name, tradition
    // label, date, time, venue, description, etiquette note, dress note) —
    // modeled as the schema's own SECTIONS-kind field rather than trying to
    // force a single-ceremony field shape onto a genuinely multi-ceremony
    // event type. Distinct from the universal customSections field below
    // (that one stays the free-form "anything else" extension point every
    // schema gets).
    section('ceremonies', [
      field(FIELD_DEFS.interfaithCeremonies, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.traditionExplainerNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('dress', [
      field(FIELD_DEFS.headCoveringNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.shoeRemovalNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.photographyNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.etiquetteNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  // No single dominant tradition to key a vocabulary off — host-entered
  // custom function names only, same null/empty shape as funeral-last-rites.
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.WARM, WORDING_TONE.MODERN, WORDING_TONE.FORMAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: true, partySize: true, travel: true, accommodation: true, dietary: true },
};
