import { makeTokens } from '../tokens';

// Bold, high-contrast comic-panel energy — same Confetti.js motif as
// confetti-pop, a deliberately different palette (electric blue + sunshine
// yellow vs. that variant's warm orange/cream) so the two Playful Pop
// variants read as genuinely distinct, not a recolour exercise.
export default {
  id: 'comic-burst',
  archetypeId: 'playful-pop',
  name: 'Comic Burst',
  tokens: makeTokens({
    bg: '#1D4ED8',
    ink: '#FFFFFF',
    accent: '#FACC15',
    line: '#5B7CE8',
    dim: '#C7D4F7',
    dateColor: '#FDE68A',
    gradient: null,
    motif: 'confetti',
    headlineFont: 'Fraunces-SemiBold',
    kickerFont: 'Manrope-SemiBold',
    cornerRadius: 24,
  }),
};
