import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image, ActivityIndicator, Switch
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert, confirmDestructive } from '../../helpers';
import { deleteCloudinaryAsset } from '../../lib/cloudinaryDelete';
import { useEventContext } from '../../hooks/useEventContext';
import AppHeader from '../../components/AppHeader';

const { width } = require('react-native').Dimensions.get('window');
const IMG_SIZE = (width - 56) / 3;

export default function AlbumModeration({ route, navigation }) {
  const { eventId, isHost = false } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const { event } = useEventContext(eventId);

  const [photos, setPhotos] = useState([]);
  const [uploaderNames, setUploaderNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [guestCaptureEnabled, setGuestCaptureEnabled] = useState(true);
  const [viewerUserId, setViewerUserId] = useState(null);

  useEffect(() => { fetchPhotos(); fetchViewer(); }, []);
  useEffect(() => { if (event) setGuestCaptureEnabled(event.guest_capture_enabled !== false); }, [event]);

  async function fetchViewer() {
    const { data: { session } } = await supabase.auth.getSession();
    setViewerUserId(session?.user?.id || null);
  }

  async function fetchPhotos() {
    try {
      setLoading(true);
      let query = supabase.from('photos').select('*').eq('event_id', eventId).order('created_at', { ascending: false });
      if (!isHost) query = query.eq('is_hidden', false);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];
      setPhotos(rows);

      const uploaderIds = [...new Set(rows.map(p => p.uploaded_by).filter(Boolean))];
      if (uploaderIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, name').in('id', uploaderIds);
        const map = {};
        (users || []).forEach(u => { map[u.id] = u.name; });
        setUploaderNames(map);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function captionFor(photo) {
    if (photo.uploaded_by_name) return photo.uploaded_by_name;
    if (photo.uploaded_by && uploaderNames[photo.uploaded_by]) return uploaderNames[photo.uploaded_by];
    return 'Someone';
  }

  function isOwnPhoto(photo) {
    return !!viewerUserId && photo.uploaded_by === viewerUserId;
  }

  function toggleSelect(id) {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  }

  async function deletePhotos(ids) {
    setProcessing(true);
    try {
      const targets = photos.filter(p => ids.includes(p.id));
      for (const photo of targets) {
        // Cloudinary asset first — if this fails we still want the row gone
        // (a photo the host can no longer see beats an orphaned row they
        // can't act on), so a delete failure here is logged, not thrown.
        try {
          await deleteCloudinaryAsset(photo.cloudinary_public_id);
        } catch (err) {
          console.log('deleteCloudinaryAsset error:', err.message);
        }
        const { error } = await supabase.from('photos').delete().eq('id', photo.id);
        if (error) throw error;
      }
      setPhotos(prev => prev.filter(p => !ids.includes(p.id)));
      setSelectedIds([]);
      setSelectionMode(false);

      const { count } = await supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', eventId);
      await supabase.from('events').update({ total_photos: count ?? 0 }).eq('id', eventId);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function hidePhotos(ids) {
    setProcessing(true);
    try {
      const { error } = await supabase.from('photos').update({ is_hidden: true }).in('id', ids);
      if (error) throw error;
      setPhotos(prev => prev.filter(p => !ids.includes(p.id)));
      setSelectedIds([]);
      setSelectionMode(false);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setProcessing(false);
    }
  }

  function confirmBulkDelete() {
    confirmDestructive(
      `Delete ${selectedIds.length} photo${selectedIds.length > 1 ? 's' : ''}?`,
      'This removes them for everyone. This cannot be undone.',
      'Delete',
      () => deletePhotos(selectedIds)
    );
  }

  function confirmSingleDelete(photo) {
    confirmDestructive('Delete this photo?', 'This removes it for everyone. This cannot be undone.', 'Delete', () => deletePhotos([photo.id]));
  }

  async function toggleGuestCapture(value) {
    setGuestCaptureEnabled(value);
    try {
      const { error } = await supabase.from('events').update({ guest_capture_enabled: value }).eq('id', eventId);
      if (error) throw error;
    } catch (err) {
      setGuestCaptureEnabled(!value);
      showAlert('Error', err.message);
    }
  }

  const renderItem = useCallback(({ item }) => {
    const selected = selectedIds.includes(item.id);
    const canDeleteOwn = !isHost && isOwnPhoto(item);
    return (
      <TouchableOpacity
        style={s.cell}
        activeOpacity={0.85}
        onPress={() => (selectionMode ? toggleSelect(item.id) : null)}
        onLongPress={() => { if (isHost) { setSelectionMode(true); toggleSelect(item.id); } }}
      >
        <Image source={{ uri: item.cloudinary_url }} style={s.cellImg} />
        <View style={s.captionBar}>
          <Text style={s.captionText} numberOfLines={1}>{captionFor(item)}</Text>
        </View>
        {selectionMode && (
          <View style={[s.selectOverlay, selected && s.selectOverlayActive]}>
            {selected && <Text style={s.selectCheck}>✓</Text>}
          </View>
        )}
        {canDeleteOwn && !selectionMode && (
          <TouchableOpacity style={s.ownDeleteBtn} onPress={() => confirmSingleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 11, color: '#fff' }}>🗑</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode, selectedIds, uploaderNames, viewerUserId, isHost]);

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title={selectionMode ? `${selectedIds.length} selected` : 'Event photos'}
        onBack={() => {
          if (selectionMode) { setSelectionMode(false); setSelectedIds([]); }
          else navigation.goBack();
        }}
        theme={theme}
        navigation={navigation}
      />

      {isHost && !selectionMode && (
        <View style={s.hostBar}>
          <Text style={s.hostBarLabel}>Guest photo capture</Text>
          <Switch value={guestCaptureEnabled} onValueChange={toggleGuestCapture} trackColor={{ true: theme.accent }} />
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : photos.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 44 }}>📷</Text>
          <Text style={s.emptyTitle}>No photos yet</Text>
          <Text style={s.emptySub}>Photos taken with the event camera will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={item => item.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 4 }}
          contentContainerStyle={s.grid}
          renderItem={renderItem}
        />
      )}

      {isHost && selectionMode && selectedIds.length > 0 && (
        <View style={[s.bulkBar, { paddingBottom: 16 + insets.bottom }]}>
          <TouchableOpacity style={s.bulkBtn} onPress={() => hidePhotos(selectedIds)} disabled={processing}>
            <Text style={s.bulkBtnText}>Hide</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.bulkBtn, s.bulkBtnDanger]} onPress={confirmBulkDelete} disabled={processing}>
            {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[s.bulkBtnText, { color: '#fff' }]}>Delete</Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backBtn: { width: 30 },
    backIcon: { fontSize: 20, color: theme.text },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },

    hostBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    hostBarLabel: { fontSize: 13.5, fontWeight: '600', color: theme.text },

    grid: { padding: 4, paddingBottom: 90, gap: 4 },
    cell: { width: IMG_SIZE, height: IMG_SIZE, borderRadius: 8, overflow: 'hidden', position: 'relative' },
    cellImg: { width: '100%', height: '100%' },
    captionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 4 },
    captionText: { fontSize: 10.5, color: '#fff', fontWeight: '600' },
    selectOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    selectOverlayActive: { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: '#fff' },
    selectCheck: { fontSize: 22, color: '#fff', fontWeight: '700' },
    ownDeleteBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 30 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginTop: 6 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19 },

    bulkBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    bulkBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    bulkBtnDanger: { backgroundColor: '#F44336', borderColor: '#F44336' },
    bulkBtnText: { fontSize: 14, fontWeight: '700', color: theme.text },
  });
}
