import { makeTokens } from '../tokens';

export default {
  id: 'spotlight-black',
  archetypeId: 'luxury-black',
  name: 'Spotlight Black',
  tokens: makeTokens({
    bg: '#0A0A0A',
    ink: '#F5F0E6',
    accent: '#C9A227',
    line: '#2A2A2A',
    dim: '#8A8578',
    dateColor: '#C9A227',
    gradient: ['#141414', '#000000'],
    motif: null,
    headlineFont: 'CormorantGaramond-SemiBold',
    kickerFont: 'Manrope-SemiBold',
    cornerRadius: 2,
  }),
};
