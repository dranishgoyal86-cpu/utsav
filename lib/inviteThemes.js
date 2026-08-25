// Wave 5 — the minimal two-design lookup. Not a database table, not an
// extensible theme engine: one object, two real entries. A third design
// later is one more object here, not a schema change (event_invite_
// content.template_id already stores whichever key is selected).
//
// Colour values are copied directly from each design's reviewed reference
// (Toran: utsav-animated-invites.html; Kalamkari: utsav-invite-design-
// system.html), not re-derived. dateColor/dim are named separately because
// Toran's own reference already used a distinct near-cream for the date
// line (#F0DFC2) versus the names colour (#FFF3DC) — extracting that
// honestly rather than collapsing it, not a new distinction invented here.
export const inviteThemes = {
  toran: {
    colors: {
      bg: '#4A0E1E',
      ink: '#FFF3DC',
      dateColor: '#F0DFC2',
      dim: '#C79A5A',
      line: '#D4A03C',
      accent: '#D4A03C',
    },
    // Approximates the web cover's radial gradient (same two stops) since
    // RN's LinearGradient has no radial mode — flagged in ToranCoverCard,
    // not pretended to be pixel-identical.
    gradient: ['#6E1A2E', '#2E0713'],
    motif: 'arch',
    connector: 'weds',
    kicker: 'श्री गणेशाय नमः',
  },
  kalamkari: {
    colors: {
      bg: '#F2E9D8',
      ink: '#12294D',
      dateColor: '#3C4E68',
      dim: '#6B7787',
      line: '#1B3A6B',
      accent: '#A8324A',
    },
    // No gradient in the reference — flat cream background, bordered by
    // the double-rect frame rather than a glow.
    gradient: null,
    motif: 'bloom',
    connector: '&',
    kicker: 'TOGETHER WITH THEIR FAMILIES',
  },
  // Wave 6 — structurally different from the other two, not just a third
  // palette (per the Stillness reference: "a different page," not "a third
  // colour set flowing through the same template"). motion:false and
  // layout:'single-card' are read explicitly by the renderer, not implied
  // by anything else here — there is no 'motif' key at all, since this
  // design has no arch/bloom/frame, just generous empty space.
  stillness: {
    colors: {
      bg: '#EFEDEA',
      ink: '#22201D',
      line: '#8C867E',
      dim: '#6B655E',
      soft: '#C9C3BA',
      body: '#4A453F',
    },
    gradient: null,
    motion: false,
    layout: 'single-card',
    kicker: 'IN LOVING MEMORY',
  },
};

export const DEFAULT_DESIGN = 'toran';

export function resolveTheme(design) {
  return inviteThemes[design] || inviteThemes[DEFAULT_DESIGN];
}
