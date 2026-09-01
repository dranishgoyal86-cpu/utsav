import { makeTokens } from '../tokens';

// Second Toran Heritage variant — a brighter, bandhani-inspired red/pink
// palette alongside marigold-garland's maroon/gold, same toran-arch motif.
export default {
  id: 'red-bandhani',
  archetypeId: 'toran-heritage',
  name: 'Red Bandhani',
  tokens: makeTokens({
    bg: '#A8203A',
    ink: '#FFF6E8',
    accent: '#F2C230',
    line: '#E8577A',
    dim: '#F0B9C4',
    dateColor: '#FBE2C4',
    gradient: ['#C22C4A', '#7A1428'],
    motif: 'toran-arch',
    headlineFont: 'CormorantGaramond-SemiBold',
    kickerFont: 'TiroDevanagariHindi-Regular',
  }),
};
