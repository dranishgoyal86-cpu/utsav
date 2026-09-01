// Design-archetype registry — answers "how does event content look and
// move." This is the third of three deliberately separate systems:
//   1. lib/inviteSchemas       — what information belongs to the event
//   2. lib/eventCapabilities   — what operational modules are available
//   3. lib/inviteDesignArchetypes (this file) — how content looks/moves
// An archetype/variant never stores event content and never gates an
// operational module — it only declares what it CAN present (its
// `supports` flags) and how (tokens/scenes/motion). The compatibility and
// scene resolvers (lib/inviteDesignCompatibility.js,
// lib/inviteSceneResolver.js) are what actually combine this with real
// content/capabilities at render time.
//
// Design model: Archetype -> Variant -> tokens (see types.js's
// DESIGN_LEVEL). Only 3 archetypes are implemented in production detail
// this wave (the Hindu Wedding pilot) — toran-heritage, royal-palace,
// ivory-mandala — proving the registry shape works, not a finished
// catalogue. FUTURE_ARCHETYPE_IDS below documents the fuller future
// direction set without implementing any of them; adding one later is a
// new archetypes/*.js + variants/*.js file plus one registry entry, same
// shape as adding an inviteSchemas dedicated schema.
import { validateArchetypeShape, validateVariantShape, MOTION_PRESET } from './types';

import toranHeritage from './archetypes/toranHeritage';
import royalPalace from './archetypes/royalPalace';
import ivoryMandala from './archetypes/ivoryMandala';

import marigoldGarland from './variants/marigoldGarland';
import jaipurPeacock from './variants/jaipurPeacock';
import maroonJharokha from './variants/maroonJharokha';
import goldLotus from './variants/goldLotus';

const ARCHETYPES_BY_ID = Object.freeze({
  'toran-heritage': toranHeritage,
  'royal-palace': royalPalace,
  'ivory-mandala': ivoryMandala,
});

const VARIANTS_BY_ID = Object.freeze({
  'marigold-garland': marigoldGarland,
  'jaipur-peacock': jaipurPeacock,
  'maroon-jharokha': maroonJharokha,
  'gold-lotus': goldLotus,
});

// Not implemented this wave — declared only so the registry's shape and
// any future roadmap doc can point at real, stable identifiers rather
// than inventing new ones later. Adding real detail behind one of these
// ids is future work; nothing in this app resolves them yet.
export const FUTURE_ARCHETYPE_IDS = Object.freeze([
  'mughal-garden', 'temple-heritage', 'folk-celebration', 'botanical-romance',
  'illustrated-story', 'photo-editorial', 'modern-indian', 'night-bloom',
  'celestial', 'playful-pop', 'luxury-black', 'corporate-grid',
  'cultural-poster', 'stillness', 'wellness-earth',
]);

export function getArchetype(archetypeId) {
  return ARCHETYPES_BY_ID[archetypeId] || null;
}

export function getVariant(variantId) {
  return VARIANTS_BY_ID[variantId] || null;
}

// All implemented variants belonging to one archetype, in the archetype's
// own declared order (variantIds) — never trusts VARIANTS_BY_ID's
// insertion order, since a future variant file could be added to that map
// before its id is added to the owning archetype's variantIds (or vice
// versa); this function is also exactly what validateArchetypeRegistry()
// below uses to catch that specific drift.
export function getVariantsForArchetype(archetypeId) {
  const archetype = getArchetype(archetypeId);
  if (!archetype) return [];
  return archetype.variantIds.map((id) => VARIANTS_BY_ID[id]).filter(Boolean);
}

export function listArchetypes() {
  return Object.values(ARCHETYPES_BY_ID);
}

// Archetypes whose eventSlugs include the given event_type_slug — the
// starting candidate list before density/support compatibility is
// checked (lib/inviteDesignCompatibility.js does that finer-grained
// check); this is just "which archetypes even claim to work for this
// event type at all."
export function listArchetypesForEventSlug(eventTypeSlug) {
  return listArchetypes().filter((a) => a.eventSlugs.includes(eventTypeSlug));
}

// Non-festive motion enforcement — the one place this registry actually
// consults lib/inviteSchemas' centralized isNonFestive() resolver (passed
// in by the caller, not imported directly, to keep this file's own
// dependency graph one-directional and easy to unit-test with a plain
// boolean). A non-festive event NEVER resolves to a celebratory motion
// preset — MOTION_PRESET.STILLNESS (motion-off) is returned regardless of
// what the selected archetype/variant would otherwise use. This is the
// direct architectural continuation of the funeral safeguards from the
// invite-schema-foundation wave (no celebratory motion) — enforced here at
// the registry level so no individual archetype/variant/scene component
// has to remember to check it.
export function resolveMotionForEvent({ archetypeId, isNonFestive, preferredPreset } = {}) {
  if (isNonFestive) return MOTION_PRESET.STILLNESS;
  const archetype = getArchetype(archetypeId);
  const presets = archetype?.motionPresets || [];
  if (preferredPreset && presets.includes(preferredPreset)) return preferredPreset;
  return presets[0] || MOTION_PRESET.STILLNESS;
}

// Dev/test-time integrity check (same convention as
// lib/inviteSchemas/index.js's validateSchemaRegistry()) — not called on
// any runtime hot path. Confirms:
//  1. every archetype's own shape is valid (types.js's validateArchetypeShape),
//  2. every archetype id key matches its own internal `id`,
//  3. every variant referenced by an archetype's variantIds actually
//     exists in VARIANTS_BY_ID and is shaped correctly,
//  4. every variant's own archetypeId matches the archetype that claims it,
//  5. no variant is orphaned (registered in VARIANTS_BY_ID but not
//     referenced by any archetype's variantIds),
//  6. archetype ids are unique (guaranteed by object-key uniqueness, but
//     checked explicitly against each archetype's internal `id` for a
//     copy-paste mismatch, same class of bug the invite-schema
//     registry's own validator caught for 'adult-birthday').
export function validateArchetypeRegistry() {
  const problems = [];
  const referencedVariantIds = new Set();

  for (const [key, archetype] of Object.entries(ARCHETYPES_BY_ID)) {
    if (archetype.id !== key) {
      problems.push(`Archetype registered under key "${key}" has mismatched internal id "${archetype.id}".`);
    }
    problems.push(...validateArchetypeShape(archetype));

    for (const variantId of archetype.variantIds || []) {
      referencedVariantIds.add(variantId);
      const variant = VARIANTS_BY_ID[variantId];
      if (!variant) {
        problems.push(`Archetype "${archetype.id}" references unknown variant "${variantId}".`);
        continue;
      }
      problems.push(...validateVariantShape(variant, archetype.id));
    }
  }

  for (const [key, variant] of Object.entries(VARIANTS_BY_ID)) {
    if (variant.id !== key) {
      problems.push(`Variant registered under key "${key}" has mismatched internal id "${variant.id}".`);
    }
    if (!referencedVariantIds.has(key)) {
      problems.push(`Variant "${key}" is registered but not referenced by any archetype's variantIds (orphaned).`);
    }
  }

  return problems;
}
