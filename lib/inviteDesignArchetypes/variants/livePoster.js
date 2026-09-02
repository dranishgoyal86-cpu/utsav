import { makeTokens } from '../tokens';

export default {
  id: 'live-poster',
  archetypeId: 'cultural-poster',
  name: 'Live Poster',
  tokens: makeTokens({
    bg: '#2D1B4E',
    ink: '#FFFFFF',
    accent: '#FF6B35',
    line: '#5A3E82',
    dim: '#C4B3DC',
    dateColor: '#FF6B35',
    gradient: ['#3D2566', '#1A0F33'],
    motif: 'confetti',
    headlineFont: 'Manrope-SemiBold',
    kickerFont: 'Manrope-SemiBold',
    cornerRadius: 10,
  }),
};
