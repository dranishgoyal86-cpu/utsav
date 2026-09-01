// The 18-entry design-archetype planning catalogue — Design System Scaling
// Foundation wave. Distinct from (but cross-referencing) the 3 full
// IMPLEMENTED archetype objects in archetypes/*.js: this file exists so
// Utsav can answer compatibility questions for all 18 target directions
// named in the brief, 15 of which have no rendering code at all yet
// (status: 'planned' — pure metadata, never selectable in production, see
// lib/inviteDesignCompatibilityMatrix.js's getSelectableArchetypes()).
//
// supportedEventSlugs per entry below is reverse-derived from the brief's
// own per-event-type "Strong" archetype lists (EVENT_STRONG_ARCHETYPES,
// same file) — every archetype here supports exactly the event types
// where it was named a strong match for at least one event type. No
// archetype was assigned a supportedEventSlugs entry we invented ourselves
// beyond that transcription.
import { ARCHETYPE_STATUS, CONTENT_DENSITY, MOTION_PRESET, STATIC_LAYOUT_FAMILY } from './types';

// ── Per-event-type "Strong" recommendations, transcribed verbatim from the
// brief's own list. This is the single source of truth both directions:
// EVENT_STRONG_ARCHETYPES[eventSlug] answers "what's recommended for this
// event", and CATALOGUE[archetypeId].supportedEventSlugs (derived below)
// answers "what event types does this archetype serve" — kept in one
// place so the two views can never drift apart.
export const EVENT_STRONG_ARCHETYPES = Object.freeze({
  'hindu-wedding': ['toran-heritage', 'royal-palace', 'temple-heritage', 'folk-celebration', 'ivory-mandala', 'botanical-romance', 'illustrated-story', 'photo-editorial', 'modern-indian', 'night-bloom'],
  'nikah': ['mughal-garden', 'ivory-mandala', 'botanical-romance', 'photo-editorial', 'night-bloom', 'modern-indian'],
  'anand-karaj': ['ivory-mandala', 'folk-celebration', 'royal-palace', 'botanical-romance', 'photo-editorial', 'modern-indian'],
  'christian-wedding': ['botanical-romance', 'ivory-mandala', 'photo-editorial', 'modern-indian', 'night-bloom'],
  'parsi-wedding': ['folk-celebration', 'photo-editorial', 'botanical-romance', 'modern-indian', 'ivory-mandala'],
  'jain-wedding': ['temple-heritage', 'ivory-mandala', 'botanical-romance', 'royal-palace', 'modern-indian'],
  'interfaith-wedding': ['botanical-romance', 'modern-indian', 'photo-editorial', 'ivory-mandala', 'illustrated-story'],
  'engagement': ['royal-palace', 'botanical-romance', 'photo-editorial', 'ivory-mandala', 'modern-indian', 'night-bloom'],
  'kids-birthday': ['playful-pop', 'illustrated-story', 'celestial', 'photo-editorial', 'cultural-poster'],
  'adult-birthday': ['photo-editorial', 'night-bloom', 'luxury-black', 'modern-indian', 'botanical-romance', 'playful-pop'],
  'anniversary': ['photo-editorial', 'botanical-romance', 'ivory-mandala', 'royal-palace', 'modern-indian'],
  'mundan': ['temple-heritage', 'ivory-mandala', 'botanical-romance', 'illustrated-story'],
  'baby-shower': ['botanical-romance', 'celestial', 'illustrated-story', 'ivory-mandala', 'photo-editorial'],
  'naming-ceremony': ['celestial', 'botanical-romance', 'illustrated-story', 'ivory-mandala'],
  'housewarming': ['toran-heritage', 'temple-heritage', 'botanical-romance', 'modern-indian', 'ivory-mandala'],
  'religious-event': ['temple-heritage', 'toran-heritage', 'folk-celebration', 'ivory-mandala'],
  'funeral-last-rites': ['stillness'],
  'corporate-conference': ['corporate-grid', 'modern-indian', 'luxury-black', 'photo-editorial'],
  'product-launch': ['luxury-black', 'modern-indian', 'corporate-grid', 'night-bloom', 'photo-editorial'],
  'team-offsite': ['photo-editorial', 'modern-indian', 'botanical-romance', 'cultural-poster', 'wellness-earth'],
  'exhibition': ['cultural-poster', 'photo-editorial', 'modern-indian', 'luxury-black'],
  'concert': ['cultural-poster', 'night-bloom', 'luxury-black', 'photo-editorial', 'playful-pop'],
  'festival-fair': ['folk-celebration', 'cultural-poster', 'playful-pop', 'illustrated-story', 'night-bloom'],
  'sports-event': ['cultural-poster', 'modern-indian', 'luxury-black', 'photo-editorial'],
  'wellness-retreat': ['wellness-earth', 'botanical-romance', 'ivory-mandala', 'photo-editorial', 'celestial'],
  'other': ['modern-indian', 'botanical-romance', 'photo-editorial', 'ivory-mandala', 'playful-pop', 'cultural-poster'],
});

function derivedSupportedEventSlugs(archetypeId) {
  return Object.entries(EVENT_STRONG_ARCHETYPES)
    .filter(([, ids]) => ids.includes(archetypeId))
    .map(([slug]) => slug);
}

// presentationSupport builder — the brief's own distinction: `false` never
// disables the underlying lib/eventCapabilities.js module, it only means
// THIS OUTPUT SURFACE doesn't render that module directly (e.g. an
// ultra-minimal static card omits travel details; the web experience
// still exposes Travel through its own utility scene regardless).
function presentation({
  staticFunctions = 'summary', staticTravel = false, staticAccommodation = false, staticMaps = 'primary-only',
  pdfFunctions = true, pdfTravel = true, pdfAccommodation = true,
  webFunctions = true, webTravel = true, webAccommodation = true, webRsvp = true, webGuestAccess = true,
} = {}) {
  return {
    static: { functions: staticFunctions, travel: staticTravel, accommodation: staticAccommodation, maps: staticMaps },
    pdf: { functions: pdfFunctions, travel: pdfTravel, accommodation: pdfAccommodation },
    web: { functions: webFunctions, travel: webTravel, accommodation: webAccommodation, rsvp: webRsvp, guestAccess: webGuestAccess },
  };
}

function capabilities(overrides = {}) {
  return {
    invocation: true, heroPhoto: true, gallery: true, multipleFunctions: true, programme: true,
    maps: true, travel: true, accommodation: true, gatePass: true, gifts: true, wishingWall: true,
    ...overrides,
  };
}

function entry({
  id, name, status, density, tones, solemnCompatible = false,
  capabilitiesPresented = capabilities(), presentationSupport = presentation(),
  variantIds, staticLayoutFamilies, defaultMotionPreset, supportedMotionPresets,
  requiresPhotography = false, supportsIllustration = false, supportsTickets = false, supportsSpeakers = false, supportsArtwork = false,
}) {
  return Object.freeze({
    id, name, status,
    supportedEventSlugs: derivedSupportedEventSlugs(id),
    density, tones, solemnCompatible,
    capabilitiesPresented, presentationSupport,
    variantIds: variantIds || null,
    staticLayoutFamilies: staticLayoutFamilies || null,
    defaultMotionPreset: defaultMotionPreset || null,
    supportedMotionPresets: supportedMotionPresets || null,
    requiresPhotography, supportsPhotography: requiresPhotography || false,
    supportsIllustration, supportsTickets, supportsSpeakers, supportsArtwork,
  });
}

// ── The 18 catalogue entries ──────────────────────────────────────────────
// The 3 IMPLEMENTED ones cross-reference the real archetypes/*.js objects
// for variantIds/staticLayoutFamilies/motion so the two never drift —
// their supportedEventSlugs is still derived from EVENT_STRONG_ARCHETYPES
// above (identical to the eventSlugs on the real archetype objects,
// verified by a registry-validation test).
export const CATALOGUE = Object.freeze({
  'toran-heritage': entry({
    id: 'toran-heritage', name: 'Toran Heritage', status: ARCHETYPE_STATUS.IMPLEMENTED,
    density: { min: CONTENT_DENSITY.MEDIUM, max: CONTENT_DENSITY.RICH },
    tones: ['traditional', 'warm', 'ceremonial'],
    capabilitiesPresented: capabilities({ travel: false, accommodation: false }),
    variantIds: ['marigold-garland'], staticLayoutFamilies: [STATIC_LAYOUT_FAMILY.CENTERED_CEREMONIAL],
    defaultMotionPreset: MOTION_PRESET.DRIFT, supportedMotionPresets: [MOTION_PRESET.DRIFT],
  }),
  'royal-palace': entry({
    id: 'royal-palace', name: 'Royal Palace', status: ARCHETYPE_STATUS.IMPLEMENTED,
    density: { min: CONTENT_DENSITY.RICH, max: CONTENT_DENSITY.VERY_RICH },
    tones: ['royal', 'formal', 'traditional'],
    variantIds: ['jaipur-peacock', 'maroon-jharokha'], staticLayoutFamilies: [STATIC_LAYOUT_FAMILY.FRAMED_PORTRAIT],
    defaultMotionPreset: MOTION_PRESET.UNVEIL, supportedMotionPresets: [MOTION_PRESET.UNVEIL, MOTION_PRESET.DRIFT],
  }),
  'ivory-mandala': entry({
    id: 'ivory-mandala', name: 'Ivory Mandala', status: ARCHETYPE_STATUS.IMPLEMENTED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.MEDIUM },
    tones: ['minimal', 'elegant', 'calm'],
    capabilitiesPresented: capabilities({ gallery: false, gifts: false }),
    variantIds: ['gold-lotus'], staticLayoutFamilies: [STATIC_LAYOUT_FAMILY.MINIMAL_SPACIOUS],
    defaultMotionPreset: MOTION_PRESET.DRIFT, supportedMotionPresets: [MOTION_PRESET.DRIFT],
  }),

  // ── Planned — metadata only, no variants/components/tokens yet ──
  'mughal-garden': entry({
    id: 'mughal-garden', name: 'Mughal Garden', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.MEDIUM, max: CONTENT_DENSITY.RICH },
    tones: ['traditional', 'formal', 'romantic'],
  }),
  'temple-heritage': entry({
    id: 'temple-heritage', name: 'Temple Heritage', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.RICH },
    tones: ['traditional', 'sacred', 'ceremonial'],
    capabilitiesPresented: capabilities({ gifts: false }),
  }),
  'folk-celebration': entry({
    id: 'folk-celebration', name: 'Folk Celebration', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.MEDIUM, max: CONTENT_DENSITY.VERY_RICH },
    tones: ['warm', 'energetic', 'traditional'],
  }),
  'botanical-romance': entry({
    id: 'botanical-romance', name: 'Botanical Romance', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.RICH },
    tones: ['romantic', 'warm', 'modern'], requiresPhotography: true,
  }),
  'illustrated-story': entry({
    id: 'illustrated-story', name: 'Illustrated Story', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.MEDIUM },
    tones: ['playful', 'warm', 'whimsical'], supportsIllustration: true,
  }),
  'photo-editorial': entry({
    id: 'photo-editorial', name: 'Photo Editorial', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.RICH },
    tones: ['modern', 'minimal', 'formal'], requiresPhotography: true,
    capabilitiesPresented: capabilities({ invocation: false }),
  }),
  'modern-indian': entry({
    id: 'modern-indian', name: 'Modern Indian', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.RICH },
    tones: ['modern', 'minimal', 'formal'],
  }),
  'night-bloom': entry({
    id: 'night-bloom', name: 'Night Bloom', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.MEDIUM, max: CONTENT_DENSITY.RICH },
    tones: ['romantic', 'modern', 'energetic'],
  }),
  'celestial': entry({
    id: 'celestial', name: 'Celestial', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.MEDIUM },
    tones: ['calm', 'playful', 'whimsical'],
    capabilitiesPresented: capabilities({ travel: false, accommodation: false, gatePass: false }),
  }),
  'playful-pop': entry({
    id: 'playful-pop', name: 'Playful Pop', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.MEDIUM },
    tones: ['playful', 'energetic', 'warm'],
    capabilitiesPresented: capabilities({ invocation: false, travel: false, accommodation: false }),
  }),
  'luxury-black': entry({
    id: 'luxury-black', name: 'Luxury Black', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.MEDIUM, max: CONTENT_DENSITY.RICH },
    tones: ['formal', 'modern', 'minimal'],
    capabilitiesPresented: capabilities({ invocation: false, gifts: false, wishingWall: false }),
  }),
  'corporate-grid': entry({
    id: 'corporate-grid', name: 'Corporate Grid', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.RICH },
    tones: ['professional', 'formal', 'minimal'],
    capabilitiesPresented: capabilities({ invocation: false, gallery: false, gifts: false, wishingWall: false, gatePass: false }),
    supportsSpeakers: true,
  }),
  'cultural-poster': entry({
    id: 'cultural-poster', name: 'Cultural Poster', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.MEDIUM },
    tones: ['energetic', 'playful', 'modern'],
    capabilitiesPresented: capabilities({ invocation: false, gifts: false }),
    supportsTickets: true, supportsArtwork: true,
  }),
  'stillness': entry({
    id: 'stillness', name: 'Stillness', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.MEDIUM },
    tones: ['solemn', 'calm', 'formal'], solemnCompatible: true,
    capabilitiesPresented: capabilities({ gifts: false, wishingWall: false, gallery: false }),
    defaultMotionPreset: MOTION_PRESET.STILLNESS, supportedMotionPresets: [MOTION_PRESET.STILLNESS],
  }),
  'wellness-earth': entry({
    id: 'wellness-earth', name: 'Wellness Earth', status: ARCHETYPE_STATUS.PLANNED,
    density: { min: CONTENT_DENSITY.LIGHT, max: CONTENT_DENSITY.MEDIUM },
    tones: ['calm', 'warm', 'minimal'],
    capabilitiesPresented: capabilities({ invocation: false, gifts: false, gatePass: false }),
  }),
});

export function getCatalogueEntry(archetypeId) {
  return CATALOGUE[archetypeId] || null;
}

export function listCatalogueEntries() {
  return Object.values(CATALOGUE);
}
