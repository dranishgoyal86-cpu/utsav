import { Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// venue: the real events.venue string — this component reads it, never
// stores a copy. "Maps/location remains easily accessible" (a verification
// requirement) means this stays one tap, not buried behind motion/scenes.
// addressDetail (Batch 2 — housewarming): an optional plain-text line for
// exact tower/block/flat + landmark + parking, rendered ABOVE the venue
// so it never gets buried inside decorative prose — a guest finding a
// specific flat in a large society needs this line, not just the society
// name that `venue` alone usually carries.
export default function MapCard({ tokens, venue, addressDetail }) {
  if (!venue) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="📍" title="Venue">
      {addressDetail ? <Text style={[s.addressDetail, { color: c?.ink || '#1A1A1A' }]}>{addressDetail}</Text> : null}
      <Text style={[s.address, { color: c?.ink || '#1A1A1A' }]}>{venue}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(googleMapsUrl(venue))}>
        <Text style={[s.link, { color: c?.accent || '#E8A020' }]}>View on Google Maps ›</Text>
      </TouchableOpacity>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({
  addressDetail: { fontSize: 12.5, fontWeight: '700', marginBottom: 4, lineHeight: 18 },
  address: { fontSize: 12.5, marginBottom: 6, lineHeight: 18 },
  link: { fontSize: 12.5, fontWeight: '700' },
});
