// Production Batch 1 — moved planned -> implemented. Romantic, modern,
// after-dark direction — reuses the shared Botanical.js motif (a "night
// garden" reading of the same spray, via a deep-navy/gold palette instead
// of Botanical Romance's warm-day palette) rather than a second geometry.
export default {
  id: 'night-bloom',
  name: 'Night Bloom',
  eventSlugs: ['hindu-wedding', 'nikah', 'christian-wedding', 'engagement', 'adult-birthday', 'product-launch', 'concert', 'festival-fair'],
  contentDensity: { min: 'medium', max: 'rich' },
  static: { supported: true, layouts: ['centered-ceremonial'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'family', 'functions', 'venue', 'dress-code', 'travel', 'stay', 'guest-access', 'rsvp', 'gallery', 'closing'],
  },
  motionPresets: ['drift', 'bloom'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['midnight-jasmine'],
};
