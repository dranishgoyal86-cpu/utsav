import { Text, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// stayNote: a guest-facing summary the caller derives from real
// event_accommodations rows — this component stores nothing and never
// duplicates that table.
export default function StayCard({ tokens, stayNote }) {
  if (!stayNote) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="🏨" title="Stay">
      <Text style={[s.note, { color: c?.ink || '#1A1A1A' }]}>{stayNote}</Text>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({ note: { fontSize: 12.5, lineHeight: 18 } });
