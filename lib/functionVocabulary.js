// Pure resolver for "what function names should we suggest while a host is
// building this event's functions" — deliberately Supabase-free (same
// convention as lib/capabilities.js/lib/eventResolver.js), so it stays
// plain-Node testable and so schemas/*.js never has to import anything
// database-shaped.
//
// Precedence, per the brief:
//   1. Real, live DB-backed sub_events rows for this event type, when any
//      exist — the caller fetches these itself (event_types.id -> sub_events
//      .event_type_id, the exact two-query, no-join pattern GuestList.js's
//      Functions modal already uses) and passes them in as dbSubEvents.
//   2. A schema's own staticFunctionVocabulary, when the DB has nothing —
//      this is the ONLY place a schema's vocabulary is actually consulted;
//      the schema itself never claims to know sub_events exists (its
//      functionVocabularyKey is just a plain string, meaningful only to
//      whoever wires the DB fetch up).
//   3. Neither — an empty suggestion list. This is never a dead end: a host
//      can ALWAYS type a fully custom function name regardless of what (if
//      anything) this resolver suggests. canUseCustomNames below is always
//      true precisely so no caller is tempted to gate free-text entry on
//      this resolver's output being non-empty.
//
// Global function-taxonomy suggestions (this file) must never be confused
// with a host's own per-event event_functions rows — those are read/written
// directly against the event_functions table wherever they're needed
// (GuestList.js's Functions modal), completely untouched by this module.
export function resolveFunctionVocabulary({ schema, dbSubEvents = [] } = {}) {
  if (Array.isArray(dbSubEvents) && dbSubEvents.length > 0) {
    return {
      source: 'db',
      canUseCustomNames: true,
      suggestions: dbSubEvents
        .map((se, i) => ({
          slug: se.slug,
          name: se.name,
          sortOrder: se.sort_order ?? i,
          typicalDayOffset: se.typical_day_offset ?? null,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  const staticVocab = schema?.staticFunctionVocabulary;
  if (Array.isArray(staticVocab) && staticVocab.length > 0) {
    return {
      source: 'schema',
      canUseCustomNames: true,
      suggestions: staticVocab
        .map((v, i) => ({
          slug: v.slug || v.name,
          name: v.name,
          sortOrder: v.sortOrder ?? i,
          typicalDayOffset: v.typicalDayOffset ?? null,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  return { source: 'none', canUseCustomNames: true, suggestions: [] };
}
