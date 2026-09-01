// Production Batch 2 — moved planned -> implemented. Clean, minimal,
// contemporary-Indian identity: generous whitespace, restrained
// geometry, no dense motif — the "modern" counterpart to the more
// ornamental heritage archetypes, reused across wedding-adjacent,
// housewarming, and professional (corporate-conference/product-launch)
// contexts alike, matching its broad EVENT_STRONG_ARCHETYPES footprint
// in catalogue.js.
export default {
  id: 'modern-indian',
  name: 'Modern Indian',
  eventSlugs: ['hindu-wedding', 'nikah', 'anand-karaj', 'christian-wedding', 'parsi-wedding', 'jain-wedding', 'interfaith-wedding', 'engagement', 'adult-birthday', 'anniversary', 'housewarming', 'corporate-conference', 'product-launch', 'team-offsite', 'exhibition', 'sports-event', 'other'],
  contentDensity: { min: 'light', max: 'rich' },
  static: { supported: true, layouts: ['minimal-spacious'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    // Shared across both celebratory (rsvp) and professional
    // (registration) contexts — resolveScenes() only ever turns on
    // whichever one the caller's actual signals indicate; see its own
    // hasRsvpContent/hasRegistrationContent comment.
    scenePreset: ['opening', 'couple', 'honouree', 'family', 'functions', 'venue', 'dress-code', 'travel', 'stay', 'guest-access', 'rsvp', 'registration', 'speakers', 'gallery', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['modern-home'],
};
