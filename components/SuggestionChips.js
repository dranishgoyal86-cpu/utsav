import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../ThemeContext';

// Renders past values from useInputHistory above an input; tapping one
// fills the field. Renders nothing when there's no history yet.
export default function SuggestionChips({ suggestions, onSelect }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row} contentContainerStyle={{ gap: 8 }}>
      {suggestions.map(sug => (
        <TouchableOpacity key={sug} style={s.chip} onPress={() => onSelect(sug)}>
          <Text style={s.chipText}>{sug}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    row: { marginBottom: 10 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: theme.pillBg },
    chipText: { fontSize: 12.5, fontWeight: '500', color: theme.pillText },
  });
}
