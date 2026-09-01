// Production Batch 2 — moved planned -> implemented. A restrained,
// neutral sacred-architecture direction for temple/puja-adjacent
// contexts (housewarming's Griha Pravesh/Vastu Puja, mundan,
// hindu-wedding, jain-wedding, religious-event) — reuses Jharokha.js's
// existing arch geometry (temple/mandir architecture reads through the
// SHAPE, not an added religious symbol) rather than a second motif
// asset. No Om/Swastik/Ganesha/mantra/kalash or any religious text is
// ever auto-rendered — the invocation scene only ever shows host-supplied
// text, exactly like every other archetype in this registry; decorative
// arch/floral geometry is the only thing this archetype adds on its own.
export default {
  id: 'temple-heritage',
  name: 'Temple Heritage',
  eventSlugs: ['hindu-wedding', 'jain-wedding', 'mundan', 'housewarming', 'religious-event'],
  contentDensity: { min: 'light', max: 'rich' },
  static: { supported: true, layouts: ['centered-ceremonial'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'invocation', 'couple', 'honouree', 'family', 'functions', 'venue', 'dress-code', 'guest-access', 'rsvp', 'closing'],
  },
  motionPresets: ['unveil', 'drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: false, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: false, wishingWall: true,
  },
  variantIds: ['sacred-threshold'],
};
