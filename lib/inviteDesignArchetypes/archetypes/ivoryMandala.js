// Pilot archetype 3 of 3 — light ivory/cream canvas, fine gold/neutral
// detailing, spacious typography, understated sacred-geometry motif.
// Lightest content-density range of the three (suited to a smaller,
// elegant/minimal family event) — skips the gallery and gift scenes by
// design (a deliberately restrained presentation, not a missing feature),
// while still travel/accommodation-capable for an intimate destination
// event.
export default {
  id: 'ivory-mandala',
  name: 'Ivory Mandala',
  // Production Batch 3 — added anniversary/mundan/religious-event/
  // wellness-retreat (already in catalogue.js's EVENT_STRONG_ARCHETYPES,
  // this file's own list just hadn't caught up).
  eventSlugs: ['hindu-wedding', 'engagement', 'anniversary', 'mundan', 'religious-event', 'wellness-retreat'],
  contentDensity: { min: 'light', max: 'medium' },
  // Production Batch 1 — see toranHeritage.js's identical comment.
  static: { supported: true, layouts: ['minimal-spacious'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'honouree', 'family', 'functions', 'venue', 'dress-code', 'travel', 'stay', 'guest-access', 'rsvp', 'wishing-wall', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: false, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: false, wishingWall: true,
  },
  variantIds: ['gold-lotus'],
};
