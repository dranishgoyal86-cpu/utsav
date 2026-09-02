// Production Batch 2 — moved planned -> implemented. Warm, festive,
// traditional-Indian direction (bold folk-art colour, garland/toran
// imagery) — the respectful alternative to Botanical Romance/Celestial's
// contemporary-Western pastel look for baby-shower's Godh Bharai/
// Seemantham/Valaikappu ceremony types, and a strong-match direction for
// Hindu Wedding/Anand Karaj/Parsi Wedding/religious-event/festival-fair
// already declared in catalogue.js's EVENT_STRONG_ARCHETYPES. No
// religious symbol/text is ever auto-rendered — the toran-arch motif is
// decorative garland imagery, not a religious symbol, and the invocation
// scene only ever shows host-supplied text exactly like every other
// archetype in this registry.
export default {
  id: 'folk-celebration',
  name: 'Folk Celebration',
  eventSlugs: ['hindu-wedding', 'anand-karaj', 'parsi-wedding', 'religious-event', 'festival-fair', 'baby-shower'],
  contentDensity: { min: 'medium', max: 'very-rich' },
  static: { supported: true, layouts: ['centered-ceremonial'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'honouree', 'family', 'story', 'functions', 'venue', 'dress-code', 'travel', 'stay', 'guest-access', 'rsvp', 'tickets', 'contact', 'gallery', 'wishing-wall', 'closing'],
  },
  motionPresets: ['spark', 'drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['festive-blessing'],
};
