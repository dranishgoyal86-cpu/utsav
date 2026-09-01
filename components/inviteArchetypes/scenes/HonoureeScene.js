import { View, Text, Image, StyleSheet } from 'react-native';

// A single named person the invite is centered on, without a partner —
// the kids-birthday/engagement-subject/general-celebrant case CoupleScene
// doesn't cover (CoupleScene requires at least one of partner1Name/
// partner2Name; a solo honouree — "Aanya turns 5" — is a different scene
// id, not a couple with an empty second slot). ageLine is plain text
// (e.g. "Turning 5") so this scene never has to know event-type-specific
// milestone wording itself.
export default function HonoureeScene({ tokens, name, ageLine, photoUrl }) {
  if (!name) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      {photoUrl ? <Image source={{ uri: photoUrl }} style={s.photo} /> : null}
      <Text style={[s.name, { color: c?.ink || '#1A1A1A', fontFamily: tokens?.fonts?.headline }]}>{name}</Text>
      {ageLine ? <Text style={[s.ageLine, { color: c?.accent || '#888' }]}>{ageLine}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  photo: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  name: { fontSize: 26, textAlign: 'center' },
  ageLine: { fontSize: 13, marginTop: 8, letterSpacing: 1 },
});
