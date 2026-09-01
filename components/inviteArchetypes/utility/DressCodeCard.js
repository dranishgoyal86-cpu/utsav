import { Text, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// dressCode: a plain guest-facing text field the caller reads from the
// event's own schema content (e.g. engagement/hindu-wedding schemas'
// dressCode field) — this component stores nothing and infers nothing; it
// only renders whatever the host actually wrote, or nothing at all.
export default function DressCodeCard({ tokens, dressCode }) {
  if (!dressCode) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="👗" title="Dress Code">
      <Text style={[s.note, { color: c?.ink || '#1A1A1A' }]}>{dressCode}</Text>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({ note: { fontSize: 12.5, lineHeight: 18 } });
