// Theme options per event_type_slug — only kids-birthday has themes today.
// Same rationale as lib/eventSubTypes.js: no themes table exists in the
// current schema, so this stays a flat data lookup (add a key, not a
// branch) rather than in-screen conditional logic. Event types with no
// entry here simply skip the theme slot.
export const EVENT_THEMES = {
  'kids-birthday': [
    'Jungle', 'Unicorn', 'Superhero', 'Princess', 'Space',
    'Dinosaur', 'Under the Sea', 'Circus', 'Cars', 'Football',
  ],
};

export function getThemeOptions(eventTypeSlug) {
  return EVENT_THEMES[eventTypeSlug] || [];
}
