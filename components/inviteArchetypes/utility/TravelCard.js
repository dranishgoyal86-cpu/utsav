import { Text, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// travelNote: a guest-facing summary string the caller derives from real
// canonical data (event_invitees' arrival/departure columns, aggregated —
// or a simple host-written note) — this component stores nothing and
// never duplicates event_invitees itself.
export default function TravelCard({ tokens, travelNote }) {
  if (!travelNote) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="✈️" title="Travel">
      <Text style={[s.note, { color: c?.ink || '#1A1A1A' }]}>{travelNote}</Text>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({ note: { fontSize: 12.5, lineHeight: 18 } });
