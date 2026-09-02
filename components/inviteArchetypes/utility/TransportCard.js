import { Text, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// Meeting point / departure / return details — team-offsite's own
// meetingPoint/departureTime/returnTime fields, read here exactly as
// entered. Distinct from TravelCard (outstation guest travel guidance)
// and GatePassCard (venue entry) — this is coordination for a group that
// travels TOGETHER to a shared destination.
export default function TransportCard({ tokens, meetingPoint, departureTime, returnTime }) {
  const lines = [
    meetingPoint ? `Meeting point: ${meetingPoint}` : null,
    departureTime ? `Departure: ${departureTime}` : null,
    returnTime ? `Return: ${returnTime}` : null,
  ].filter(Boolean);
  if (lines.length === 0) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="🚌" title="Transport">
      {lines.map((line, i) => (
        <Text key={i} style={[s.line, { color: c?.ink || '#1A1A1A' }]}>{line}</Text>
      ))}
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({ line: { fontSize: 12.5, lineHeight: 18, marginBottom: 3 } });
