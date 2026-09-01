// Shared vocabulary + tiny constructor helpers for the invite schema
// registry. Deliberately free of React/Supabase imports (same convention as
// lib/capabilities.js/lib/eventResolver.js) so it stays plain-Node
// testable via scripts/verifyInviteSchemaFoundation.js.
//
// This file (and the rest of lib/inviteSchemas/) intentionally does NOT
// define allowedDesigns/suggestedDesign/palette/motif/anything visual — the
// invite-architecture brief is explicit that content schemas must stay
// design-independent. Visual template decisions live in
// lib/inviteThemes.js (existing, unchanged) and the future
// lib/inviteDesignArchetypes/ registry (a Hindu Wedding pilot as of the
// design-archetype wave — 3 archetypes, not yet all 26 event types).

// A field's role within its schema. Cosmetic today (drives label styling in
// InviteFieldRenderer — a trailing "*" for required, "(optional)" for
// optional) rather than hard validation, matching this app's existing invite
// form: no field has ever actually blocked saving on emptiness.
export const FIELD_STATUS = Object.freeze({
  REQUIRED: 'required',
  RECOMMENDED: 'recommended',
  OPTIONAL: 'optional',
  // Supported but not yet used by any of this wave's 3 seed schemas — a
  // conditional field carries a `condition(context)` predicate the render
  // layer can evaluate (e.g. "only show if hasOutstationGuests"). Reserved
  // for a future schema; documented here so the shape exists before the
  // first real use invents its own ad hoc version.
  CONDITIONAL: 'conditional',
});

// What kind of input a field needs. Intentionally small and layout-neutral
// — NOT "toranKicker" or "stillnessLine1"-style names (the brief's explicit
// "no line-position/card-layout-named fields" rule). A design/renderer
// decides how a 'text' field is laid out; this only says what it holds.
//   BOOLEAN — a toggle (e.g. "Surprise party?", "Name is secret"). Real
//     form control (InviteFieldRenderer renders a Switch), not cosmetic —
//     CONDITIONAL fields elsewhere in the same schema read a boolean
//     field's live value to decide their own visibility (see field()'s
//     conditionOn below).
//   SECTIONS — the one repeatable, structured field kind: an array of
//     { id, title, body, date, time, venue, image, icon, sortOrder }
//     custom-section entries (every schema gets one, via fields.js's
//     shared `customSections` field — see that file). Stored as a plain
//     array in schema_content, round-tripped by lib/inviteContentAdapter.js
//     like any other JSONB-only field; InviteFieldRenderer intentionally
//     renders nothing for this kind yet (no repeating-section editor UI
//     this wave — that's a visual/interaction build, out of scope per "no
//     visual redesign this wave"). The schema-level plumbing exists now so
//     a future editor has real data to read/write from day one.
export const FIELD_KIND = Object.freeze({
  TEXT: 'text',
  TEXTAREA: 'textarea',
  PHOTO: 'photo',
  BOOLEAN: 'boolean',
  SECTIONS: 'sections',
});

// Which "voice" a field's content is written in — informs future wording
// generation (e.g. a guest-facing summary sentence) without the schema
// itself hardcoding any actual sentence. 'couple' = two-partner wording,
// 'subject' = memorial/single-honoree wording, 'neutral' = works either way
// (kicker/headline free text, invocation lines, etc.).
export const WORDING_MODE = Object.freeze({
  COUPLE: 'couple',
  SUBJECT: 'subject',
  NEUTRAL: 'neutral',
});

// A whole-invite TONE a host can pick — a different axis from WORDING_MODE
// above (which describes what VOICE one field's content is written in;
// this describes how the OVERALL copy should read). Declarative metadata
// only this wave: a schema lists which of these make sense for its event
// type via `supportedWordingTones` (see schemas/*.js), and nothing yet
// generates or enforces copy from it — the actual wording-generation layer
// is future work, same status as guestResponseDefaults below.
export const WORDING_TONE = Object.freeze({
  TRADITIONAL: 'traditional',
  WARM: 'warm',
  MODERN: 'modern',
  FORMAL: 'formal',
  MINIMAL: 'minimal',
  PLAYFUL: 'playful',
  PROFESSIONAL: 'professional',
  ENERGETIC: 'energetic',
  CALM: 'calm',
  SOLEMN: 'solemn',
  CUSTOM: 'custom',
});

// Attaches a status (and, for CONDITIONAL, a condition predicate + the key
// of the field it depends on) to a shared field definition from fields.js,
// producing the field entry a schema's section actually lists. Throws on a
// bad status rather than silently accepting a typo — schema authoring is a
// small, reviewed surface, so failing loud here is safer than a field
// quietly rendering with `status: undefined`.
//
// opts.conditionOn: the OTHER field key (almost always a BOOLEAN field)
// this field's visibility depends on — e.g. field(FIELD_DEFS.babyName,
// FIELD_STATUS.CONDITIONAL, { conditionOn: 'nameIsSecret', condition: v =>
// v.nameIsSecret !== true }). Required alongside opts.condition for any
// CONDITIONAL field so validateSchemaRegistry() (index.js) can confirm it
// names a real field in the same schema, catching a typo/rename at
// registry-validation time instead of a silently-always-hidden (or
// always-shown) field in production.
export function field(fieldDef, status, opts = {}) {
  if (!fieldDef || !fieldDef.key) {
    throw new Error('field(): fieldDef must be a shared field definition with a key (see lib/inviteSchemas/fields.js)');
  }
  if (!Object.values(FIELD_STATUS).includes(status)) {
    throw new Error(`field(): unknown status "${status}" for field "${fieldDef.key}"`);
  }
  const entry = { ...fieldDef, status };
  if (status === FIELD_STATUS.CONDITIONAL) {
    if (!opts.conditionOn) {
      throw new Error(`field(): CONDITIONAL field "${fieldDef.key}" needs opts.conditionOn naming the field key it depends on`);
    }
    entry.conditionOn = opts.conditionOn;
    entry.condition = typeof opts.condition === 'function' ? opts.condition : (values) => values[opts.conditionOn] === true;
  }
  return entry;
}

// Keys an inviteSchema must NOT declare — a lightweight guard used by
// validateSchemaRegistry() (index.js) to catch a schema accidentally
// reintroducing a visual/design decision the architecture explicitly
// forbids at this layer.
export const FORBIDDEN_SCHEMA_KEYS = Object.freeze([
  'allowedDesigns', 'suggestedDesign', 'palette', 'motif', 'theme', 'colors', 'gradient',
]);
