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
    scenePreset: ['opening', 'couple', 'family', 'functions', 'venue', 'dress-code', 'travel', 'stay', 'guest-access', 'rsvp', 'gallery', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: false, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['editorial-ivory'],
};
