// Production Batch 1 — moved planned -> implemented. Star/moon motif
// (Stars.js), child-friendly celestial direction — the theme-pack
// mechanism's own 'space' pack shares this same motifId, so a host who
// picks Playful Pop or Illustrated Story but writes "space" as their
// partyTheme still gets a star-scatter accent even under a different
// archetype's base composition.
export default {
  id: 'celestial',
  name: 'Celestial',
  eventSlugs: ['kids-birthday', 'baby-shower', 'naming-ceremony', 'wellness-retreat'],
  contentDensity: { min: 'light', max: 'medium' },
  static: { supported: true, layouts: ['poster'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'honouree', 'story', 'venue', 'guest-access', 'rsvp', 'closing'],
  },
  motionPresets: ['drift', 'spark'],
  supports: {
    invocation: false, heroPhoto: true, gallery: true, multipleFunctions: false, programme: false,
    maps: true, travel: false, accommodation: false, gatePass: false, gifts: true, wishingWall: true,
  },
  variantIds: ['space-adventure'],
};
