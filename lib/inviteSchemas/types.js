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
// lib/inviteDesignArchetypes.js registry (stub only, this wave).

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
export const FIELD_KIND = Object.freeze({
  TEXT: 'text',
  TEXTAREA: 'textarea',
  PHOTO: 'photo',
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

// Attaches a status (and, for CONDITIONAL, a condition predicate) to a
// shared field definition from fields.js, producing the field entry a
// schema's section actually lists. Throws on a bad status rather than
// silently accepting a typo — schema authoring is a small, reviewed
// surface, so failing loud here is safer than a field quietly rendering
// with `status: undefined`.
export function field(fieldDef, status, opts = {}) {
  if (!fieldDef || !fieldDef.key) {
    throw new Error('field(): fieldDef must be a shared field definition with a key (see lib/inviteSchemas/fields.js)');
  }
  if (!Object.values(FIELD_STATUS).includes(status)) {
    throw new Error(`field(): unknown status "${status}" for field "${fieldDef.key}"`);
  }
  const entry = { ...fieldDef, status };
  if (status === FIELD_STATUS.CONDITIONAL) {
    entry.condition = typeof opts.condition === 'function' ? opts.condition : () => true;
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
