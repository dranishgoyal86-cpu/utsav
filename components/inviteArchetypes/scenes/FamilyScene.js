import { View, Text, StyleSheet } from 'react-native';

// parentsNote — nikah/engagement's own "both families" free-text field
// (RECOMMENDED for nikah), distinct from hostedBy — QA pass fix: this
// scene previously never rendered it at all, so a nikah/engagement invite
// with real parentsNote content silently showed nothing here.
// fatherToBeNote/family1Note/family2Note (Batch 2 — baby-shower's own
// family fields, deliberately not gendered as "mother/father" beyond the
// schema's own optional fatherToBeNote — see fields.js).
// kickerLabel — QA-pass fix: this scene's "WITH LOVE FROM" heading is
// right for a wedding/family celebration but reads oddly on a corporate
// conference, product launch or public event's organiser line ("WITH LOVE
// FROM TechCorp India"). Callers with a non-family, organisational
// hostedBy (professional/public-event content mapping) override it with
// a neutral label instead of family-affection wording; every existing
// family/wedding-shaped caller is unaffected (prop omitted, same default).
export default function FamilyScene({ tokens, hostedBy, parentsNote, grandparentsNote, familySurname, fatherToBeNote, family1Note, family2Note, kickerLabel = 'WITH LOVE FROM' }) {
  const lines = [hostedBy, parentsNote, fatherToBeNote, family1Note, family2Note, grandparentsNote, familySurname].filter(Boolean);
  if (lines.length === 0) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      <Text style={[s.kicker, { color: c?.accent || '#B8862F' }]}>{kickerLabel}</Text>
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
