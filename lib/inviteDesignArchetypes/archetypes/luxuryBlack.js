// Production Batch 2 — moved planned -> implemented. Premium, photo/
// product-forward, evening-launch identity (true black canvas, a single
// restrained metallic accent) — the primary Product Launch direction,
// also usable for a premium Corporate Conference/adult-birthday. No
// invocation/gifts/wishing-wall content (matches its pre-existing
// catalogue.js capabilitiesPresented override from the Design System
// Scaling Foundation wave).
export default {
  id: 'luxury-black',
  name: 'Luxury Black',
  eventSlugs: ['adult-birthday', 'corporate-conference', 'product-launch', 'exhibition', 'concert', 'sports-event'],
  contentDensity: { min: 'medium', max: 'rich' },
  static: { supported: true, layouts: ['photo-editorial'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'story', 'functions', 'speakers', 'venue', 'registration', 'rsvp', 'closing'],
  },
  motionPresets: ['unveil', 'drift'],
  supports: {
    invocation: false, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: false, accommodation: true, gatePass: true, gifts: false, wishingWall: false,
  },
  variantIds: ['spotlight-black'],
};
