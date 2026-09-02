// Production Batch 4 — moved planned -> implemented. Utsav's primary
// PUBLIC-EVENT direction (exhibition/concert/festival-fair/sports-event):
// poster-first composition — oversized title, hero image/artwork,
// date/venue block, ticket/entry status — deliberately NOT a family-
// invite construct wearing different colours (no couple connector, no
// family-blessing hierarchy, no ceremonial framing). Two variants carry
// genuinely different directions: gallery-poster (editorial/curatorial,
// artwork-first, near-silent decoration) and live-poster (energetic,
// event-poster feel) — same archetype, same scene contract, only tokens
// differ, matching this registry's "reuse composition, vary tokens" rule.
export default {
  id: 'cultural-poster',
  name: 'Cultural Poster',
  eventSlugs: ['exhibition', 'concert', 'festival-fair', 'sports-event'],
  // QA-pass fix: Playwright screenshots showed real public-event fixtures
  // (a schedule of 2-3 functions, sponsor/artist notes, ticket tiers)
  // scoring RICH, which pushed this archetype out of its own "primary"
  // recommendation slot for exactly the events it's meant to lead —
  // undermining the brief's poster/companion split, since the static
  // POSTER layout only ever surfaces a handful of slots regardless of how
  // much real data backs it. Widened to match photo-editorial/modern-
  // indian/luxury-black's ceiling so Cultural Poster stays STRONG for
  // realistically-populated public events, not just sparse ones.
  contentDensity: { min: 'light', max: 'rich' },
  static: { supported: true, layouts: ['poster'] },
  pdf: { supported: true, paginationMode: 'auto' },
  web: {
    supported: true,
    scenePreset: ['opening', 'honouree', 'story', 'functions', 'venue', 'tickets', 'registration', 'guest-access', 'contact', 'gallery', 'closing'],
  },
  motionPresets: ['spark', 'drift'],
  supports: {
    invocation: false, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: false, accommodation: false, gatePass: true, gifts: false, wishingWall: false,
  },
  variantIds: ['gallery-poster', 'live-poster'],
};
