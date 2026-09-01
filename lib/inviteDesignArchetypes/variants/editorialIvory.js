import { makeTokens } from '../tokens';

// No motif — editorial minimalism relies on type + photo alone.
export default {
  id: 'editorial-ivory',
  archetypeId: 'photo-editorial',
  name: 'Editorial Ivory',
  tokens: makeTokens({
    bg: '#F7F5F1',
    ink: '#181614',
    accent: '#181614',
    line: '#D8D3CB',
    dim: '#77726A',
    dateColor: '#4A453E',
    gradient: null,
    motif: null,
    headlineFont: 'Fraunces-SemiBold',
    kickerFont: 'Manrope-SemiBold',
    bodyFont: 'Manrope-Regular',
  }),
};
