// Pilot archetype 1 of 3 — warm ceremonial heritage direction. Indian
// doorway/toran framing, restrained traditional detailing, not a
// destination-wedding archetype (no accommodation scene) — a local/home-
// ceremony heritage feel is the point of differentiation from Royal
// Palace below.
export default {
  id: 'toran-heritage',
  name: 'Toran Heritage',
  eventSlugs: ['hindu-wedding', 'engagement'],
  contentDensity: { min: 'medium', max: 'rich' },
  static: { supported: true, layouts: ['portrait-4-5'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'family', 'functions', 'venue', 'guest-access', 'rsvp', 'wishing-wall', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: false, accommodation: false, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['marigold-garland'],
};
