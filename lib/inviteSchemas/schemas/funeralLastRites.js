// Dedicated schema for 'funeral-last-rites' — the foundation wave's second
// proof-of-architecture slug, and the concrete case the funeral/solemn
// safeguards are written against. invite-architecture wave, Part 3 —
// expanded with the fuller optional field set from the spec; the original
// 5 foundation-wave fields (subjectNameLine1/2/subjectYears/detailLine1/2)
// are unchanged, same legacyColumn, same status — fully backward
// compatible with any invite already saved under this schema.
//
// nonFestive: true is the one explicit, code-level, non-optional flag this
// schema sets — lib/inviteSchemas/index.js's isNonFestive() reads this
// directly (not the isCelebratory() fallback) for this slug. Every call
// site that gates festive behavior (invite design choice, countdown,
// celebratory motion/wording, RSVP wording) routes through isNonFestive()
// — see that file's header comment for the full, current list of call
// sites.
import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

export default {
  slug: 'funeral-last-rites',
  nonFestive: true,
  sections: [
    section('subject', [
      field(FIELD_DEFS.subjectNameLine1, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.subjectNameLine2, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.subjectYears, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.subjectPhotoUrl, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.dateOfPassing, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.dateOfBirth, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.ageAtPassing, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.relationshipDescription, FIELD_STATUS.OPTIONAL),
    ]),
    section('details', [
      field(FIELD_DEFS.riteType, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.detailLine1, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.detailLine2, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.riteDetailsNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.familyContactInfo, FIELD_STATUS.REQUIRED),
    ]),
    section('family', [
      field(FIELD_DEFS.parentsNote, FIELD_STATUS.RECOMMENDED),
    ]),
    section('custom', [
      // Neutral/respectful terms only — same discipline as every other
      // schema's religious-content fields, just applied to the memorial
      // register instead: this is a plain host-written field, never
      // auto-generated copy.
      field(FIELD_DEFS.memorialMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  // No function vocabulary for this event type — a memorial/prayer meeting
  // has no "functions" concept the way a multi-day wedding does, and no
  // sub_events rows exist for this slug (verified live). null here means
  // the resolver skips straight to "host types a fully custom name" with
  // nothing pre-suggested, same behavior as any other schema with no
  // vocabulary.
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.SOLEMN, WORDING_TONE.FORMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: {
    attendance: true,
    perFunctionRsvp: false,
    partySize: true,
    travel: false,
    accommodation: false,
    dietary: false,
  },
};
