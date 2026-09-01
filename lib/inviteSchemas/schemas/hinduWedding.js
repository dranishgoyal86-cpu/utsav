// Dedicated schema for 'hindu-wedding' — chosen as one of the foundation
// wave's two proof-of-architecture slugs because it's the one event type
// with real, live sub_events rows (7, seeded in event_requirements.sql)
// for the function-vocabulary resolver to exercise against real data.
// invite-architecture wave, Part 3 — expanded from the foundation wave's
// 8-field version to the full spec, still 100% backward compatible: every
// field the foundation wave shipped (partner1Name/partner2Name/hostedBy/
// couplePhotoUrl/coupleQuote/kickerText/headlineText/invocationText) is
// unchanged, same legacyColumn, same status. Everything below is
// additive.
import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'hindu-wedding',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.partner1Name, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.partner2Name, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.OPTIONAL),
    ]),
    // Required per the spec: bride/groom (partner1Name/partner2Name above),
    // host names (hostedBy above), wedding date/venue/time — these last
    // three are already canonical on `events` (event_date/venue/event_time)
    // and reach ToranCoverCard via its own eventDate/venue props, so they
    // are deliberately NOT re-declared as schema_content fields here (see
    // fields.js's header comment on this exact point).
    section('family', [
      field(FIELD_DEFS.grandparentsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.familySurname, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.familyOrigin, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.gotraBride, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.gotraGroom, FIELD_STATUS.OPTIONAL),
    ]),
    section('media', [
      field(FIELD_DEFS.couplePhotoUrl, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.coupleQuote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.monogram, FIELD_STATUS.OPTIONAL),
    ]),
    section('presentation', [
      field(FIELD_DEFS.kickerText, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.headlineText, FIELD_STATUS.OPTIONAL),
    ]),
    section('ritual', [
      field(FIELD_DEFS.muhurat, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.ceremonyTimesNote, FIELD_STATUS.OPTIONAL),
      // Religious text must never auto-publish — invocationText stays a
      // plain optional field the host writes themselves (no default
      // shloka/deity text is ever generated here or anywhere in this
      // wave), same discipline every wedding-family schema in this file
      // uses for its own religious-content fields.
      field(FIELD_DEFS.invocationText, FIELD_STATUS.OPTIONAL),
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
  functionVocabularyKey: 'hindu-wedding',
  // Static fallback only used if the live sub_events table ever comes back
  // empty for this slug (it doesn't today — 7 real rows exist) — kept in
  // sync with the spec's own suggested vocabulary so the fallback path is
  // still a faithful list, not a placeholder.
  staticFunctionVocabulary: [
    { slug: 'roka', name: 'Roka', sortOrder: 0 },
    { slug: 'sagai', name: 'Sagai', sortOrder: 1 },
    { slug: 'tilak', name: 'Tilak', sortOrder: 2 },
    { slug: 'bhaat', name: 'Bhaat', sortOrder: 3 },
    { slug: 'mayra', name: 'Mayra', sortOrder: 4 },
    { slug: 'mata-ki-chowki', name: 'Mata Ki Chowki', sortOrder: 5 },
    { slug: 'ganesh-sthapana', name: 'Ganesh Sthapana', sortOrder: 6 },
    { slug: 'mehendi', name: 'Mehendi', sortOrder: 7 },
    { slug: 'haldi', name: 'Haldi', sortOrder: 8 },
    { slug: 'sangeet', name: 'Sangeet', sortOrder: 9 },
    { slug: 'cocktail', name: 'Cocktail', sortOrder: 10 },
    { slug: 'welcome-dinner', name: 'Welcome Dinner', sortOrder: 11 },
    { slug: 'wedding', name: 'Wedding', sortOrder: 12 },
    { slug: 'baraat', name: 'Baraat', sortOrder: 13 },
    { slug: 'milni', name: 'Milni', sortOrder: 14 },
    { slug: 'jaimala', name: 'Jaimala', sortOrder: 15 },
    { slug: 'pheras', name: 'Pheras', sortOrder: 16 },
    { slug: 'vidaai', name: 'Vidaai', sortOrder: 17 },
    { slug: 'reception', name: 'Reception', sortOrder: 18 },
    { slug: 'brunch', name: 'Brunch', sortOrder: 19 },
  ],
  supportedWordingTones: [WORDING_TONE.TRADITIONAL, WORDING_TONE.WARM, WORDING_TONE.MODERN, WORDING_TONE.FORMAL, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  // Future extension point only (see lib/inviteSchemas/index.js's header
  // comment) — not read anywhere yet, RSVPScreen.js is not rewritten this
  // wave. Named here so a future guest-response-schema build has a real
  // starting shape for this event type rather than inventing one cold.
  guestResponseDefaults: {
    attendance: true,
    perFunctionRsvp: true,
    partySize: true,
    travel: true,
    accommodation: true,
    dietary: true,
  },
};
