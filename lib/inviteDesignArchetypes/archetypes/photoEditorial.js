// Production Batch 1 — moved planned -> implemented. Minimal, photo-led,
// modern direction — deliberately NO decorative motif (motif: null in its
// variant tokens): typography and the couple/hero photo carry the whole
// composition, matching "editorial" restraint. Also this wave's Engagement
// archetype proof that the same archetype can present a genuinely
// different composition for a different event type without a second
// builder — see screens/customer/InviteArchetypePilot.js's engagement
// content mapping.
export default {
  id: 'photo-editorial',
  name: 'Photo Editorial',
  eventSlugs: [
    'hindu-wedding', 'nikah', 'anand-karaj', 'christian-wedding', 'parsi-wedding', 'interfaith-wedding',
    'engagement', 'kids-birthday', 'adult-birthday', 'anniversary', 'baby-shower',
    'corporate-conference', 'product-launch', 'team-offsite', 'exhibition', 'concert', 'sports-event', 'wellness-retreat', 'other',
  ],
  contentDensity: { min: 'light', max: 'rich' },
  static: { supported: true, layouts: ['photo-editorial'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    // Visual QA pass fix — see mughalGarden.js's identical comment.
    // Batch 3 — added honouree/story: photo-editorial is the primary
    // Anniversary direction ("then & now" narrative) and is also
    // recommended for wellness-retreat (facilitator honouree).
    scenePreset: ['opening', 'couple', 'honouree', 'family', 'story', 'functions', 'venue', 'dress-code', 'travel', 'transport', 'stay', 'guest-access', 'rsvp', 'registration', 'tickets', 'contact', 'gallery', 'wishing-wall', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: false, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['editorial-ivory'],
};
