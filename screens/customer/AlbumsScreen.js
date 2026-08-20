import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, TextInput, Modal, ActivityIndicator, Dimensions, RefreshControl, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { Plus, FolderOpen, X, Check, Users, Trash } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { createRekognitionCollection, showAlert, confirmDestructive } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { AWS_CONFIG } from '../../config';

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 48) / 2;

export default function AlbumsScreen({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [albumName, setAlbumName] = useState('');
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState(null);
  const [faceMatching, setFaceMatching] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        fetchAlbums(data.user.id);
      }
    });
  }, []);

  async function fetchAlbums(uid) {
    try {
      const { data: owned, error: e1 } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      const { data: shared, error: e2 } = await supabase
        .from('album_shares')
        .select('album_id')
        .eq('shared_with', uid);

      let sharedAlbums = [];
      if (shared && shared.length > 0) {
        const ids = shared.map(s => s.album_id);
        const { data: sa } = await supabase
          .from('albums')
          .select('*')
          .in('id', ids);
        sharedAlbums = sa || [];
      }

      const all = [...(owned || []), ...sharedAlbums];
      // deduplicate
      const unique = all.filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i);
      setAlbums(unique);
    } catch (err) {
      console.log('fetchAlbums error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (userId) fetchAlbums(userId);
  }, [userId]);

  async function createAlbum() {
    if (!albumName.trim()) {
      showAlert('Name required', 'Please enter an album name.');
      return;
    }
    setCreating(true);
    try {
      let eventId = null;

      // Face-matching needs a paired `events` row — it's what carries the
      // invite code and Rekognition collection that FaceScan/GuestAccess
      // already know how to use. Untouched, existing machinery.
      if (faceMatching) {
        const inviteCode = generateInviteCode();
        const collectionId = `${AWS_CONFIG.collectionPrefix}${inviteCode}`;
        await createRekognitionCollection(collectionId);

        const { data: event, error: eventError } = await supabase
          .from('events')
          .insert({
            host_id: userId,
            name: albumName.trim(),
            event_date: new Date().toISOString().split('T')[0],
            city: '',
            invite_code: inviteCode,
            rekognition_collection_id: collectionId,
          })
          .select()
          .single();
        if (eventError) throw eventError;
        eventId = event.id;
      }

      const { data, error } = await supabase
        .from('albums')
        .insert({ user_id: userId, name: albumName.trim(), event_id: eventId })
        .select()
        .single();

      if (error) throw error;
      setAlbums(prev => [data, ...prev]);
      setAlbumName('');
      setFaceMatching(false);
      setModalVisible(false);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setCreating(false);
    }
  }

  // A grid of photo cards doesn't suit swipe-to-delete the way a linear list
  // does (ambiguous horizontal drag direction, cramped card width) — a
  // corner delete icon is the equivalent, discoverable affordance for a
  // grid, same as Google Photos/Instagram-style apps use. Cascades to the
  // album's own media/shares rows; deliberately leaves a paired `events` row
  // (face-matching) alone — that guest list/event isn't the album's to
  // delete, just warns about it in the confirm message.
  async function deleteAlbum(album) {
    const hasFaceMatching = !!album.event_id;
    confirmDestructive(
      'Delete this album?',
      `"${album.name}" and all its photos will be permanently deleted.${hasFaceMatching ? ' Guest face-matching for this album will stop working (the event itself is not deleted).' : ''} This can\'t be undone.`,
      'Delete',
      async () => {
        try {
          await Promise.all([
            supabase.from('album_media').delete().eq('album_id', album.id),
            supabase.from('album_shares').delete().eq('album_id', album.id),
          ]);
          const { error } = await supabase.from('albums').delete().eq('id', album.id);
          if (error) throw error;
          setAlbums(prev => prev.filter(a => a.id !== album.id));
        } catch (err) {
          showAlert('Error', err.message);
        }
      }
    );
  }

  function renderAlbum({ item }) {
    const isOwner = item.user_id === userId;
    return (
      <View style={s.card}>
        <TouchableOpacity
          onPress={() => navigation.navigate('AlbumDetail', { album: item, userId })}
          activeOpacity={0.8}
        >
          {item.cover_url ? (
            <Image source={{ uri: item.cover_url }} style={s.cardImage} />
          ) : (
            <View style={s.cardPlaceholder}>
              <FolderOpen size={36} color={theme.accent} />
            </View>
          )}
          <View style={s.cardFooter}>
            <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
          </View>
        </TouchableOpacity>
        {isOwner && (
          <TouchableOpacity
            style={s.cardDeleteBtn}
            onPress={() => deleteAlbum(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Trash size={14} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title="Albums"
        large
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="add" style={s.addBtn} onPress={() => setModalVisible(true)}>
            <Plus size={20} color={theme.bg} />
          </TouchableOpacity>,
        ]}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : albums.length === 0 ? (
        <View style={s.empty}>
          <FolderOpen size={56} color={theme.border} />
          <Text style={s.emptyTitle}>No albums yet</Text>
          <Text style={s.emptySubtitle}>Tap + to create your first album</Text>
        </View>
      ) : (
        <FlatList
          data={albums}
          keyExtractor={item => item.id}
          renderItem={renderAlbum}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={s.grid}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        />
      )}

      {/* Create Album Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setModalVisible(false); setAlbumName(''); setFaceMatching(false); }}
      >
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Album</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setAlbumName(''); setFaceMatching(false); }}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.input}
              placeholder="Album name"
              placeholderTextColor={theme.subtext}
              value={albumName}
              onChangeText={setAlbumName}
              autoFocus
            />
            <TouchableOpacity
              style={[s.faceMatchRow, faceMatching && s.faceMatchRowActive]}
              onPress={() => setFaceMatching(v => !v)}
            >
              <Users size={18} color={faceMatching ? theme.accent : theme.subtext} />
              <View style={{ flex: 1 }}>
                <Text style={[s.faceMatchTitle, faceMatching && { color: theme.accent }]}>
                  Enable guest face-matching
                </Text>
                <Text style={s.faceMatchSub}>
                  Get an invite code so guests can scan their face and find their own photos
                </Text>
              </View>
              <View style={[s.checkbox, faceMatching && s.checkboxActive]}>
                {faceMatching && <Check size={13} color={theme.bg} />}
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.createBtn} onPress={createAlbum} disabled={creating}>
              {creating ? (
                <ActivityIndicator size="small" color={theme.bg} />
              ) : (
                <Text style={s.createBtnText}>Create Album</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: theme.text },
  addBtn: {
    backgroundColor: theme.accent, borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  grid: { padding: 16, gap: 12 },
  card: {
    width: CARD_SIZE, borderRadius: 14, overflow: 'hidden',
    backgroundColor: theme.card, borderWidth: 0.5, borderColor: theme.border,
  },
  cardDeleteBtn: {
    position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center',
  },
  cardImage: { width: CARD_SIZE, height: CARD_SIZE * 0.8, resizeMode: 'cover' },
  cardPlaceholder: {
    width: CARD_SIZE, height: CARD_SIZE * 0.8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: theme.inputBg,
  },
  cardFooter: { padding: 10 },
  cardName: { fontSize: 13, fontWeight: '600', color: theme.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: theme.subtext },
  overlay: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center' },
  modal: {
    backgroundColor: theme.card, borderRadius: 18, padding: 24,
    width: width - 48, gap: 16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  input: {
    backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 12, fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  createBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  createBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  faceMatchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.inputBg, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  faceMatchRowActive: { borderColor: theme.accent, backgroundColor: theme.accent + '11' },
  faceMatchTitle: { fontSize: 13, fontWeight: '700', color: theme.text },
  faceMatchSub: { fontSize: 11, color: theme.subtext, marginTop: 2, lineHeight: 15 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: theme.accent, borderColor: theme.accent },
});