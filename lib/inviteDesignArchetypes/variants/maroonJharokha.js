import { makeTokens } from '../tokens';

// Second variant of royal-palace — same archetype (jharokha motif, same
// scene preset/motion/supports), a genuinely different palette. Exists
// specifically to exercise the variant resolver against an archetype with
// more than one real option (see the invite-architecture brief's own
// "You may provide two variants for one archetype if useful for testing
// variant resolution").
export default {
  id: 'maroon-jharokha',
  archetypeId: 'royal-palace',
  name: 'Maroon Jharokha',
  tokens: makeTokens({
    bg: '#4A0E1E',
    ink: '#FFF3DC',
    accent: '#D4A03C',
    line: '#8A3550',
    dim: '#C79A5A',
    dateColor: '#F0DFC2',
    gradient: ['#6E1A2E', '#2E0713'],
    motif: 'jharokha',
    headlineFont: 'CormorantGaramond-SemiBold',
    kickerFont: 'TiroDevanagariHindi-Regular',
  }),
};
