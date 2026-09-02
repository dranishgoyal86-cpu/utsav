import { Text, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// Plain host/organiser contact text — reusable across any event type that
// declares a contactInfo-shaped field (team-offsite, corporate-conference,
// product-launch). No new contact-storage system; renders whatever the
// host wrote.
export default function ContactCard({ tokens, contactInfo }) {
  if (!contactInfo) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="✉️" title="Contact">
      <Text style={[s.note, { color: c?.ink || '#1A1A1A' }]}>{contactInfo}</Text>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({ note: { fontSize: 12.5, lineHeight: 18 } });
