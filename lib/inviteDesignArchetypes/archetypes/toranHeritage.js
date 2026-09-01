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
  // Production Batch 1 — 'portrait-4-5' was a placeholder from the pilot
  // wave, before lib/inviteDesignArchetypes/types.js's STATIC_LAYOUT_FAMILY
  // enum existed; replaced with the real family it always meant to declare.
  // The 4:5 aspect ratio itself is unchanged and unrelated (that's
  // lib/staticInviteLayout.js's own fixed targetSize, not a layout family).
  static: { supported: true, layouts: ['centered-ceremonial'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'family', 'functions', 'venue', 'dress-code', 'guest-access', 'rsvp', 'wishing-wall', 'closing'],
  },
  motionPresets: ['drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: false, accommodation: false, gatePass: true, gifts: true, wishingWall: true,
  },
  // Production Batch 1 — second variant added for real palette variety
  // within the same heritage direction (bandhani red/pink vs.
  // marigold-garland's maroon/gold).
  variantIds: ['marigold-garland', 'red-bandhani'],
};
