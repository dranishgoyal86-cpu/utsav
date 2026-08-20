import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';

// Defensive backstop for a screen reached via direct navigation/deep
// link/back-stack after its normal entry point was hidden because the
// capability resolver decided this event doesn't have it.
export default function CapabilityBlocked({ navigation }) {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 6, textAlign: 'center' }}>
        Not available for this event
      </Text>
      <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 19 }}>
        This tool doesn't apply to this event's type or setup.
      </Text>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.btnPrimary }}
      >
        <Text style={{ color: theme.btnPrimaryText, fontWeight: '700', fontSize: 13 }}>Go back</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
