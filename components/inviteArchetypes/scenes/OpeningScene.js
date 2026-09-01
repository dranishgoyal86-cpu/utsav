import { View, Text, StyleSheet } from 'react-native';
import HairRule from '../../invite/motifs/HairRule';

// First scene of the web invite — the "emotional canvas" half of the
// brief's split (decorative, not a utility module). Deliberately no
// blocking multi-second intro animation here: motion (when isNonFestive
// is false) is a subtle entrance the OpeningScene's caller applies via
// the resolved motion preset, not something this component hardcodes —
// see the "accessibility/performance" rule: "avoid long blocking intro
// animations... provide skip/continue behaviour."
export default function OpeningScene({ tokens, kicker, headline, subline }) {
  const c = tokens?.colors;
  return (
    <View style={[s.wrap, { backgroundColor: c?.bg || '#FAF6EC' }]}>
      {kicker ? <Text style={[s.kicker, { color: c?.accent || '#B8862F' }]}>{kicker.toUpperCase()}</Text> : null}
      {headline ? <Text style={[s.headline, { color: c?.ink || '#1A1A1A', fontFamily: tokens?.fonts?.headline }]}>{headline}</Text> : null}
      <View style={s.ruleWrap}><HairRule width={100} color={c?.line || '#DDD'} /></View>
      {subline ? <Text style={[s.subline, { color: c?.dim || '#888' }]}>{subline}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  kicker: { fontSize: 11, letterSpacing: 3, marginBottom: 10 },
  headline: { fontSize: 28, textAlign: 'center' },
  ruleWrap: { marginVertical: 16 },
  subline: { fontSize: 13, textAlign: 'center' },
});
