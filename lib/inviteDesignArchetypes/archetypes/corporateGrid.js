// Production Batch 2 — moved planned -> implemented. Structured,
// precise, professional composition (no decorative motif — the "grid" is
// the identity: generous margins, strong hairlines, information-forward
// hierarchy). This is deliberately NOT "a wedding invite with blue
// colors" — no invocation/family/couple content at all, RSVP replaced by
// Registration, and Speakers/Agenda are first-class scenes.
export default {
  id: 'corporate-grid',
  name: 'Corporate Grid',
  eventSlugs: ['corporate-conference', 'product-launch'],
  contentDensity: { min: 'light', max: 'rich' },
  static: { supported: true, layouts: ['programme-poster'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'story', 'functions', 'speakers', 'venue', 'registration', 'contact', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: false, heroPhoto: true, gallery: false, multipleFunctions: true, programme: true,
    maps: true, travel: false, accommodation: true, gatePass: false, gifts: false, wishingWall: false,
  },
  variantIds: ['executive-light', 'summit-dark'],
};
