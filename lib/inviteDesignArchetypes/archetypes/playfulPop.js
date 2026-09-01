// Production Batch 1 — moved planned -> implemented. Primary Kids
// Birthday direction — carries the kids-birthday theme-pack mechanism
// (lib/inviteDesignArchetypes/themePacks.js): a theme pack nudges the
// accent colour/motif on top of whichever variant tokens are active, it
// never replaces them. No travel/accommodation (a kids' party is never a
// destination-travel event in this app's real usage), no invocation.
export default {
  id: 'playful-pop',
  name: 'Playful Pop',
  eventSlugs: ['kids-birthday', 'adult-birthday', 'concert', 'festival-fair', 'other'],
  contentDensity: { min: 'light', max: 'medium' },
  static: { supported: true, layouts: ['poster'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'honouree', 'story', 'venue', 'dress-code', 'guest-access', 'rsvp', 'gallery', 'closing'],
  },
  motionPresets: ['spark', 'drift'],
  supports: {
    invocation: false, heroPhoto: true, gallery: true, multipleFunctions: false, programme: false,
    maps: true, travel: false, accommodation: false, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['confetti-pop', 'comic-burst'],
};
