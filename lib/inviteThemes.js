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
};

export const DEFAULT_DESIGN = 'toran';

export function resolveTheme(design) {
  return inviteThemes[design] || inviteThemes[DEFAULT_DESIGN];
}
