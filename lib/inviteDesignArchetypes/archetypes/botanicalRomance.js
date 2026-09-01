// Production Batch 1 — moved planned -> implemented. Romantic, photo-
// forward direction: a botanical spray motif, warm-neutral palette, split-
// photo static layout. Reuses the shared Botanical.js motif component
// (also used, with different tokens, by Night Bloom below) rather than
// inventing separate geometry per archetype.
export default {
  id: 'botanical-romance',
  name: 'Botanical Romance',
  eventSlugs: [
    'hindu-wedding', 'nikah', 'anand-karaj', 'christian-wedding', 'parsi-wedding', 'jain-wedding', 'interfaith-wedding',
    'engagement', 'adult-birthday', 'anniversary', 'mundan', 'baby-shower', 'naming-ceremony', 'housewarming',
    'team-offsite', 'wellness-retreat', 'other',
  ],
  contentDensity: { min: 'light', max: 'rich' },
  static: { supported: true, layouts: ['split-photo'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'family', 'functions', 'venue', 'dress-code', 'travel', 'stay', 'guest-access', 'rsvp', 'gallery', 'wishing-wall', 'closing'],
  },
  motionPresets: ['drift', 'bloom'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['rose-garden'],
};
