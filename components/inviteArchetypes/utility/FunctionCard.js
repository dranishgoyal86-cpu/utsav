import { Text, StyleSheet } from 'react-native';
import UtilityCardShell, { s as shellStyles } from './UtilityCardShell';

// Reads real event_functions rows (passed in as `functions`, already
// fetched by the caller via the canonical two-query pattern — this
// component makes no Supabase call of its own and stores nothing). Themed
// via `tokens`, same interaction pattern regardless of which archetype
// selected it.
export default function FunctionCard({ tokens, functions = [] }) {
  if (!functions.length) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="📅" title="Functions">
      {functions.map((f, i) => (
        <Text key={f.id || i} style={[s.row, { color: c?.dim || '#666' }]}>
          <Text style={{ color: c?.ink || '#1A1A1A', fontWeight: '700' }}>{f.name}</Text>
          {f.date ? `  ·  ${f.date}` : ''}{f.time ? `  ${f.time}` : ''}
        </Text>
      ))}
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({
  row: { fontSize: 12.5, marginBottom: 4, lineHeight: 18 },
});
