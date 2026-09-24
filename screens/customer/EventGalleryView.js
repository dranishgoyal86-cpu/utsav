import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { getSignedEventGalleryUrl } from '../../helpers';
import AppHeader from '../../components/AppHeader';

const { width } = Dimensions.get('window');
const TILE = (width - 40 - 16) / 3;

// Customer-side viewer for the provider's private post-event photo
// gallery (open-source scan item #7, Anish, Sept 24) — read-only, just
// shows what the provider (screens/provider/modules/PhotoGallery.js)
// uploaded for this booking. RLS on event_gallery_photos/the storage
// bucket already restricts this to only the host of that booking, so no
// extra access check is needed here beyond the normal query.
export default function EventGalleryView({ route, navigation }) {
  const { booking } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPhotos(); }, []);

  async function fetchPhotos() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('event_gallery_photos')
        .select('id, storage_path, caption, created_at')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const withUrls = await Promise.all((data || []).map(async p => ({
        ...p, signedUrl: await getSignedEventGalleryUrl(p.storage_path),
      })));
      setPhotos(withUrls);
    } catch (err) {
      console.log('Event gallery view error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Photos from provider" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : photos.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>No photos uploaded yet. Your provider hasn't shared any photos for this booking — check back after the event.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={s.grid}>
            {photos.map(p => (
              <View key={p.id} style={s.tile}>
                {p.signedUrl ? (
                  <Image source={{ uri: p.signedUrl }} style={s.tileImage} />
                ) : (
                  <View style={[s.tileImage, s.tilePlaceholder]} />
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function styles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    emptyText: { fontSize: 13.5, color: theme.textSecondary, textAlign: 'center', lineHeight: 19 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: { width: TILE, height: TILE, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.cardBg },
    tileImage: { width: '100%', height: '100%' },
    tilePlaceholder: { backgroundColor: theme.border },
  });
}
