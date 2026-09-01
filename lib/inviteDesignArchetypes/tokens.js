// Theme-token shape + helpers for the design-archetype registry. This is
// the THIRD level (Archetype -> Variant -> tokens) — the actual
// colour/font/motif values a rendering component consumes. Deliberately
// separate from lib/inviteThemes.js (the existing, untouched, 5-design
// legacy theme lookup for Toran/Kalamkari/Stillness/Ivory/Diya) — that
// module stays exactly as-is for the 5 legacy designs; this one is the new
// archetype system's own token shape, structurally similar (same kind of
// values: colors/gradient/motif) but a distinct registry so neither system
// has to contort itself to satisfy the other's shape.
//
// A token set is intentionally flat and renderer-agnostic — just data, no
// component references — reused verbatim by StaticInviteCard,
// WebInvitePreview's scenes, and (in a future wave) a PDF renderer, so all
// three genuinely share one visual source of truth per variant rather than
// three independent palettes that could drift.

// baseTokens: every variant's tokens object is expected to at least
// declare these keys. Font family names reference the exact families
// already bundled and proven working in this app's existing invite cards
// (ToranCoverCard.js/StillnessCard.js) — no new font assets this wave.
export function makeTokens({
  bg, ink, accent, line, dim, dateColor,
  gradient = null,
  motif, // decorative motif id, e.g. 'toran-arch' | 'jharokha' | 'mandala' — resolved to an actual SVG by the rendering layer, not this file
  kickerFont = 'Manrope-SemiBold',
  headlineFont = 'CormorantGaramond-SemiBold',
  bodyFont = 'Manrope-Regular',
}) {
  return Object.freeze({
    colors: Object.freeze({ bg, ink, accent, line, dim, dateColor: dateColor || dim }),
    gradient,
    motif,
    fonts: Object.freeze({ kicker: kickerFont, headline: headlineFont, body: bodyFont }),
  });
}
