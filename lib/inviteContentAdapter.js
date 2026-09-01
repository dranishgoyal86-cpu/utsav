// Pure integration layer between (a) event_invite_content's legacy named
// columns, (b) its new schema_content JSONB column, and (c) the resolved
// inviteSchema for an event — producing one semantic { [fieldKey]: value }
// map for renderers/forms to consume, and the inverse: turning an edited
// values map back into the exact upsert payload to save. No React, no
// Supabase — takes/returns plain data, same convention as every other
// lib/*.js resolver in this codebase.
//
// This file is where the brief's Critical Data Rule is actually enforced in
// code: buildContentPatch() only ever includes the columns/schema_content
// keys the ACTIVE SCHEMA declares. The active schema is resolved from the
// event's event_type_slug, which does not change when a host switches
// template_id (the design) — so buildContentPatch()'s output is identical
// regardless of which design is currently selected. Switching designs and
// re-saving therefore can never null a field the current schema doesn't
// happen to render for that design; a field the schema doesn't declare at
// all is simply never touched (omitted from the payload — see the
// supabase-js upsert note below), never explicitly set to null.
import { getInviteSchema } from './inviteSchemas';

// Flattens a schema into an ordered, section-aware list of its field
// entries (each already carrying legacyColumn/kind/status/etc. from
// fields.js + types.js's field()).
export function listSchemaFields(schema) {
  return schema.sections.flatMap((sec) => sec.fields.map((f) => ({ ...f, sectionKey: sec.key })));
}

// contentRow: a raw event_invite_content row (or null/undefined for a new,
// unsaved event's invite). Returns every field the schema declares, keyed
// by fieldKey — legacy-column fields read from their named column, JSONB-
// only fields read from schema_content. A field never reads from both.
export function normalizeInviteContent(schema, contentRow) {
  const fields = listSchemaFields(schema);
  const schemaContent = (contentRow && contentRow.schema_content) || {};
  const values = {};
  for (const f of fields) {
    values[f.key] = f.legacyColumn
      ? (contentRow ? contentRow[f.legacyColumn] : undefined) ?? ''
      : (schemaContent[f.key] ?? '');
  }
  return values;
}

// Inverse of normalizeInviteContent(). values: the same shape that function
// returns (possibly host-edited). existingSchemaContent: the schema_content
// object already on the row (so a JSONB-only field belonging to a
// DIFFERENT schema than the one currently active — e.g. left over from
// before an event's type was ever set — is preserved untouched rather than
// wiped by this save, matching the "never destroy previously entered
// content" rule for the JSONB side exactly the way legacy-column omission
// already does for the named-column side).
//
// Returns the exact payload to spread into the event_invite_content
// upsert, alongside { event_id, host_id, template_id, updated_at } (those
// three are NOT content — template_id in particular is deliberately kept
// out of this function entirely, since which design is selected has no
// bearing on what content gets saved). supabase-js's .upsert() generates a
// Postgres `ON CONFLICT (event_id) DO UPDATE SET <only the keys present in
// the payload>` — a legacy column this schema doesn't declare is therefore
// never included in the SET clause at all, so its existing stored value
// (from whatever schema was active when it was last written) survives
// untouched, exactly matching the brief's "content belongs to the event,
// not the design" rule.
export function buildContentPatch(schema, values, existingSchemaContent) {
  const fields = listSchemaFields(schema);
  const patch = {};
  const schemaContent = { ...(existingSchemaContent || {}) };
  for (const f of fields) {
    const raw = values ? values[f.key] : undefined;
    const trimmed = typeof raw === 'string' ? raw.trim() : raw;
    if (f.legacyColumn) {
      patch[f.legacyColumn] = trimmed || null;
    } else if (trimmed) {
      schemaContent[f.key] = trimmed;
    } else {
      delete schemaContent[f.key];
    }
  }
  patch.schema_content = schemaContent;
  return patch;
}

// Convenience: resolve schema + normalize in one call, for the common
// "I have an event and a content row, give me the form's starting values"
// case.
export function normalizeForEvent(eventTypeSlug, contentRow) {
  const schema = getInviteSchema(eventTypeSlug);
  return { schema, values: normalizeInviteContent(schema, contentRow) };
}

// ── Card-prop mapping ──────────────────────────────────────────────────
// ToranCoverCard.js and StillnessCard.js stay visually unchanged this wave
// (per the brief) — these two functions are the ONLY place that maps this
// module's semantic field keys onto those two components' existing prop
// names, so the components themselves never need to know about schemas,
// values maps, or the adapter at all.

// functionOverride: an optional event_functions row (per-function design
// override) — see normalizeFunctionOverride() below. When provided,
// functionName/functionDate/functionTime are passed through to
// ToranCoverCard's own existing per-function-mode props; headline_text on
// the function row wins over the event-level headlineText value, matching
// event_functions.headline_text's own documented "override for a design's
// large headline" role (see supabase/migrations/20260827100000_event_
// functions_design.sql).
export function mapToToranCoverCardProps(design, values, event, functionOverride) {
  const v = values || {};
  return {
    design,
    eventName: event?.name,
    eventDate: event?.event_date,
    venue: event?.venue,
    partner1Name: v.partner1Name || '',
    partner2Name: v.partner2Name || '',
    hostedBy: v.hostedBy || '',
    kickerText: v.kickerText || '',
    headlineText: (functionOverride && functionOverride.headlineText) || v.headlineText || '',
    functionName: functionOverride?.name,
    functionDate: functionOverride?.date,
    functionTime: functionOverride?.time,
  };
}

export function mapToStillnessCardProps(values, functionOverride) {
  const v = values || {};
  return {
    nameLine1: v.subjectNameLine1 || '',
    nameLine2: v.subjectNameLine2 || '',
    years: v.subjectYears || '',
    detailLine1: v.detailLine1 || '',
    detailLine2: v.detailLine2 || '',
    functionName: functionOverride?.name,
    functionDate: functionOverride?.date,
    functionTime: functionOverride?.time,
  };
}

// Pulls the per-function design-override fields off a real event_functions
// row (canonical table, read directly — nothing duplicated here) into the
// small plain shape the two mapping functions above accept. Returns null
// for a falsy input so call sites can pass a possibly-missing function row
// straight through without an extra guard.
export function normalizeFunctionOverride(functionRow) {
  if (!functionRow) return null;
  return {
    templateId: functionRow.template_id || null,
    headlineText: functionRow.headline_text || null,
    name: functionRow.name,
    date: functionRow.date,
    time: functionRow.time,
  };
}
