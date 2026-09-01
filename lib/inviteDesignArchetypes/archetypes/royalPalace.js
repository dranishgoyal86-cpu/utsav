// Pilot archetype 2 of 3 — palace/jharokha architectural framing, the
// richest of the three (destination-wedding capable — the only one of the
// pilot's three with both travel and accommodation support true). Strong
// opening-scene potential (gates/doors/unveil), hence the only archetype
// offering the 'unveil' motion preset alongside 'drift'.
export default {
  id: 'royal-palace',
  name: 'Royal Palace',
  eventSlugs: ['hindu-wedding', 'engagement', 'anniversary'],
  contentDensity: { min: 'rich', max: 'very-rich' },
  // Production Batch 1 — see toranHeritage.js's identical comment: this
  // replaces the pilot-wave placeholder 'portrait-4-5' with the real
  // STATIC_LAYOUT_FAMILY value.
  static: { supported: true, layouts: ['framed-portrait'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'family', 'functions', 'venue', 'dress-code', 'travel', 'stay', 'guest-access', 'rsvp', 'gallery', 'wishing-wall', 'closing'],
  },
  motionPresets: ['unveil', 'drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['jaipur-peacock', 'maroon-jharokha'],
};
