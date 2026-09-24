import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../../ThemeContext';
import { supabase } from '../../../supabase';
import { showAlert, confirmDestructive, uploadEventGalleryPhoto, getSignedEventGalleryUrl } from '../../../helpers';
import AppHeader from '../../../components/AppHeader';
import { Plus, Trash } from 'phosphor-react-native';

const { width } = Dimensions.get('window');
const TILE = (width - 40 - 16) / 3;

// Post-event private photo gallery (open-source scan item #7, from the
// small photographer-CRM repos found in the scan) — a provider's private
// handoff of final edited photos to the one host of THIS booking, instead
// of sending files over WhatsApp/Drive. Own private bucket (event_gallery)
// and table (event_gallery_photos) — completely separate from the public
// Cloudinary portfolio pipeline in PortfolioScreen.js, which is marketing
// photos for anyone browsing, not a private per-booking delivery.
//
// Registered as a Stage 3 module in EventDetail.js's MODULES list,
// unlocked after Documents — a natural "event's basically wrapped up, now
// hand over the final media" step.
export default function PhotoGallery({ route, navigation }) {
  const { workspace } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [providerId, setProviderId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { fetchPhotos(); }, []);

  async function fetchPhotos() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: provider } = await supabase.from('providers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (!provider) return;
      setProviderId(provider.id);

      const { data, error } = await supabase
        .from('event_gallery_photos')
        .select('id, storage_path, caption, created_at')
        .eq('booking_id', workspace.booking_id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const withUrls = await Promise.all((data || []).map(async p => ({
        ...p, signedUrl: await getSignedEventGalleryUrl(p.storage_path),
      })));
      setPhotos(withUrls);
    } catch (err) {
      console.log('Photo gallery fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!workspace.booking_id) {
      showAlert('No booking linked', "This workspace isn't linked to a specific booking, so there's nowhere to attach these photos.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showAlert('Permission needed', 'Allow photo library access to upload event photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType ? [ImagePicker.MediaType.Images] : ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      for (const asset of result.assets) {
        await uploadEventGalleryPhoto(asset.uri, providerId, workspace.booking_id);
      }
      await fetchPhotos();
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDelete(photo) {
    confirmDestructive('Remove this photo?', 'The host will no longer be able to see it.', async () => {
      await supabase.storage.from('event_gallery').remove([photo.storage_path]);
      await supabase.from('event_gallery_photos').delete().eq('id', photo.id);
      fetchPhotos();
    });
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Photo Gallery" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
          <Text style={s.hint}>
            Upload final edited photos here — only the host of this booking can see them, privately, instead of over WhatsApp or a shared drive link.
          </Text>
          {photos.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>No photos uploaded yet.</Text>
            </View>
          ) : (
            <View style={s.grid}>
              {photos.map(p => (
                <TouchableOpacity key={p.id} style={s.tile} onLongPress={() => handleDelete(p)}>
                  {p.signedUrl ? (
                    <Image source={{ uri: p.signedUrl }} style={s.tileImage} />
                  ) : (
                    <View style={[s.tileImage, s.tilePlaceholder]} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {photos.length > 0 && <Text style={s.deleteHint}>Long-press a photo to remove it.</Text>}
        </ScrollView>
      )}

      <TouchableOpacity style={s.fab} onPress={handleUpload} disabled={uploading}>
        {uploading ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Plus size={24} color={theme.btnPrimaryText} weight="bold" />}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function styles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    hint: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 17, marginBottom: 16 },
    emptyWrap: { alignItems: 'center', justifyContent: 'center', padding: 30 },
    emptyText: { fontSize: 13.5, color: theme.textSecondary, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: { width: TILE, height: TILE, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.cardBg },
    tileImage: { width: '100%', height: '100%' },
    tilePlaceholder: { backgroundColor: theme.border },
    deleteHint: { fontSize: 11, color: theme.textTertiary, textAlign: 'center', marginTop: 14 },
    fab: { position: 'absolute', right: 20, bottom: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: theme.btnPrimary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  });
}
