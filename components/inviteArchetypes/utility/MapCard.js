import { Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// venue: the real events.venue string — this component reads it, never
// stores a copy. "Maps/location remains easily accessible" (a verification
// requirement) means this stays one tap, not buried behind motion/scenes.
export default function MapCard({ tokens, venue }) {
  if (!venue) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="📍" title="Venue">
      <Text style={[s.address, { color: c?.ink || '#1A1A1A' }]}>{venue}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(googleMapsUrl(venue))}>
        <Text style={[s.link, { color: c?.accent || '#E8A020' }]}>View on Google Maps ›</Text>
      </TouchableOpacity>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({
  address: { fontSize: 12.5, marginBottom: 6, lineHeight: 18 },
  link: { fontSize: 12.5, fontWeight: '700' },
});
