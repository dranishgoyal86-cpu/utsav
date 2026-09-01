import { View, Text, StyleSheet } from 'react-native';

// Pilot placeholder — real photo grid is a future rendering-polish pass
// (photos come from the real album/gallery capability, this scene never
// stores them); shown only when the resolver confirms both the archetype
// supports gallery AND real photos exist.
export default function GalleryScene({ tokens, photoCount }) {
  if (!photoCount) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      <Text style={[s.kicker, { color: c?.accent || '#B8862F' }]}>MOMENTS</Text>
      <Text style={[s.text, { color: c?.dim || '#888' }]}>{photoCount} photo{photoCount === 1 ? '' : 's'} shared</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 20 },
  kicker: { fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  text: { fontSize: 12.5 },
});
