import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, FlatList } from 'react-native';
import { useTheme } from '../ThemeContext';
import { useUploadQueue } from '../hooks/useUploadQueue';

// Small pill showing upload-queue state — hidden entirely when there's
// nothing pending/uploading/failed. scopeEventId narrows the count to one
// event's photos (used in CameraCapture.js's header); omit it for a
// global view (used in the album header). `light` renders white-on-dark
// text/spinner for use over a camera preview instead of theme colors.
export default function SyncIndicator({ scopeEventId, light }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { stats: globalStats, entries, retryFailed } = useUploadQueue();
  const [sheetOpen, setSheetOpen] = useState(false);

  const scoped = scopeEventId
    ? entries.filter(e => e.eventId === scopeEventId)
    : entries;
  const stats = scopeEventId
    ? scoped.reduce((acc, e) => {
        if (e.status === 'pending') acc.pending++;
        else if (e.status === 'done') acc.done++;
        else if (e.status === 'failed') acc.failed++;
        else acc.uploading++;
        return acc;
      }, { pending: 0, uploading: 0, done: 0, failed: 0 })
    : globalStats;

  const inFlight = stats.pending + stats.uploading;
  const failedEntries = scoped.filter(e => e.status === 'failed');

  if (inFlight === 0 && stats.failed === 0) return null;

  const textColor = light ? '#fff' : (stats.failed > 0 ? '#F44336' : theme.textSecondary);

  return (
    <>
      <TouchableOpacity
        style={[s.pill, light && s.pillLight]}
        onPress={() => { if (stats.failed > 0) setSheetOpen(true); }}
        disabled={stats.failed === 0}
      >
        {stats.failed > 0 ? (
          <Text style={[s.pillText, { color: textColor }]}>{stats.failed} failed — tap to retry</Text>
        ) : (
          <>
            <ActivityIndicator size="small" color={textColor} />
            <Text style={[s.pillText, { color: textColor }]}>{inFlight} uploading</Text>
          </>
        )}
      </TouchableOpacity>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Couldn't upload ({failedEntries.length})</Text>
              <TouchableOpacity onPress={() => setSheetOpen(false)}>
                <Text style={s.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={failedEntries}
              keyExtractor={item => item.clientRef}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <View style={s.failRow}>
                  <Text style={s.failDate}>{new Date(item.capturedAt).toLocaleString('en-IN')}</Text>
                  <Text style={s.failError} numberOfLines={2}>{item.lastError || 'Unknown error'}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={s.emptyText}>Nothing failed right now.</Text>}
            />
            <TouchableOpacity
              style={s.retryBtn}
              onPress={() => { retryFailed(); setSheetOpen(false); }}
            >
              <Text style={s.retryBtnText}>Retry all</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
      backgroundColor: theme.bgTertiary,
    },
    pillLight: { backgroundColor: 'rgba(0,0,0,0.4)' },
    pillText: { fontSize: 11, fontWeight: '700' },

    overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.cardBg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 30 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    sheetClose: { fontSize: 16, color: theme.textTertiary, padding: 4 },

    failRow: { paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: theme.border },
    failDate: { fontSize: 11.5, color: theme.textTertiary, marginBottom: 3 },
    failError: { fontSize: 13, color: theme.text },
    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingVertical: 20 },

    retryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
    retryBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
  });
}
