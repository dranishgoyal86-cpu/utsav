import { View, Text, StyleSheet } from 'react-native';

// Shared shell every utility card (Function/Map/RSVP/Travel/Stay/...)
// renders through — this is the concrete mechanism behind the brief's
// "do not redesign RSVP differently for every archetype" rule: a card's
// BORDER/ACCENT/TEXT COLOUR inherits from the selected archetype's tokens
// (passed in as `tokens`), but its layout/interaction pattern is fixed
// here, identical across every archetype. A new archetype gets themed
// utility cards for free just by having tokens; it never gets to redesign
// what a FunctionCard IS.
export default function UtilityCardShell({ tokens, icon, title, children }) {
  const c = tokens?.colors || { bg: '#FFFFFF', ink: '#1A1A1A', accent: '#E8A020', line: '#EEEEEE', dim: '#888888' };
  return (
    <View style={[s.card, { borderColor: c.line, backgroundColor: c.bg === '#FFFFFF' ? '#FAFAFA' : `${c.bg}0D` }]}>
      <View style={s.header}>
        {icon ? <Text style={s.icon}>{icon}</Text> : null}
        <Text style={[s.title, { color: c.ink }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  icon: { fontSize: 16 },
  title: { fontSize: 13, fontWeight: '700' },
});
