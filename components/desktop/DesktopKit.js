import { View, Text, TextInput, StyleSheet } from 'react-native';
import { CARD, LINE, MUTED, TEXT, MAROON, EYEBROW } from '../../lib/desktopTheme';

// Wave 13 — small shared pieces reused across every desktop screen (Guests,
// Gifts, Checklist, Invite designer, RSVP dashboard), so "generic corporate
// admin panel" mistakes (flat grey cards, default browser inputs) get fixed
// once here rather than needing four separate reviews.

// Soft radial colour wash behind the stat number, not a flat corporate
// card — the whole point of the "don't ship generic dashboard cards" note.
export function StatCard({ value, label, color = TEXT, washColor }) {
  return (
    <View style={s.stat}>
      <View style={[s.wash, { backgroundColor: washColor || `${color}14` }]} />
      <Text style={[s.statV, { color }]}>{value}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

// Rounded, warm-toned input — the antidote to "default browser-grey
// inputs" the invite-designer brief specifically calls out.
export function WarmInput(props) {
  return <TextInput placeholderTextColor={MUTED} style={[s.input, props.style]} {...props} />;
}

export function SectionEyebrow({ children }) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

const s = StyleSheet.create({
  stat: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 16, overflow: 'hidden' },
  wash: { position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50 },
  statV: { fontFamily: 'Fraunces-SemiBold', fontSize: 26, color: TEXT },
  statL: { fontSize: 10.5, color: MUTED, marginTop: 6, fontWeight: '700', letterSpacing: 0.3 },
  input: {
    backgroundColor: CARD, borderWidth: 1.5, borderColor: LINE, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 13.5, color: TEXT, fontFamily: 'Manrope-Regular',
  },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: EYEBROW, fontWeight: '700', marginBottom: 4 },
});
