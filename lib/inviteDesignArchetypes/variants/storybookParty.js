import { makeTokens } from '../tokens';

export default {
  id: 'storybook-party',
  archetypeId: 'illustrated-story',
  name: 'Storybook Party',
  tokens: makeTokens({
    bg: '#FBF0DE',
    ink: '#4A2F1C',
    accent: '#C2703C',
    line: '#E3B888',
    dim: '#8C6B49',
    dateColor: '#7A5330',
    gradient: null,
    motif: 'storybook',
    headlineFont: 'Fraunces-SemiBold',
    kickerFont: 'Manrope-SemiBold',
    cornerRadius: 18,
  }),
};
