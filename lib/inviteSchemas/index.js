// Invite schema registry — the single lookup point from an event's
// event_type_slug to its content schema (sections/fields/status/wording
// modes/function-vocabulary key/wording tones/guest-response defaults).
// Design-independent by construction: see types.js's FORBIDDEN_SCHEMA_KEYS
// and validateSchemaRegistry() below.
//
// invite-architecture wave, Part 3 — all 26 canonical event_type_slug
// values (lib/eventTypeNames.js's EVENT_TYPE_NAMES, the one taxonomy this
// registry is validated against — no new religion/tradition table exists
// or is created here) now have a dedicated schema. The generic fallback
// (schemas/generic.js) is kept as the safety net for an unrecognized/
// future slug only — nothing this app issues today should ever actually
// resolve to it.
import { EVENT_TYPE_NAMES, isCelebratory } from '../eventTypeNames';
import { FORBIDDEN_SCHEMA_KEYS } from './types';

import hinduWedding from './schemas/hinduWedding';
import nikah from './schemas/nikah';
import anandKaraj from './schemas/anandKaraj';
import christianWedding from './schemas/christianWedding';
import parsiWedding from './schemas/parsiWedding';
import jainWedding from './schemas/jainWedding';
import interfaithWedding from './schemas/interfaithWedding';
import engagement from './schemas/engagement';
import kidsBirthday from './schemas/kidsBirthday';
import adultBirthday from './schemas/birthday';
import anniversary from './schemas/anniversary';
import mundan from './schemas/mundan';
import babyShower from './schemas/babyShower';
import namingCeremony from './schemas/namingCeremony';
import housewarming from './schemas/housewarming';
import religiousEvent from './schemas/religiousEvent';
import funeralLastRites from './schemas/funeralLastRites';
import corporateConference from './schemas/corporateConference';
import productLaunch from './schemas/productLaunch';
import teamOffsite from './schemas/teamOffsite';
import exhibition from './schemas/exhibition';
import concert from './schemas/concert';
import festivalFair from './schemas/festivalFair';
import sportsEvent from './schemas/sportsEvent';
import wellnessRetreat from './schemas/wellnessRetreat';
import other from './schemas/other';
import genericSchema from './schemas/generic';

const SCHEMAS_BY_SLUG = Object.freeze({
  'hindu-wedding': hinduWedding,
  'nikah': nikah,
  'anand-karaj': anandKaraj,
  'christian-wedding': christianWedding,
  'parsi-wedding': parsiWedding,
  'jain-wedding': jainWedding,
  'interfaith-wedding': interfaithWedding,
  'engagement': engagement,
  'kids-birthday': kidsBirthday,
  'adult-birthday': adultBirthday,
  'anniversary': anniversary,
  'mundan': mundan,
  'baby-shower': babyShower,
  'naming-ceremony': namingCeremony,
  'housewarming': housewarming,
  'religious-event': religiousEvent,
  'funeral-last-rites': funeralLastRites,
  'corporate-conference': corporateConference,
  'product-launch': productLaunch,
  'team-offsite': teamOffsite,
  'exhibition': exhibition,
  'concert': concert,
  'festival-fair': festivalFair,
  'sports-event': sportsEvent,
  'wellness-retreat': wellnessRetreat,
  'other': other,
});

// Returns the dedicated schema for eventTypeSlug if one is registered,
// otherwise the generic fallback — never null, never throws. Matches this
// codebase's existing "unknown slug never fails closed" precedent
// (eventTypeName()/isCelebratory() in lib/eventTypeNames.js). As of Part 3,
// every real EVENT_TYPE_NAMES slug hits a dedicated schema — the fallback
// branch below is reachable only for a slug outside that registry.
export function getInviteSchema(eventTypeSlug) {
  if (eventTypeSlug && SCHEMAS_BY_SLUG[eventTypeSlug]) return SCHEMAS_BY_SLUG[eventTypeSlug];
  return genericSchema;
}

export function isKnownEventTypeSlug(slug) {
  return !!slug && Object.prototype.hasOwnProperty.call(EVENT_TYPE_NAMES, slug);
}

// Dev/test-time integrity check, not a runtime guard (nothing calls this on
// the hot path — it's exercised by scripts/verifyInviteSchemaFoundation.js
// and meant to be re-run any time a schema is added). Confirms:
//  1. every dedicated schema is registered under a real, live
//     event_type_slug (this wave's explicit "do not create a new
//     religion/tradition taxonomy — event_type_slug stays the one
//     discriminator" rule),
//  2. a schema's own internal `slug` field agrees with the key it's
//     registered under (catches a copy-paste mistake — this exact check
//     is what caught 'birthday' vs the real 'adult-birthday' slug while
//     building Part 3, see schemas/birthday.js's own comment),
//  3. no schema declares a forbidden visual/design key (the "content must
//     stay design-independent" rule),
//  4. every schema has at least one REQUIRED field (an invite schema with
//     zero required content isn't really describing "what belongs to this
//     event type"),
//  5. every field's `status` is a real FIELD_STATUS value and, for TEXT/
//     TEXTAREA/PHOTO/BOOLEAN/SECTIONS, `kind` is a real FIELD_KIND value
//     (field()/section() already throw on a bad status/section key at
//     schema-definition time, but a field's `kind` — inherited straight
//     from its fields.js definition — isn't checked there, so it's
//     verified here instead),
//  6. every CONDITIONAL field's `conditionOn` names a real field key that
//     actually exists elsewhere in the SAME schema (catches a rename/typo
//     that would otherwise leave a field permanently hidden or shown).
// Returns an array of human-readable problem strings — empty means clean.
export function validateSchemaRegistry() {
  const problems = [];
  const FIELD_STATUS_VALUES = ['required', 'recommended', 'optional', 'conditional'];
  const FIELD_KIND_VALUES = ['text', 'textarea', 'photo', 'boolean', 'sections'];

  for (const [slug, schema] of Object.entries(SCHEMAS_BY_SLUG)) {
    if (!isKnownEventTypeSlug(slug)) {
      problems.push(`Schema registered under unknown event_type_slug "${slug}" — not present in EVENT_TYPE_NAMES.`);
    }
    if (schema.slug !== slug) {
      problems.push(`Schema for "${slug}" has mismatched internal slug "${schema.slug}".`);
    }
    for (const forbiddenKey of FORBIDDEN_SCHEMA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(schema, forbiddenKey)) {
        problems.push(`Schema for "${slug}" declares forbidden visual/design key "${forbiddenKey}" — inviteSchemas must stay design-independent.`);
      }
    }

    const allFieldKeys = new Set();
    for (const sec of schema.sections || []) {
      for (const f of sec.fields || []) allFieldKeys.add(f.key);
    }

    let hasRequired = false;
    for (const sec of schema.sections || []) {
      for (const f of sec.fields || []) {
        if (f.status === 'required') hasRequired = true;
        if (!FIELD_STATUS_VALUES.includes(f.status)) {
          problems.push(`Schema "${slug}", field "${f.key}": invalid status "${f.status}".`);
        }
        if (!FIELD_KIND_VALUES.includes(f.kind)) {
          problems.push(`Schema "${slug}", field "${f.key}": invalid kind "${f.kind}".`);
        }
        if (f.status === 'conditional') {
          if (!f.conditionOn) {
            problems.push(`Schema "${slug}", field "${f.key}": CONDITIONAL with no conditionOn.`);
          } else if (!allFieldKeys.has(f.conditionOn)) {
            problems.push(`Schema "${slug}", field "${f.key}": conditionOn "${f.conditionOn}" is not a real field in this schema.`);
          }
          if (typeof f.condition !== 'function') {
            problems.push(`Schema "${slug}", field "${f.key}": CONDITIONAL with no condition function.`);
          }
        }
      }
    }
    if (!hasRequired) {
      problems.push(`Schema "${slug}" has no REQUIRED field.`);
    }
  }
  return problems;
}

// The one centralized non-festive resolver the brief asks for. Checked in
// order: (1) a dedicated schema's own explicit nonFestive boolean, when
// present — today only funeralLastRites.js sets one (true); (2) fallback to
// lib/eventTypeNames.js's existing isCelebratory() (the pre-existing,
// already-shipped mechanism) for every other slug, including any resolving
// to the generic schema. This is the "existing isCelebratory() behaviour as
// rollout fallback" the brief specifies — a slug with no dedicated schema
// behaves identically to before this wave.
//
// Migrated call sites (see each file's own comment for the swap):
//   - screens/customer/ToranInvites.js (design-picker gating + prefill gate)
//   - screens/customer/GuestList.js (per-function design-picker gating)
//   - screens/customer/PlanView.js (countdown hero + accent-color gating)
//   - screens/RSVPScreen.js (Part 1 — celebratory-wording gate on the RSVP
//     'yes' option; see that file's own comment)
// lib/todoResolver.js's own isCelebratory() usage (checklist template
// filtering) was deliberately left untouched — reviewed, out of scope for
// the invite architecture, still correct as-is.
export function isNonFestive(eventTypeSlug) {
  const schema = eventTypeSlug && SCHEMAS_BY_SLUG[eventTypeSlug];
  if (schema && typeof schema.nonFestive === 'boolean') return schema.nonFestive;
  return !isCelebratory(eventTypeSlug);
}
