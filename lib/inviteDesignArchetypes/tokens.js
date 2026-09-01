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
//
// Design System Scaling Foundation wave — `semantic` (below) is a NEW,
// PURELY ADDITIVE block. `colors`/`gradient`/`motif`/`fonts` are returned
// exactly as before (StaticInviteCard.js, every scene component, and
// every utility card already read those paths — e.g. `tokens.colors.bg`,
// `tokens.fonts.headline` — and stay untouched, zero regression risk).
// `semantic` is the minimum cross-archetype token set the brief asks for
// (background/surface/surfaceAlt/primaryText/secondaryText/mutedText/
// accent/accentSoft/divider/utilitySurface/utilityBorder/utilityAction/
// decorativeStroke/headingFont/bodyFont/displayFont/cornerRadius/spacing/
// shadow/motifTreatment), derived from the SAME 6 colour inputs + 3 fonts
// every variant already supplies — no variant file needed to change to
// gain it. lib/inviteDesignArchetypes/utilityRegistry.js's
// STANDARD_UTILITY_TOKENS names a subset of these keys as the contract
// every utility card (implemented or planned) is specified to consume.
export function makeTokens({
  bg, ink, accent, line, dim, dateColor,
  gradient = null,
  motif, // decorative motif id, e.g. 'toran-arch' | 'jharokha' | 'mandala' — resolved to an actual SVG by the rendering layer, not this file
  kickerFont = 'Manrope-SemiBold',
  headlineFont = 'CormorantGaramond-SemiBold',
  bodyFont = 'Manrope-Regular',
  displayFont = null,
  cornerRadius = 14,
  spacingUnit = 8,
  shadowTreatment = 'soft',
  motifTreatment = 'line-art',
}) {
  const resolvedDateColor = dateColor || dim;
  return Object.freeze({
    colors: Object.freeze({ bg, ink, accent, line, dim, dateColor: resolvedDateColor }),
    gradient,
    motif,
    fonts: Object.freeze({ kicker: kickerFont, headline: headlineFont, body: bodyFont }),

    // New, additive — see header comment.
    semantic: Object.freeze({
      background: bg, surface: bg, surfaceAlt: gradient ? gradient[1] : bg,
      primaryText: ink, secondaryText: dim, mutedText: resolvedDateColor,
      accent, accentSoft: `${accent}33`, // ~20% alpha, same literal-alpha convention theme.js already uses elsewhere in this app
      divider: line,
      utilitySurface: bg, utilityBorder: line, utilityAction: accent,
      decorativeStroke: line,
      headingFont: headlineFont, bodyFont, displayFont: displayFont || headlineFont,
      cornerRadius, spacingUnit, shadowTreatment, motifTreatment,
    }),
  });
}
