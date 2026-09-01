import { View, Text, StyleSheet } from 'react-native';

// Reads real event_wishes rows (passed in, already fetched by the caller
// via guest-pass's existing get_wishes action — see the invite-schema-
// foundation wave's investigation report) — never a shadow copy. Wording
// stays neutral here regardless of tone; the invite-schema-foundation
// wave already flagged that a real celebratory-vs-solemn wording pass for
// Wishing Wall awaits its first real client screen — this pilot scene is
// that first real client-facing surface, so it deliberately uses
// tone-neutral copy ("Wishes") rather than repeating the "no celebratory
// language" gap.
export default function WishingWallScene({ tokens, wishes = [] }) {
  if (!wishes.length) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      <Text style={[s.kicker, { color: c?.accent || '#B8862F' }]}>WISHES</Text>
      {wishes.slice(0, 3).map((w, i) => (
        <Text key={w.id || i} style={[s.wish, { color: c?.ink || '#1A1A1A' }]} numberOfLines={2}>“{w.message}”</Text>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 20, paddingHorizontal: 24 },
  kicker: { fontSize: 10, letterSpacing: 2, marginBottom: 8, textAlign: 'center' },
  wish: { fontSize: 12.5, fontStyle: 'italic', marginBottom: 8, textAlign: 'center' },
});
