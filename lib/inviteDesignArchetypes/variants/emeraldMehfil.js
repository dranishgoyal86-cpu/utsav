import { makeTokens } from '../tokens';

export default {
  id: 'emerald-mehfil',
  archetypeId: 'mughal-garden',
  name: 'Emerald Mehfil',
  // Visual QA pass fix: this palette was nearly a hex-for-hex duplicate of
  // royal-palace's jaipur-peacock (same teal-green bg family, same
  // straight-gold accent, same gradient shape) — found via this wave's
  // Playwright screenshots, where the two archetypes were visually
  // indistinguishable. Re-tuned toward a warmer jade green with a
  // terracotta/rose-gold accent (sandstone + rose-garden, the Mughal
  // Garden association) instead of royal-palace's cooler teal + straight
  // gold — genuinely different hue family, not just a shade apart.
  tokens: makeTokens({
    bg: '#1B4D3E',
    ink: '#FDF4E3',
    accent: '#C97B4A',
    line: '#4A7A63',
    dim: '#B8CFC0',
    dateColor: '#D99B6B',
    gradient: ['#245C49', '#0D2A20'],
    motif: 'jharokha',
    headlineFont: 'CormorantGaramond-SemiBold',
    kickerFont: 'Manrope-SemiBold',
  }),
};
