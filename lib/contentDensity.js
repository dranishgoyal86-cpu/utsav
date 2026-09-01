// Pure content-density resolver — computes how much populated semantic
// content an event actually has, so lib/inviteDesignCompatibility.js can
// check it against an archetype's declared contentDensity range. Density
// is NEVER guessed from the event type alone (a hindu-wedding with just a
// couple's names and a date is 'light', not automatically 'very-rich') —
// it's computed from real values, same "pure, Supabase-free, plain-data-
// in/plain-data-out" convention as lib/eventResolver.js and
// lib/inviteSchemas' own resolvers.
//
// Structural richness signals (functionCount, hasTravelInfo,
// hasAccommodationInfo, galleryPhotoCount) are passed in by the caller,
// never read or stored here — they come from the real canonical tables
// (event_functions, event_invitees' travel columns, event_accommodations,
// the photo album) exactly as the brief's "do not duplicate canonical
// data" rule requires. This function only scores what it's told.
//
// "multiple venues" (named in the brief's "very rich" example) has no
// canonical per-function venue field today (event_functions has no venue
// column — confirmed against supabase/migrations/event_functions.sql) —
// approximated via functionCount alone rather than inventing a new
// tracking mechanism; flagged here rather than silently pretended-away.
import { CONTENT_DENSITY, CONTENT_DENSITY_ORDER } from './inviteDesignArchetypes/types';
import { listSchemaFields } from './inviteContentAdapter';

function isPopulated(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value === true;
  return true;
}

// Returns the raw signal breakdown (for tests/debugging) alongside the
// final score — never hides how a density level was reached.
export function computeDensitySignals({
  schema, values,
  functionCount = 0, hasTravelInfo = false, hasAccommodationInfo = false, galleryPhotoCount = 0,
} = {}) {
  const fields = schema ? listSchemaFields(schema) : [];
  const optionalOrRecommended = fields.filter((f) => f.status === 'optional' || f.status === 'recommended');
  const populatedCount = optionalOrRecommended.filter((f) => isPopulated(values ? values[f.key] : undefined)).length;

  let score = populatedCount;
  if (functionCount >= 2) score += 2;
  if (functionCount >= 4) score += 2;
  if (hasTravelInfo) score += 2;
  if (hasAccommodationInfo) score += 2;
  if (galleryPhotoCount > 0) score += 1;
  if (galleryPhotoCount >= 5) score += 1;

  return {
    score,
    populatedOptionalFieldCount: populatedCount,
    totalOptionalFieldCount: optionalOrRecommended.length,
    functionCount, hasTravelInfo, hasAccommodationInfo, galleryPhotoCount,
  };
}

// Score -> level thresholds. Deliberately simple, adjustable in one place
// — the exact boundaries matter less than the property every test in
// scripts/verifyInviteDesignArchetypes.js actually checks: density strictly
// increases as more real content/signals are added, never the reverse.
function levelForScore(score) {
  if (score >= 12) return CONTENT_DENSITY.VERY_RICH;
  if (score >= 7) return CONTENT_DENSITY.RICH;
  if (score >= 3) return CONTENT_DENSITY.MEDIUM;
  return CONTENT_DENSITY.LIGHT;
}

export function computeContentDensity(args) {
  return levelForScore(computeDensitySignals(args).score);
}

export function densityIndex(level) {
  return CONTENT_DENSITY_ORDER.indexOf(level);
}

// True when `level` falls within [min, max] (inclusive), comparing by
// CONTENT_DENSITY_ORDER position — used by lib/inviteDesignCompatibility.js.
export function densityInRange(level, min, max) {
  const idx = densityIndex(level);
  return idx >= densityIndex(min) && idx <= densityIndex(max);
}
