// Production Batch 3 — moved planned -> implemented. Calm, natural,
// destination-focused direction (earth/leaf tones, soft organic
// geometry, spacious typography, low-motion by default) — reuses
// Botanical.js's existing stem/leaf motif at a muted earthy palette
// rather than a new asset. No invocation/gate-pass/gifts content (a
// retreat is not a religious ceremony or a gated residential event).
export default {
  id: 'wellness-earth',
  name: 'Wellness Earth',
  eventSlugs: ['wellness-retreat', 'team-offsite'],
  contentDensity: { min: 'light', max: 'rich' },
  static: { supported: true, layouts: ['minimal-spacious'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'honouree', 'story', 'functions', 'venue', 'travel', 'transport', 'stay', 'registration', 'rsvp', 'contact', 'gallery', 'closing'],
  },
  motionPresets: ['drift', 'bloom'],
  supports: {
    invocation: false, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: false, gifts: false, wishingWall: false,
  },
  variantIds: ['forest-retreat'],
};
