// Sub-type refinement options per event_type_slug ("which kind of THIS
// event"). Not stored in the DB — no event_sub_types table exists in the
// current schema (only vendor_categories/category_aliases/category_tiers/
// event_requirements/venues/input_history were migrated) — so this is the
// one piece of the plan engine that isn't SQL-configurable today. Kept as a
// flat data lookup rather than branching code so adding a new event type's
// breakdown means adding a key here, not new conditional logic; a future
// migration adding a real table would let this move into the DB like
// everything else. Event types with no entry here simply skip this slot.
export const EVENT_SUB_TYPES = {
  'kids-birthday': [
    { slug: 'first-birthday', label: 'First birthday', childAge: 1 },
    { slug: 'toddler-2-4', label: 'Toddler (2 to 4)', childAge: 3 },
    { slug: 'kids-5-12', label: 'Kids (5 to 12)', childAge: 8 },
    { slug: 'teen-13-17', label: 'Teen (13 to 17)', childAge: 15 },
  ],
};

export function getSubTypeOptions(eventTypeSlug) {
  return EVENT_SUB_TYPES[eventTypeSlug] || [];
}
