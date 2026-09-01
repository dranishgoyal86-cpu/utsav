// Production Batch 1 — moved planned -> implemented. Primary rich Nikah
// archetype: garden-pavilion framing (reuses the existing Jharokha.js
// motif with emerald/gold tokens, not a second architectural-arch shape),
// restrained elegance. Religious content (Bismillah/Qur'anic verse/dua) is
// NEVER auto-rendered by this archetype — the nikah schema's own
// bismillahEnabled/quranicVerseEnabled fields (lib/inviteSchemas/schemas/
// nikah.js) are the only source, and this archetype presents them exactly
// as entered, or omits them entirely when unset. See
// screens/customer/InviteArchetypePilot.js's own comment on this same
// point for the live-verified behavior.
export default {
  id: 'mughal-garden',
  name: 'Mughal Garden',
  eventSlugs: ['nikah'],
  contentDensity: { min: 'medium', max: 'rich' },
  static: { supported: true, layouts: ['framed-portrait'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    // Visual QA pass fix: this preset omitted 'wishing-wall' despite
    // supports.wishingWall being true below (found via Playwright — the
    // scene could never resolve regardless of content). Placed before
    // 'closing', matching royal-palace/ivory-mandala/botanical-romance's
    // own ordering convention.
    scenePreset: ['opening', 'invocation', 'couple', 'family', 'functions', 'venue', 'dress-code', 'travel', 'stay', 'guest-access', 'rsvp', 'wishing-wall', 'closing'],
  },
  motionPresets: ['unveil', 'drift'],
  supports: {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
  },
  variantIds: ['emerald-mehfil'],
};
