// Shared semantic field definitions — the vocabulary every schema in
// schemas/*.js composes from, so "partner 1's name" is defined once, not
// re-typed per event type. A field here is pure metadata: what it's called,
// what kind of input it needs, which storage column (if any) it maps to,
// and a placeholder hint. It carries no status (required/optional/...) and
// no design/palette information — status is attached per-schema via
// types.js's field() helper; visuals stay entirely out of this file.
//
// legacyColumn: the real, already-shipped column on event_invite_content
// this field reads/writes (see supabase/migrations/20260825072314_event_
// invite_content.sql + its four additive follow-ons). A field with
// legacyColumn: null has no named column — it's stored in
// event_invite_content.schema_content (new, additive JSONB — see
// supabase/migrations/invite_schema_foundation.sql) instead, keyed by this
// field's own `key`. lib/inviteContentAdapter.js is the one place that
// storage split is actually resolved; nothing else in the app should care
// which of the two a given field uses.
import { FIELD_KIND, WORDING_MODE } from './types';

export const FIELD_DEFS = Object.freeze({
  partner1Name: {
    key: 'partner1Name', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: 'partner_1_name', label: 'Partner 1 name', placeholderHint: 'e.g. Aarav',
  },
  partner2Name: {
    key: 'partner2Name', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: 'partner_2_name', label: 'Partner 2 name', placeholderHint: 'e.g. Meera',
  },
  hostedBy: {
    key: 'hostedBy', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'hosted_by', label: 'Hosted by', placeholderHint: 'e.g. The Sharma and Verma families',
  },
  couplePhotoUrl: {
    key: 'couplePhotoUrl', kind: FIELD_KIND.PHOTO, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: 'couple_photo_url', label: 'Photo', placeholderHint: null,
  },
  coupleQuote: {
    key: 'coupleQuote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'couple_quote', label: 'A line in your own words', placeholderHint: 'e.g. Two families, one celebration',
  },
  kickerText: {
    key: 'kickerText', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'kicker_text', label: 'Kicker text', placeholderHint: "e.g. YOU'RE INVITED",
  },
  headlineText: {
    key: 'headlineText', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'headline_text', label: 'Headline text', placeholderHint: null,
  },
  subjectNameLine1: {
    key: 'subjectNameLine1', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: 'subject_name_line1', label: 'Name — line 1', placeholderHint: 'e.g. Shri Ramesh',
  },
  subjectNameLine2: {
    key: 'subjectNameLine2', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: 'subject_name_line2', label: 'Name — line 2', placeholderHint: 'e.g. Chandra Goyal',
  },
  subjectYears: {
    key: 'subjectYears', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: 'subject_years', label: 'Years', placeholderHint: 'e.g. 1947 — 2026',
  },
  detailLine1: {
    key: 'detailLine1', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'detail_line1', label: 'Details — line 1', placeholderHint: 'e.g. Prayer meeting · 18 August, 4 PM',
  },
  detailLine2: {
    key: 'detailLine2', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'detail_line2', label: 'Details — line 2', placeholderHint: 'e.g. Venue / address',
  },
  // First JSONB-only semantic field — no legacyColumn, proves the
  // schema_content storage path end-to-end. Not yet rendered by
  // ToranCoverCard/StillnessCard (both stay visually unchanged this wave,
  // per the brief) — captured and round-tripped, awaiting the future
  // design-archetype wave to decide how/whether to surface it.
  invocationText: {
    key: 'invocationText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Invocation (optional)', placeholderHint: 'e.g. an opening line, shloka, or blessing',
  },
});
