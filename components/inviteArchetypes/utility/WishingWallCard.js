import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// Reads real event_wishes rows (same shape as scenes/WishingWallScene.js —
// passed in, already fetched by the caller, never a shadow copy).
// isNonFestive is required and enforced here, not just left to the caller,
// because a wishing-wall CTA is explicitly a celebratory ask ("leave a
// wish") that must never surface on a funeral/last-rites invite even if a
// caller forgets to gate it upstream.
export default function WishingWallCard({ tokens, wishes = [], isNonFestive = false, onPress }) {
  if (isNonFestive) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="💬" title="Wishes">
      {wishes.slice(0, 2).map((w, i) => (
        <Text key={w.id || i} style={[s.wish, { color: c?.ink || '#1A1A1A' }]} numberOfLines={2}>“{w.message}”</Text>
      ))}
      <TouchableOpacity style={[s.btn, { borderColor: c?.accent || '#E8A020' }]} onPress={onPress}>
        <Text style={[s.btnText, { color: c?.accent || '#E8A020' }]}>Leave a wish</Text>
      </TouchableOpacity>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({
  wish: { fontSize: 12.5, fontStyle: 'italic', marginBottom: 6, lineHeight: 18 },
  btn: { borderWidth: 1, borderRadius: 100, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  btnText: { fontSize: 12.5, fontWeight: '700' },
});
