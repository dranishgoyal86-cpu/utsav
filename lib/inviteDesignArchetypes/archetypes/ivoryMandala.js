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
  eventSlugs: ['hindu-wedding', 'engagement'],
  contentDensity: { min: 'light', max: 'medium' },
  static: { supported: true, layouts: ['portrait-4-5'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'family', 'functions', 'venue', 'travel', 'stay', 'guest-access', 'rsvp', 'wishing-wall', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: false, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: false, wishingWall: true,
  },
  variantIds: ['gold-lotus'],
};
