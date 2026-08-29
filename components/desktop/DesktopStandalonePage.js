import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { MAROON, TEXT, CREAM } from '../../lib/desktopTheme';

// Batch C/D: shared scaffold for the "drill-in" screens that have no
// natural persistent sidebar context -- not an event workspace
// (DesktopEventShell), not a CustomerTabs root (CustomerDesktopSidebar).
// Same standalone centered/wide treatment AlbumDetailScreen.js/
// AlbumModeration.js already established in Batch B, factored out here
// since a dozen-plus screens share the identical page chrome (back link +
// title + centered column) -- copy-pasting that boilerplate a dozen times
// would be exactly the kind of drift this project's own colour-sourcing
// rule already exists to prevent, just for layout instead of colour.
export default function DesktopStandalonePage({ onBack, backLabel = 'Back', title, right, maxWidth = 1000, children }) {
  return (
    <View style={s.page}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { maxWidth }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            {onBack && (
              <TouchableOpacity onPress={onBack}>
                <Text style={s.backLink}>← {backLabel}</Text>
              </TouchableOpacity>
            )}
            {title ? <Text style={s.title}>{title}</Text> : null}
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 32, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  backLink: { fontSize: 12.5, fontWeight: '600', color: MAROON, marginBottom: 6 },
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT },
});
