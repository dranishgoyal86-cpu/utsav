import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// society name / flat number are deliberately NOT re-declared here — they
// are already canonical on `events` (society_name/flat_number, read via
// lib/eventContext.js's resolveVenue()) — only genuinely new address
// details (tower/block, landmark) and guest-facing arrival guidance
// (gateEntryNote, parkingNote) live here. gateEntryNote explicitly does
// not duplicate the real gate-pass system (guest_passes/capability
// 'society_gate_pass') — it's a plain guidance sentence, not a credential.
export default {
  slug: 'housewarming',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.ceremonyType, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
    ]),
    section('venue', [
      field(FIELD_DEFS.houseName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.towerBlock, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.landmark, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.gateEntryNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.parkingNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.OPTIONAL),
    ]),
    section('ritual', [
      field(FIELD_DEFS.muhurat, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.havanEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.lakshmiPujaEnabled, FIELD_STATUS.OPTIONAL),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.prasadNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
