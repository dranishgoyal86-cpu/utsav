import { View, Text, Image, StyleSheet } from 'react-native';

// Semantic speaker/panelist presentation — SCENE_ROLE.SPEAKERS was
// already contract-only in sceneRegistry.js since the Design System
// Scaling Foundation wave ("corporate-conference" named explicitly in its
// own `role` description, but Exhibition/Product Launch may reuse it
// later too — deliberately not corporate-specific). speakers: an array of
// { name, designation, organisation, photoUrl, sessionTitle } — plain
// data the caller already has (from schema_content's structured
// speakersNote, or a future dedicated speakers table), never fetched or
// stored by this component itself.
export default function SpeakersScene({ tokens, speakers = [] }) {
  if (!speakers.length) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      <Text style={[s.kicker, { color: c?.accent || '#B8862F' }]}>SPEAKERS</Text>
      {speakers.map((sp, i) => (
        <View key={sp.id || i} style={[s.card, { borderColor: c?.line || '#EEE' }]}>
          {sp.photoUrl ? <Image source={{ uri: sp.photoUrl }} style={s.photo} /> : <View style={[s.photo, s.photoPlaceholder, { backgroundColor: c?.line || '#EEE' }]} />}
          <View style={s.info}>
            <Text style={[s.name, { color: c?.ink || '#1A1A1A' }]}>{sp.name}</Text>
            {(sp.designation || sp.organisation) ? (
              <Text style={[s.role, { color: c?.dim || '#888' }]}>{[sp.designation, sp.organisation].filter(Boolean).join(', ')}</Text>
            ) : null}
            {sp.sessionTitle ? <Text style={[s.session, { color: c?.accent || '#B8862F' }]}>{sp.sessionTitle}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 16, paddingHorizontal: 24 },
  kicker: { fontSize: 10, letterSpacing: 2, marginBottom: 10, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
  photo: { width: 44, height: 44, borderRadius: 22 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 13, fontWeight: '700' },
  role: { fontSize: 11, marginTop: 1 },
  session: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
});
