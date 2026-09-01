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
