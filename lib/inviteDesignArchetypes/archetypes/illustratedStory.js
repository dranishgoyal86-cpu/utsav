// Production Batch 1 — moved planned -> implemented. Storybook-page
// framing (StorybookFrame.js motif) for a warmer, narrative-toned kids'
// invite than Playful Pop's confetti-poster energy — also theme-pack
// aware.
export default {
  id: 'illustrated-story',
  name: 'Illustrated Story',
  eventSlugs: ['hindu-wedding', 'interfaith-wedding', 'kids-birthday', 'mundan', 'baby-shower', 'naming-ceremony', 'festival-fair'],
  contentDensity: { min: 'light', max: 'medium' },
  static: { supported: true, layouts: ['minimal-spacious'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    // Visual QA pass fix — see archetypes/mughalGarden.js's identical comment.
    scenePreset: ['opening', 'honouree', 'family', 'story', 'functions', 'venue', 'guest-access', 'rsvp', 'tickets', 'contact', 'gallery', 'wishing-wall', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: false,
    maps: true, travel: false, accommodation: false, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['storybook-party'],
};
