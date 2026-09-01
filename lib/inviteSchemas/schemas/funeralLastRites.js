// Dedicated schema for 'funeral-last-rites' — this wave's second proof-of-
// architecture slug, chosen because it's the app's one existing non-
// celebratory event type and the concrete case the brief's funeral/solemn
// safeguards are written against.
//
// Field set reproduces exactly the subject-shaped 5 fields
// ToranInvites.js's Stillness branch already collects today (same legacy
// columns, same status, same placeholders) — no behavior change for
// existing funeral-last-rites invites, just re-routed through the schema.
//
// nonFestive: true is the one explicit, code-level, non-optional flag this
// schema sets — lib/inviteSchemas/index.js's isNonFestive() reads this
// directly (not the isCelebratory() fallback) for this slug, and every
// call site that gates festive behavior (invite design choice, countdown,
// celebratory motion/wording) is expected to route through isNonFestive()
// rather than re-deriving this on its own. See that file's header comment
// for the full list of call sites already migrated.
import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS } from '../types';

export default {
  slug: 'funeral-last-rites',
  nonFestive: true,
  sections: [
    section('subject', [
      field(FIELD_DEFS.subjectNameLine1, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.subjectNameLine2, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.subjectYears, FIELD_STATUS.OPTIONAL),
    ]),
    section('details', [
      field(FIELD_DEFS.detailLine1, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.detailLine2, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  // No function vocabulary for this event type — a memorial/prayer meeting
  // has no "functions" concept the way a multi-day wedding does, and no
  // sub_events rows exist for this slug (verified live, see the
  // implementation report). null here means the resolver skips straight to
  // "host types a fully custom name" with nothing pre-suggested, same
  // behavior as generic.js's null path.
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  guestResponseSchema: null,
};
