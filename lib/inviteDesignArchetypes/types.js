// Shared vocabulary for the design-archetype registry. Deliberately free of
// React/Supabase imports (same convention as lib/inviteSchemas/types.js) so
// it stays plain-Node testable. This file answers "how does event content
// look and move" — it must never know what content an event actually has
// (that's lib/inviteSchemas' job) or which operational modules are turned
// on (that's lib/eventCapabilities' job). See this directory's index.js
// header comment for the full three-layer separation.

// Three conceptual levels: Archetype (a design direction, e.g. "Royal
// Palace") -> Variant (a concrete palette/motif within that direction,
// e.g. "Jaipur Peacock") -> theme tokens (the actual colour/font/motif
// values a variant resolves to, consumed by rendering components). Kept as
// three real levels rather than one flat template-id catalogue specifically
// so a future 200-template catalogue is still "a few archetypes, many
// variants," not hundreds of unrelated one-off configs.
export const DESIGN_LEVEL = Object.freeze({
  ARCHETYPE: 'archetype',
  VARIANT: 'variant',
  TOKENS: 'tokens',
});

// How much populated semantic content an event actually has — computed by
// lib/contentDensity.js from real field values, never guessed from the
// event type alone (a hindu-wedding with only a couple's names and a date
// is 'light', not automatically 'very-rich'). Archetypes declare a
// supported range; the compatibility resolver (lib/inviteDesignCompatibility.js)
// checks an event's computed density against it.
export const CONTENT_DENSITY = Object.freeze({
  LIGHT: 'light',
  MEDIUM: 'medium',
  RICH: 'rich',
  VERY_RICH: 'very-rich',
});
// Ordered so a range check (min <= density <= max) can compare by index.
export const CONTENT_DENSITY_ORDER = [
  CONTENT_DENSITY.LIGHT, CONTENT_DENSITY.MEDIUM, CONTENT_DENSITY.RICH, CONTENT_DENSITY.VERY_RICH,
];

// Reusable motion identifiers — a design declares which of these it uses,
// never bespoke per-template animation logic. 'stillness' is motion-off
// (the identifier a solemn/non-festive design resolves to), not merely
// "unused" — see lib/inviteDesignArchetypes/index.js's
// resolveMotionForEvent(), which is the one place isNonFestive() is
// actually enforced against motion, matching the funeral safeguard from
// the invite-schema-foundation wave.
export const MOTION_PRESET = Object.freeze({
  UNVEIL: 'unveil',
  DRIFT: 'drift',
  BLOOM: 'bloom',
  PROCESSION: 'procession',
  STILLNESS: 'stillness',
});

// Reusable web-invite scene identifiers. Not every event/design uses every
// scene — lib/inviteSceneResolver.js decides which ones actually apply for
// a given event (populated content + active capabilities + archetype
// support), this file only names the vocabulary.
export const SCENE = Object.freeze({
  OPENING: 'opening',
  INVOCATION: 'invocation',
  COUPLE: 'couple',
  FAMILY: 'family',
  FUNCTIONS: 'functions',
  STORY: 'story',
  GALLERY: 'gallery',
  VENUE: 'venue',
  TRAVEL: 'travel',
  STAY: 'stay',
  GUEST_ACCESS: 'guest-access',
  RSVP: 'rsvp',
  WISHING_WALL: 'wishing-wall',
  CLOSING: 'closing',
});

// Utility-navigation item identifiers — the small persistent nav a web
// invite can offer (Invite/Functions/Travel/Stay/RSVP/More). Deliberately
// a short, fixed vocabulary (not one per archetype) since the whole point
// is "don't redesign navigation per template" — lib/inviteUtilityNav.js
// decides which of these are active for a given event.
export const NAV_ITEM = Object.freeze({
  INVITE: 'invite',
  FUNCTIONS: 'functions',
  TRAVEL: 'travel',
  STAY: 'stay',
  RSVP: 'rsvp',
  MORE: 'more',
});

// Static-card compositional slots (NOT arbitrary coordinates) — an
// archetype/variant positions and styles these differently, but every
// static layout is built from this same fixed slot vocabulary. See
// lib/staticInviteLayout.js.
export const STATIC_SLOT = Object.freeze({
  DECORATION: 'decoration',
  SYMBOL: 'symbol', // invocation/religious symbol — host-selected content only, never auto-inserted
  KICKER: 'kicker',
  HEADLINE: 'headline',
  PRIMARY_NAMES: 'primaryNames',
  HOST_LINE: 'hostLine',
  DATE_TIME: 'dateTime',
  VENUE: 'venue',
  SECONDARY_DETAIL: 'secondaryDetail',
  QR_FOOTER: 'qrFooter',
  ATTRIBUTION: 'attribution', // mandatory, injected by lib/inviteBrandingPolicy.js — never archetype-controlled
});

// The fixed set of "what can this archetype present" flags an archetype
// declares in its `supports` object — deliberately named after
// CONTENT/PRESENTATION concepts (invocation, heroPhoto, multipleFunctions,
// programme, gallery, ...), not after lib/eventCapabilities.js's
// operational-module keys. An archetype saying `supports.travel: true`
// means "I have a Travel scene/card to show IF the event has travel
// content and the travel_coordination capability is active" — it does not
// itself gate or store that data; lib/eventCapabilities.js remains the
// sole source of truth for whether a module is available/activated.
export const SUPPORT_FLAGS = Object.freeze([
  'invocation', 'heroPhoto', 'gallery', 'multipleFunctions', 'programme',
  'maps', 'travel', 'accommodation', 'gatePass', 'gifts', 'wishingWall',
]);

// Validates one archetype definition's shape. Used by index.js's
// validateArchetypeRegistry() — mirrors lib/inviteSchemas/index.js's own
// validateSchemaRegistry() pattern (dev/test-time check, not a runtime
// guard). Returns an array of problem strings, empty means clean.
export function validateArchetypeShape(archetype) {
  const problems = [];
  if (!archetype || typeof archetype !== 'object') return ['archetype is not an object'];
  const id = archetype.id || '(missing id)';
  if (!archetype.id) problems.push('archetype has no id');
  if (!archetype.name) problems.push(`archetype "${id}" has no name`);
  if (!Array.isArray(archetype.eventSlugs) || archetype.eventSlugs.length === 0) {
    problems.push(`archetype "${id}" has no eventSlugs`);
  }
  const density = archetype.contentDensity;
  if (!density || !CONTENT_DENSITY_ORDER.includes(density.min) || !CONTENT_DENSITY_ORDER.includes(density.max)) {
    problems.push(`archetype "${id}" has an invalid contentDensity range`);
  } else if (CONTENT_DENSITY_ORDER.indexOf(density.min) > CONTENT_DENSITY_ORDER.indexOf(density.max)) {
    problems.push(`archetype "${id}" has contentDensity.min after contentDensity.max`);
  }
  if (!archetype.static || typeof archetype.static.supported !== 'boolean') {
    problems.push(`archetype "${id}" is missing static.supported`);
  }
  if (!archetype.pdf || typeof archetype.pdf.supported !== 'boolean') {
    problems.push(`archetype "${id}" is missing pdf.supported`);
  }
  if (!archetype.web || typeof archetype.web.supported !== 'boolean') {
    problems.push(`archetype "${id}" is missing web.supported`);
  }
  if (!Array.isArray(archetype.motionPresets)) {
    problems.push(`archetype "${id}" has no motionPresets array`);
  } else if (archetype.motionPresets.some((m) => !Object.values(MOTION_PRESET).includes(m))) {
    problems.push(`archetype "${id}" declares an unknown motion preset`);
  }
  if (!archetype.supports || typeof archetype.supports !== 'object') {
    problems.push(`archetype "${id}" has no supports object`);
  }
  if (!Array.isArray(archetype.variantIds) || archetype.variantIds.length === 0) {
    problems.push(`archetype "${id}" has no variantIds`);
  }
  return problems;
}

export function validateVariantShape(variant, archetypeId) {
  const problems = [];
  if (!variant || typeof variant !== 'object') return [`variant on archetype "${archetypeId}" is not an object`];
  const id = variant.id || '(missing id)';
  if (!variant.id) problems.push(`variant on archetype "${archetypeId}" has no id`);
  if (variant.archetypeId !== archetypeId) {
    problems.push(`variant "${id}" declares archetypeId "${variant.archetypeId}", expected "${archetypeId}"`);
  }
  if (!variant.name) problems.push(`variant "${id}" has no name`);
  if (!variant.tokens || typeof variant.tokens !== 'object') {
    problems.push(`variant "${id}" has no tokens`);
  }
  return problems;
}

// ─────────────────────────────────────────────────────────────────────────
// Design System Scaling Foundation wave — everything below is ADDITIVE.
// Nothing above this line changed shape or behavior; the 3 implemented
// archetypes (toranHeritage/royalPalace/ivoryMandala.js) and every resolver
// that reads their existing fields (eventSlugs/contentDensity/static/pdf/
// web/motionPresets/supports/variantIds) are untouched. This section adds
// the vocabulary for the CATALOGUE layer (lib/inviteDesignArchetypes/
// catalogue.js) — a lighter-weight planning/compatibility metadata record
// that exists for all 18 target archetype IDs (3 implemented + 15
// planned), distinct from (but cross-referencing) the 3 full
// implementation objects above.
// ─────────────────────────────────────────────────────────────────────────

// The implemented/planned distinction the whole catalogue exists to
// preserve — a 'planned' entry is pure compatibility metadata (no
// variants, no tokens, no components); only 'implemented' entries are ever
// returned by a production-selection helper (see
// lib/inviteDesignCompatibilityMatrix.js's getSelectableArchetypes()).
export const ARCHETYPE_STATUS = Object.freeze({
  IMPLEMENTED: 'implemented',
  PLANNED: 'planned',
});

// The nuanced compatibility verdict lib/inviteDesignCompatibilityMatrix.js
// resolves per (eventTypeSlug, archetypeId) pair — replaces a plain
// boolean so a future picker UI can show "Recommended" / "More designs" /
// not offer an option at all, per the brief's explicit request for more
// nuance than true/false.
export const COMPATIBILITY_LEVEL = Object.freeze({
  STRONG: 'strong',
  COMPATIBLE: 'compatible',
  UNSUPPORTED: 'unsupported',
});

// The fuller semantic scene-ROLE vocabulary (lib/inviteDesignArchetypes/
// sceneRegistry.js) — deliberately a SEPARATE list from SCENE above, not a
// rename of it. SCENE is the small, already-wired set
// lib/inviteSceneResolver.js/WebInvitePreview.js actually render today
// (kept 100% unchanged so nothing regresses); SCENE_ROLE is the fuller
// ~30-concept planning vocabulary a future renderer can grow into. Several
// SCENE_ROLE entries deliberately have no 1:1 SCENE match yet (e.g.
// 'speakers', 'tickets', 'transport') — that's the whole point: the
// contract can name a future scene before any component exists for it.
// Where a real, working SCENE id already covers the same concept under a
// different name (e.g. SCENE.STAY vs. this list's more semantically-named
// 'accommodation'), sceneRegistry.js's own entry documents that mapping
// rather than this file inventing a second STAY value.
export const SCENE_ROLE = Object.freeze({
  OPENING: 'opening',
  INVOCATION: 'invocation',
  PEOPLE: 'people',
  COUPLE: 'couple',
  FAMILY: 'family',
  HONOUREE: 'honouree',
  EVENT_DETAILS: 'event-details',
  FUNCTIONS: 'functions',
  PROGRAMME: 'programme',
  STORY: 'story',
  GALLERY: 'gallery',
  VENUE: 'venue',
  MAPS: 'maps',
  TRAVEL: 'travel',
  ACCOMMODATION: 'accommodation',
  TRANSPORT: 'transport',
  GUEST_ACCESS: 'guest-access',
  DRESS_CODE: 'dress-code',
  FOOD: 'food',
  GIFTS: 'gifts',
  WISHING_WALL: 'wishing-wall',
  REGISTRATION: 'registration',
  SPEAKERS: 'speakers',
  ARTWORK: 'artwork',
  TICKETS: 'tickets',
  RULES: 'rules',
  PACKING: 'packing',
  RSVP: 'rsvp',
  CONTACT: 'contact',
  CLOSING: 'closing',
});

// Future static-composition families (lib/staticInviteLayout.js's
// STATIC_SLOT vocabulary stays the actual slot contract; a "family" is a
// higher-level positioning/emphasis choice among those slots — e.g.
// 'photo-editorial' emphasizes a large heroPhoto slot, 'poster' emphasizes
// headline/artwork). Metadata only this wave — no new layout rendering.
export const STATIC_LAYOUT_FAMILY = Object.freeze({
  CENTERED_CEREMONIAL: 'centered-ceremonial',
  FRAMED_PORTRAIT: 'framed-portrait',
  PHOTO_EDITORIAL: 'photo-editorial',
  POSTER: 'poster',
  MINIMAL_SPACIOUS: 'minimal-spacious',
  SPLIT_PHOTO: 'split-photo',
  PROGRAMME_POSTER: 'programme-poster',
});

// PDF page-role vocabulary — lib/staticInviteLayout.js's buildPdfPageModels()
// keeps its existing page `kind` strings ('invitation'/'functions'/
// 'travel-stay') unchanged (already Playwright-verified in the pilot wave);
// this enum is the fuller semantic roster a future PDF pass can grow into
// without inventing a second, competing template system — 'travel-stay'
// maps onto both PDF_PAGE_ROLE.TRAVEL and .ACCOMMODATION at once today.
export const PDF_PAGE_ROLE = Object.freeze({
  INVITATION: 'invitation',
  FUNCTIONS: 'functions',
  PROGRAMME: 'programme',
  TRAVEL: 'travel',
  ACCOMMODATION: 'accommodation',
  VENUE: 'venue',
  GUEST_INFORMATION: 'guest-information',
  REGISTRATION: 'registration',
  MEMORIAL_DETAILS: 'memorial-details',
});

// Event-lifecycle modes — metadata only this wave (no date-driven
// switching implemented, per the brief's explicit "just establish
// metadata" instruction). lib/inviteLifecycle.js's SCENE_LIFECYCLE_PRIORITY
// declares each scene role's priority per mode.
export const LIFECYCLE_MODE = Object.freeze({
  INVITATION: 'invitation',
  PRE_EVENT: 'pre-event',
  EVENT_DAY: 'event-day',
  POST_EVENT: 'post-event',
});
export const LIFECYCLE_PRIORITY = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  VERY_HIGH: 'very-high',
});

// Validates one CATALOGUE entry (the lighter planning-metadata shape,
// distinct from validateArchetypeShape() above which validates a full
// IMPLEMENTED archetype object). A 'planned' entry deliberately does not
// need variantIds/static.layouts/motionPresets/etc. — see this wave's
// "planned archetypes do not need full production tokens/components yet"
// requirement. Returns an array of problem strings, empty means clean.
export function validateCatalogueEntryShape(entry) {
  const problems = [];
  if (!entry || typeof entry !== 'object') return ['catalogue entry is not an object'];
  const id = entry.id || '(missing id)';
  if (!entry.id) problems.push('catalogue entry has no id');
  if (!entry.name) problems.push(`catalogue entry "${id}" has no name`);
  if (!Object.values(ARCHETYPE_STATUS).includes(entry.status)) {
    problems.push(`catalogue entry "${id}" has invalid status "${entry.status}"`);
  }
  if (!Array.isArray(entry.supportedEventSlugs) || entry.supportedEventSlugs.length === 0) {
    problems.push(`catalogue entry "${id}" has no supportedEventSlugs`);
  }
  const density = entry.density;
  if (!density || !CONTENT_DENSITY_ORDER.includes(density.min) || !CONTENT_DENSITY_ORDER.includes(density.max)) {
    problems.push(`catalogue entry "${id}" has an invalid density range`);
  } else if (CONTENT_DENSITY_ORDER.indexOf(density.min) > CONTENT_DENSITY_ORDER.indexOf(density.max)) {
    problems.push(`catalogue entry "${id}" has density.min after density.max`);
  }
  if (typeof entry.solemnCompatible !== 'boolean') {
    problems.push(`catalogue entry "${id}" is missing solemnCompatible`);
  }
  if (!Array.isArray(entry.tones) || entry.tones.length === 0) {
    problems.push(`catalogue entry "${id}" has no tones`);
  }
  if (!entry.capabilitiesPresented || typeof entry.capabilitiesPresented !== 'object') {
    problems.push(`catalogue entry "${id}" has no capabilitiesPresented`);
  }
  if (!entry.presentationSupport || !entry.presentationSupport.static || !entry.presentationSupport.pdf || !entry.presentationSupport.web) {
    problems.push(`catalogue entry "${id}" has an incomplete presentationSupport (needs static/pdf/web)`);
  }
  // Implemented entries additionally need everything a real render pass
  // touches — a stricter bar than 'planned', matching test requirement
  // "planned archetypes do not need full production tokens/components yet."
  if (entry.status === ARCHETYPE_STATUS.IMPLEMENTED) {
    if (!Array.isArray(entry.variantIds) || entry.variantIds.length === 0) {
      problems.push(`implemented catalogue entry "${id}" has no variantIds`);
    }
    if (!Array.isArray(entry.staticLayoutFamilies) || entry.staticLayoutFamilies.length === 0) {
      problems.push(`implemented catalogue entry "${id}" has no staticLayoutFamilies`);
    }
  }
  return problems;
}
