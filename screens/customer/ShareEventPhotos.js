import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image, ActivityIndicator, Alert, Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../supabase';
import { uploadToCloudinary } from '../../helpers';
import { useTheme } from '../../ThemeContext';
import AppHeader from '../../components/AppHeader';

export default function ShareEventPhotos({ route, navigation }) {
  const { booking } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [customerId, setCustomerId] = useState(null);

  useEffect(() => { fetchShared(); }, []);

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function fetchShared() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setCustomerId(session.user.id);
      const { data, error } = await supabase
        .from('verified_event_photos')
        .select('*')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPhotos(data || []);
    } catch (err) {
      console.log('ShareEventPhotos fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function pickAndUpload() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType ? [ImagePicker.MediaType.Images] : ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;

    try {
      setUploading(true);
      const rows = [];
      for (let i = 0; i < result.assets.length; i++) {
        setUploadProgress(Math.round(((i + 1) / result.assets.length) * 100));
        const { url, publicId } = await uploadToCloudinary(result.assets[i].uri);
        rows.push({
          provider_id: booking.provider_id,
          booking_id: booking.id,
          customer_id: customerId,
          photo_url: url,
          cloudinary_public_id: publicId || null,
        });
      }
      const { data, error } = await supabase.from('verified_event_photos').insert(rows).select();
      if (error) throw error;
      setPhotos(prev => [...(data || []), ...prev]);
      showAlert(
        'Shared! ✓',
        `${rows.length} photo${rows.length > 1 ? 's' : ''} added to ${booking.providerName}'s verified event photos — real proof of the work they did for you.`
      );
    } catch (err) {
      console.log('Share upload error:', err.message);
      showAlert('Upload failed', err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function removePhoto(photo) {
    const doRemove = async () => {
      await supabase.from('verified_event_photos').delete().eq('id', photo.id);
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Remove this photo from the vendor\'s verified event photos?')) doRemove();
    } else {
      Alert.alert('Remove photo?', "Remove this photo from the vendor's verified event photos?", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Share event photos" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={s.introCard}>
        <Text style={s.introTitle}>✓ Real proof, not marketing photos</Text>
        <Text style={s.introText}>
          Photos you share here get tagged "Verified event photo" on {booking.providerName}'s profile — proof they actually did this work, backed by your real booking.
        </Text>
      </View>

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={item => item.id}
          numColumns={3}
          contentContainerStyle={s.grid}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.photoCell} onLongPress={() => removePhoto(item)}>
              <Image source={{ uri: item.photo_url }} style={s.photo} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>📸</Text>
              <Text style={s.emptyTitle}>No photos shared yet</Text>
              <Text style={s.emptySub}>Add photos from this event to give {booking.providerName} verified proof of their work.</Text>
            </View>
          }
        />
      )}

      <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity
          style={[s.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={pickAndUpload}
          disabled={uploading}
        >
          {uploading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={theme.btnPrimaryText} size="small" />
              <Text style={s.uploadBtnText}>Uploading {uploadProgress}%</Text>
            </View>
          ) : (
            <Text style={s.uploadBtnText}>+ Add photos</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },

    introCard: { margin: 16, padding: 15, backgroundColor: '#E8F5E9', borderRadius: 16 },
    introTitle: { fontSize: 13.5, fontWeight: '700', color: '#2E7D32', marginBottom: 5 },
    introText: { fontSize: 12, color: '#2E7D32', lineHeight: 18 },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    grid: { paddingHorizontal: 13, paddingBottom: 120 },
    photoCell: { width: '33%', aspectRatio: 1, padding: 3 },
    photo: { width: '100%', height: '100%', borderRadius: 12 },

    emptyBox: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
    emptyIcon: { fontSize: 44, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 8 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19 },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    uploadBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
    uploadBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
  });
}
