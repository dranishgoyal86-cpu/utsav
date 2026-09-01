import { View, Text, StyleSheet } from 'react-native';

// parentsNote — nikah/engagement's own "both families" free-text field
// (RECOMMENDED for nikah), distinct from hostedBy — QA pass fix: this
// scene previously never rendered it at all, so a nikah/engagement invite
// with real parentsNote content silently showed nothing here.
export default function FamilyScene({ tokens, hostedBy, parentsNote, grandparentsNote, familySurname }) {
  const lines = [hostedBy, parentsNote, grandparentsNote, familySurname].filter(Boolean);
  if (lines.length === 0) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      <Text style={[s.kicker, { color: c?.accent || '#B8862F' }]}>WITH LOVE FROM</Text>
      {lines.map((line, i) => (
        <Text key={i} style={[s.line, { color: c?.ink || '#1A1A1A' }]}>{line}</Text>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24 },
  kicker: { fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  line: { fontSize: 13, textAlign: 'center', marginBottom: 4 },
});
