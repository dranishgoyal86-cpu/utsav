import { isCelebratory } from './eventTypeNames';

// ── DEFERRED CONTENT — DO NOT FILL IN SILENTLY ──────────────────────────
// nikah/anand-karaj/christian-wedding/parsi-wedding/jain-wedding/
// interfaith-wedding (Wave 7's new event_type_slug values) intentionally
// have no ceremony-specific checklist content in event_todo_templates —
// only the 26 pre-existing universal items plus one confirmed-generic
// addition (legal marriage registration, one row per wedding slug — see
// supabase/migrations/20260827080000_marriage_registration_checklist.sql).
// Do not add AI-generated religious/ceremonial content for any of these
// traditions here or via a new migration. This needs real,
// community-sourced input first.
//
// Pure resolver for event_todo_templates -> the set of templates that
// currently apply to one event, mirroring lib/eventResolver.js's shape
// (plain data in, plain data out, no React/Supabase, unit-testable via a
// plain Node script — see scripts/verifyTodoResolver.js).
//
// eventFunctionSlugs: the event's real event_functions rows, already
// resolved down to just their sub_events.slug values (via
// source_sub_event_id) by the caller — e.g. ['mehendi', 'sangeet']. Kept as
// a flat array of slugs (not full function objects) because event_todos has
// no function_id column (see the migration) — a sub-event-scoped template
// resolves once if ANY matching function exists, not once per function
// instance. A wedding with two functions that both happen to map to the
// same sub_event slug (unusual — e.g. two separate Mehendi ceremonies)
// would only ever get ONE event_todos row for that template, since nothing
// in the schema distinguishes which function instance a row belongs to.
// Flagging this as a known limitation of the given schema rather than
// silently working around it with an uninvited column.
//
// context: lib/checklistContext.js's buildChecklistContext() output.
// formData: saved_plans.form_data, or null (no linked plan yet -> every
// condition_field-gated template is included, same "over-show rather than
// hide arbitrarily" precedent DEFAULT_ITEMS' relevantIf already used).
export function resolveTodoTemplates(templates, context = {}, eventFunctionSlugs = [], formData = null) {
  const { eventTypeSlug = null } = context;
  const functionSlugSet = new Set((eventFunctionSlugs || []).filter(Boolean));
  const celebratoryEvent = isCelebratory(eventTypeSlug);

  const matchesCondition = (t) => {
    if (!t.condition_field) return true;
    if (!formData) return true;
    const val = formData[t.condition_field];
    if (t.condition_value != null) return val === t.condition_value;
    return !!val;
  };

  return (templates || [])
    .filter(t => {
      if (t.event_type_slug != null && t.event_type_slug !== eventTypeSlug) return false;
      if (t.sub_event_slug != null && !functionSlugSet.has(t.sub_event_slug)) return false;
      // requires_celebratory rows (e.g. "Book DJ & music", "Decor meeting")
      // are only ever suppressed for a non-celebratory event type — for all
      // 16 pre-existing types (all celebratory) this is a no-op regardless
      // of the column's value, since celebratoryEvent is always true there.
      // Column doesn't exist on `t` until the migration is applied, in
      // which case it reads as undefined/falsy here — also a no-op.
      if (t.requires_celebratory && !celebratoryEvent) return false;
      return matchesCondition(t);
    })
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

// Registry of live-context auto-check conditions (event_todo_templates.
// auto_check_condition) — separate from condition_field (which only ever
// gates whether a template is RELEVANT, evaluated once against snapshot-time
// form_data) and separate from refreshAutoTodos()'s per-category booking/
// guest-list signal checks (which stay in EventTodo.js, unchanged, since
// they need live Supabase queries this file deliberately can't make). This
// registry is for the new class of trigger: "the event's live situation
// itself, not an activity signal, makes this task done" — e.g. a home venue
// needs no vendor confirmation at all.
const AUTO_CHECK_CONDITIONS = {
  is_home_venue: ctx => ctx.isHomeVenue === true,
};

export function evaluateAutoCheckCondition(name, context) {
  if (!name || !context) return false;
  const fn = AUTO_CHECK_CONDITIONS[name];
  return fn ? !!fn(context) : false;
}
