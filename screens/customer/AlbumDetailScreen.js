import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, Dimensions, Modal, TextInput, RefreshControl, ScrollView, Share, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import {
  ArrowLeft, Plus, ShareNetwork, Trash, X, UserPlus, Check, Users, Copy, Camera, SlidersHorizontal
} from 'phosphor-react-native';
import { createRekognitionCollection, uploadToCloudinary, indexFaceInCollection, showAlert, confirmDestructive } from '../../helpers';
import { AWS_CONFIG } from '../../config';
import SwipeableRow from '../../components/SwipeableRow';
import SyncIndicator from '../../components/SyncIndicator';
import { enqueue, drain } from '../../lib/uploadQueue';
import AppHeader from '../../components/AppHeader';

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const { width } = Dimensions.get('window');
const IMG_SIZE = (width - 52) / 3;

export default function AlbumDetailScreen({ route, navigation }) {
  const { album, userId } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharing, setSharing] = useState(false);
  const [sharedWith, setSharedWith] = useState([]);
  const [event, setEvent] = useState(null);
  const [enablingFaceMatch, setEnablingFaceMatch] = useState(false);
  const isOwner = album.user_id === userId;

  useEffect(() => {
    fetchMedia();
    if (isOwner) fetchSharedWith();
    if (album.event_id) fetchEvent();
  }, []);

  async function fetchEvent() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('id', album.event_id)
      .maybeSingle();
    setEvent(data || null);
  }

  async function enableFaceMatching() {
    setEnablingFaceMatch(true);
    try {
      const inviteCode = generateInviteCode();
      const collectionId = `${AWS_CONFIG.collectionPrefix}${inviteCode}`;
      await createRekognitionCollection(collectionId);

      // Albums created from the Plan flow (or GuestList's "New guest list")
      // already have event_id pointing at a real (Rekognition-less) event —
      // attach face-matching to that existing row instead of inserting a
      // second, orphaned one. Only albums with no linked event yet (created
      // directly from the Albums tab) still need a fresh events row.
      let newEvent;
      if (album.event_id) {
        const { data: updatedEvent, error: eventError } = await supabase
          .from('events')
          .update({ invite_code: inviteCode, rekognition_collection_id: collectionId })
          .eq('id', album.event_id)
          .select()
          .single();
        if (eventError) throw eventError;
        newEvent = updatedEvent;
      } else {
        const { data: insertedEvent, error: eventError } = await supabase
          .from('events')
          .insert({
            host_id: userId,
            name: album.name,
            event_date: new Date().toISOString().split('T')[0],
            city: '',
            invite_code: inviteCode,
            rekognition_collection_id: collectionId,
          })
          .select()
          .single();
        if (eventError) throw eventError;
        newEvent = insertedEvent;

        const { error: albumError } = await supabase
          .from('albums')
          .update({ event_id: newEvent.id })
          .eq('id', album.id);
        if (albumError) throw albumError;

        album.event_id = newEvent.id;
      }

      setEvent(newEvent);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setEnablingFaceMatch(false);
    }
  }

  function shareInviteCode() {
    Share.share({
      message: `Join "${album.name}" on Utsav! Use invite code ${event.invite_code} in the app to find your photos with face recognition.`,
    }).catch(() => {});
  }

  async function fetchMedia() {
    try {
      const { data, error } = await supabase
        .from('album_media')
        .select('*')
        .eq('album_id', album.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMedia(data || []);
    } catch (err) {
      console.log('fetchMedia error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchSharedWith() {
    try {
      const { data: shares } = await supabase
        .from('album_shares')
        .select('shared_with')
        .eq('album_id', album.id);

      if (shares && shares.length > 0) {
        const ids = shares.map(s => s.shared_with);
        const { data: users } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', ids);
        setSharedWith(users || []);
      }
    } catch (err) {
      console.log('fetchSharedWith error:', err.message);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMedia();
  }, []);

  async function pickAndUpload() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (result.canceled) return;
    setUploading(true);

    try {
      for (const asset of result.assets) {
        const isVideo = asset.type === 'video';
        const ext = asset.uri.split('.').pop();
        const fileName = `${userId}/${album.id}/${Date.now()}.${ext}`;

        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('album-media')
          .upload(fileName, decode(base64), {
            contentType: isVideo ? 'video/mp4' : 'image/jpeg',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('album-media')
          .getPublicUrl(fileName);

        await supabase.from('album_media').insert({
          album_id: album.id,
          user_id: userId,
          media_url: publicUrl,
          media_type: isVideo ? 'video' : 'photo',
        });

        // Set cover if first media
        if (media.length === 0 && !isVideo) {
          await supabase.from('albums').update({ cover_url: publicUrl }).eq('id', album.id);
        }

        // Face-matching is enabled for this album — also queue the photo for
        // the Cloudinary + Rekognition pipeline so guests can find it via
        // FaceScan. Routed through the offline-first upload queue (same as
        // camera capture) instead of uploading inline here, so a gallery
        // pick on a weak signal gets the same retry/resilience camera
        // capture gets — it used to fail this whole loop iteration silently
        // on a dropped connection.
        if (event && !isVideo) {
          await enqueue({ eventId: event.id, localUri: asset.uri, uploaderId: userId, uploaderName: null, source: 'gallery' });
        }
      }

      if (event) {
        drain();
      }

      fetchMedia();
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteMedia(item) {
    confirmDestructive('Delete', 'Remove this from the album?', 'Delete', async () => {
      await supabase.from('album_media').delete().eq('id', item.id);
      setMedia(prev => prev.filter(m => m.id !== item.id));
    });
  }

  async function shareWithUser() {
    if (!shareEmail.trim()) return;
    setSharing(true);
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('email', shareEmail.trim().toLowerCase())
        .single();

      if (error || !users) {
        showAlert('User not found', 'No Utsav account found with that email.');
        return;
      }

      if (users.id === userId) {
        showAlert('Oops', "You can't share an album with yourself.");
        return;
      }

      const { error: shareError } = await supabase
        .from('album_shares')
        .insert({ album_id: album.id, shared_with: users.id });

      if (shareError && shareError.code === '23505') {
        showAlert('Already shared', `Album already shared with ${users.name}.`);
        return;
      }

      setSharedWith(prev => [...prev, users]);
      setShareEmail('');
      showAlert('Shared!', `Album shared with ${users.name}.`);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSharing(false);
    }
  }

  async function removeShare(shareUserId) {
    await supabase
      .from('album_shares')
      .delete()
      .eq('album_id', album.id)
      .eq('shared_with', shareUserId);
    setSharedWith(prev => prev.filter(u => u.id !== shareUserId));
  }

  function confirmRemoveShare(user) {
    confirmDestructive(
      'Remove access?',
      `${user.name} will no longer be able to view "${album.name}".`,
      'Remove',
      () => removeShare(user.id)
    );
  }

  function renderMedia({ item }) {
    return (
      <View style={s.mediaItem}>
        <Image source={{ uri: item.media_url }} style={s.mediaImg} />
        {item.media_type === 'video' && (
          <View style={s.videoBadge}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>▶</Text>
          </View>
        )}
        {isOwner && (
          <TouchableOpacity
            style={s.mediaDeleteBtn}
            onPress={() => deleteMedia(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Trash size={12} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title={album.name}
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <SyncIndicator key="sync" />,
          ...(isOwner && event ? [
            <TouchableOpacity key="moderate" onPress={() => navigation.navigate('AlbumModeration', { eventId: event.id, isHost: true })} style={s.iconBtn}>
              <SlidersHorizontal size={20} color={theme.text} />
            </TouchableOpacity>,
          ] : []),
          ...(isOwner ? [
            <TouchableOpacity key="share" onPress={() => setShareModal(true)} style={s.iconBtn}>
              <UserPlus size={20} color={theme.text} />
            </TouchableOpacity>,
          ] : []),
          ...(event ? [
            <TouchableOpacity
              key="camera"
              onPress={() => navigation.navigate('CameraCapture', { eventId: event.id })}
              style={s.iconBtn}
            >
              <Camera size={20} color={theme.text} />
            </TouchableOpacity>,
          ] : []),
          <TouchableOpacity key="upload" onPress={pickAndUpload} style={s.iconBtn} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Plus size={20} color={theme.text} />
            )}
          </TouchableOpacity>,
        ]}
      />

      {event?.rekognition_collection_id ? (
        <View style={s.faceMatchCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.faceMatchCardTitle}>🤳 Guest face-matching is on</Text>
            <View style={s.inviteCodeRow}>
              <Text style={s.inviteCodeLabel}>Code:</Text>
              <Text style={s.inviteCode}>{event.invite_code}</Text>
            </View>
          </View>
          <TouchableOpacity style={s.faceMatchBtn} onPress={shareInviteCode}>
            <ShareNetwork size={15} color={theme.text} />
            <Text style={s.faceMatchBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.faceMatchBtn} onPress={() => navigation.navigate('GuestList', { event })}>
            <Users size={15} color={theme.text} />
            <Text style={s.faceMatchBtnText}>Guests</Text>
          </TouchableOpacity>
        </View>
      ) : isOwner ? (
        <TouchableOpacity
          style={s.enableFaceMatchCard}
          onPress={enableFaceMatching}
          disabled={enablingFaceMatch}
        >
          <Users size={18} color={theme.accent} />
          <Text style={s.enableFaceMatchText}>
            {enablingFaceMatch ? 'Enabling…' : 'Enable guest face-matching for this album'}
          </Text>
          {enablingFaceMatch && <ActivityIndicator size="small" color={theme.accent} />}
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : media.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 48 }}>📷</Text>
          <Text style={s.emptyTitle}>No media yet</Text>
          <Text style={s.emptySubtitle}>Tap + to add photos or videos</Text>
        </View>
      ) : (
        <FlatList
          data={media}
          keyExtractor={item => item.id}
          renderItem={renderMedia}
          numColumns={3}
          columnWrapperStyle={{ gap: 4 }}
          contentContainerStyle={s.grid}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        />
      )}

      {/* Share Modal */}
      <Modal visible={shareModal} transparent animationType="slide" onRequestClose={() => setShareModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Share Album</Text>
              <TouchableOpacity onPress={() => setShareModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={s.shareRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Enter email address"
                placeholderTextColor={theme.subtext}
                value={shareEmail}
                onChangeText={setShareEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity style={s.shareBtn} onPress={shareWithUser} disabled={sharing}>
                {sharing ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Check size={18} color={theme.bg} />
                )}
              </TouchableOpacity>
            </View>

            {sharedWith.length > 0 && (
              <>
                <Text style={s.sharedLabel}>Shared with</Text>
                {sharedWith.map(u => (
                  <SwipeableRow key={u.id} onDelete={() => confirmRemoveShare(u)}>
                    <View style={s.sharedUser}>
                      <Text style={s.sharedName}>{u.name}</Text>
                      <Text style={s.sharedEmail}>{u.email}</Text>
                    </View>
                  </SwipeableRow>
                ))}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: theme.border, gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: theme.text },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.inputBg,
    alignItems: 'center', justifyContent: 'center',
  },
  faceMatchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 14, padding: 12,
    backgroundColor: theme.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: theme.border,
  },
  faceMatchCardTitle: { fontSize: 13, fontWeight: '700', color: theme.text },
  inviteCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  inviteCodeLabel: { fontSize: 12, color: theme.subtext },
  inviteCode: { fontSize: 13, fontWeight: '700', color: theme.accent, letterSpacing: 1 },
  faceMatchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.inputBg, borderWidth: 0.5, borderColor: theme.border,
  },
  faceMatchBtnText: { fontSize: 12, fontWeight: '600', color: theme.text },
  enableFaceMatchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 14, padding: 14,
    backgroundColor: theme.accent + '11', borderRadius: 14,
    borderWidth: 1, borderColor: theme.accent + '55', borderStyle: 'dashed',
  },
  enableFaceMatchText: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.accent },
  grid: { padding: 4, gap: 4 },
  mediaItem: { width: IMG_SIZE, height: IMG_SIZE, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  mediaImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  mediaDeleteBtn: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: '#00000099', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: theme.subtext },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  shareRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    backgroundColor: theme.inputBg, borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 12, fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  shareBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  sharedLabel: { fontSize: 13, fontWeight: '600', color: theme.subtext, marginTop: 4 },
  sharedUser: {
    paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  sharedName: { fontSize: 14, fontWeight: '600', color: theme.text },
  sharedEmail: { fontSize: 12, color: theme.subtext },
});