// Wave 12 — the desktop guest list's per-function colour tags must never
// be a second, independent definition of what each invite design "looks
// like" (the exact mistake this project already caught three times with
// event-type vocabularies — see eventTypeSlug.js's own history). Every
// colour here is read directly from the real design tokens: inviteThemes
// for Toran/Kalamkari/Ivory/Diya, NightBloomCard.js's own NB export for
// Night Bloom (which deliberately has no inviteThemes entry — see that
// file's comment), a plain fallback for Stillness (its theme has no
// 'accent' key at all, by design — a muted, accent-less palette).
import { inviteThemes } from './inviteThemes';
import { NB } from '../components/invite/NightBloomCard';

// accent is each design's own single designated "signature colour" token
// (already used this way throughout Waves 5-11 — e.g. Diya's rangoli/
// kicker red, Ivory's divider/kicker colour) — the one consistent choice
// across every design that HAS one.
const DESIGN_COLORS = {
  toran: inviteThemes.toran.colors.accent,
  kalamkari: inviteThemes.kalamkari.colors.accent,
  ivory: inviteThemes.ivory.colors.accent,
  diya: inviteThemes.diya.colors.accent,
  nightbloom: NB.violet,
  // Stillness has no accent colour by design (muted, deliberately
  // restrained) — 'dim' is the closest real token to something a small
  // tag could use without inventing a colour Stillness doesn't have.
  stillness: inviteThemes.stillness.colors.dim,
};

// Returns { fg, bg } — bg is a low-opacity tint of the same real colour
// (computed, not a second hardcoded "-bg" constant per design), matching
// the reference's fg/bg tag pairing without doubling the colour count.
export function functionDesignColor(templateId) {
  const fg = DESIGN_COLORS[templateId];
  if (!fg) return null; // no design assigned — caller renders no tag at all
  return { fg, bg: `${fg}1A` }; // ~10% alpha hex suffix
}
