import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// The surprise-party conditional: guestArrivalTime/celebrantArrivalTime/
// secrecyNote only reveal when surprisePartyEnabled is true — a concrete,
// exercised use of FIELD_STATUS.CONDITIONAL (types.js), not just declared-
// but-unused.
//
// slug is 'adult-birthday', not the brief's own shorthand 'birthday' —
// verified against the real canonical registry (lib/eventTypeNames.js's
// EVENT_TYPE_NAMES) before writing this: 'adult-birthday' is the actual
// live event_type_slug value ("Birthday" is only its display name); a
// literal 'birthday' slug does not exist anywhere in the app. Caught here
// specifically because the whole point of this wave's registry-validation
// rule is to catch exactly this kind of drift before it ships silently.
//
// Re-confirmed via a dedicated reconciliation pass, 2026-09-01: checked
// live events.event_type_slug (distinct values: adult-birthday,
// hindu-wedding, null — zero rows with a literal 'birthday' value),
// event_types, event_requirements, capability_rules, event_todo_templates,
// eventTaxonomy.js/eventTypeSlug.js's own birthday_kids/birthday_milestone
// sub-event bridge, and every other 'birthday' code reference in the repo
// (GuestList.js's INVITE_STYLE_TYPES 'birthday' id is the unrelated old
// 40-template legacy invite-style catalog, a different key namespace
// entirely — not an event_type_slug). Verdict: 'adult-birthday' is the
// sole canonical production slug (option A); no compatibility/alias layer
// is needed.
export default {
  slug: 'adult-birthday',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.celebrantName, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.milestoneAge, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.partyTheme, FIELD_STATUS.OPTIONAL),
    ]),
    section('presentation', [
      field(FIELD_DEFS.tagline, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.kickerText, FIELD_STATUS.OPTIONAL),
    ]),
    section('schedule', [
      field(FIELD_DEFS.selfHosted, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.surprisePartyEnabled, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.guestArrivalTime, FIELD_STATUS.CONDITIONAL, { conditionOn: 'surprisePartyEnabled' }),
      field(FIELD_DEFS.celebrantArrivalTime, FIELD_STATUS.CONDITIONAL, { conditionOn: 'surprisePartyEnabled' }),
      field(FIELD_DEFS.secrecyNote, FIELD_STATUS.CONDITIONAL, { conditionOn: 'surprisePartyEnabled' }),
    ]),
    section('hospitality', [
      field(FIELD_DEFS.activitiesNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.giftNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.mealNote, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.WARM, WORDING_TONE.PLAYFUL, WORDING_TONE.MODERN, WORDING_TONE.FORMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: true, travel: false, accommodation: false, dietary: true },
};
