// STUB — integration boundary only. No real archetypes are implemented in
// this wave; per the invite-architecture brief: "DO NOT implement the
// actual new archetypes in this wave." This file exists so the schema/
// capability/adapter foundation built alongside it (lib/inviteSchemas/,
// lib/eventCapabilities.js, lib/inviteContentAdapter.js) has exactly one
// documented seam to plug a future design-archetype registry into, rather
// than that future work having to retrofit one into ToranInvites.js/
// ToranCoverCard.js after the fact.
//
// Future shape (NOT implemented here — sketched only so the eventual real
// version has a starting contract): a registry keyed by an archetype id,
// independent of both event_type_slug and the legacy template_id strings
// ('toran' | 'kalamkari' | 'stillness' | 'ivory' | 'diya'), each entry
// declaring:
//   - contentCompatibility: which schema "shapes" it can render (e.g.
//     couple-shaped vs subject-shaped vs generic) — checked against a
//     resolved inviteSchema's sections/fields, never against a hardcoded
//     event_type_slug list
//   - staticLayouts: layout definitions for one-page WhatsApp-image / PDF
//     rendering
//   - webScenes: scene definitions for an animated multi-scene web
//     invitation
//   - motionPresets: named motion presets, with an explicit non-festive
//     subset suppressed via lib/inviteSchemas's isNonFestive() (see that
//     file — "no celebratory motion" is a funeral safeguard named in the
//     brief; this is the seam a real motion system will hang off)
//   - contentDensitySupport: how many of a schema's optional/recommended
//     fields a given layout can actually surface before it breaks
//
// Until that registry exists, event_invite_content.template_id IS the
// design selector, resolved directly by lib/inviteThemes.js's
// resolveTheme() exactly as before this wave — nothing here changes that.
export const DESIGN_ARCHETYPES_IMPLEMENTED = false;

// Pass-through placeholder so a future caller has one function to extend
// rather than a new call site to invent from scratch. Today it performs no
// resolution at all — legacy:true signals "this is still just the raw
// template_id string, not a resolved archetype" to any future code that
// checks it.
export function resolveDesignArchetype(templateId) {
  return { archetypeId: templateId, legacy: true };
}
