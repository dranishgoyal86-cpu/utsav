import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image, ActivityIndicator, Alert, Platform, Modal
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../supabase';
import { uploadToCloudinary } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { useTheme } from '../../ThemeContext';
import { useProviderCapabilities } from '../../hooks/useProviderCapabilities';

const DEFAULT_SLOT_LIMIT = 20;

export default function PortfolioScreen({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [providerId, setProviderId] = useState(null);
  const [providerCategory, setProviderCategory] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [verifiedPhotos, setVerifiedPhotos] = useState([]);

  const providerCapabilities = useProviderCapabilities({ category: providerCategory });
  const slotLimit = providerCapabilities.byKey.portfolio_slots_extended?.config_value ?? DEFAULT_SLOT_LIMIT;

  useEffect(() => { fetchPortfolio(); }, []);

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function fetchPortfolio() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: provider } = await supabase
        .from('providers')
        .select('id, portfolio_photos, category')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!provider) return;
      setProviderId(provider.id);
      setProviderCategory(provider.category || null);
      setPhotos(provider.portfolio_photos || []);

      // Verified event photos — customer-shared proof of real completed
      // bookings, kept separate from the freely-uploaded grid above. Two
      // queries, no join: fetch the photos, then the bookings for context.
      const { data: verifiedData } = await supabase
        .from('verified_event_photos')
        .select('*')
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false });
      if (verifiedData?.length) {
        const bookingIds = [...new Set(verifiedData.map(p => p.booking_id).filter(Boolean))];
        const { data: bookingsData } = await supabase
          .from('bookings').select('id, event_type, event_date').in('id', bookingIds);
        setVerifiedPhotos(verifiedData.map(p => ({
          ...p,
          booking: bookingsData?.find(b => b.id === p.booking_id) || null,
        })));
      } else {
        setVerifiedPhotos([]);
      }
    } catch (err) {
      console.log('Portfolio error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePickPhotos() {
    setShowUploadMenu(false);
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
    if (photos.length + result.assets.length > slotLimit) {
      showAlert('Too many photos', `You can upload a maximum of ${slotLimit} portfolio photos.`);
      return;
    }
    await uploadPhotos(result.assets);
  }

  async function handleTakePhoto() {
    setShowUploadMenu(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission needed', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return;
    await uploadPhotos(result.assets);
  }

  async function uploadPhotos(assets) {
    try {
      setUploading(true);
      const newUrls = [];
      for (let i = 0; i < assets.length; i++) {
        setUploadProgress(Math.round(((i + 1) / assets.length) * 100));
        const { url } = await uploadToCloudinary(assets[i].uri);
        newUrls.push(url);
      }
      const updatedPhotos = [...photos, ...newUrls];
      const { error } = await supabase
        .from('providers')
        .update({
          portfolio_photos: updatedPhotos,
          portfolio_count: updatedPhotos.length,
        })
        .eq('id', providerId);
      if (error) throw error;
      setPhotos(updatedPhotos);
      showAlert(
        'Uploaded! 📸',
        `${assets.length} photo${assets.length > 1 ? 's' : ''} added to your portfolio.`
      );
    } catch (err) {
      console.log('Portfolio upload error:', err.message);
      showAlert('Upload failed', err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function toggleSelection(url) {
    setSelectedPhotos(prev =>
      prev.includes(url) ? prev.filter(p => p !== url) : [...prev, url]
    );
  }

  function deleteSelected() {
    const doDelete = async () => {
      const updatedPhotos = photos.filter(p => !selectedPhotos.includes(p));
      const { error } = await supabase
        .from('providers')
        .update({
          portfolio_photos: updatedPhotos,
          portfolio_count: updatedPhotos.length,
        })
        .eq('id', providerId);
      if (!error) {
        setPhotos(updatedPhotos);
        setSelectedPhotos([]);
        setSelectionMode(false);
      }
    };

    const msg = `Delete ${selectedPhotos.length} photo${selectedPhotos.length > 1 ? 's' : ''}? This cannot be undone.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doDelete();
    } else {
      Alert.alert(
        `Delete ${selectedPhotos.length} photo${selectedPhotos.length > 1 ? 's' : ''}?`,
        'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete }
        ]
      );
    }
  }

  function showUploadOptions() {
    if (Platform.OS === 'web') {
      // Alert.alert with 3 custom actions is unreliable on web — use an
      // inline modal menu instead so both options stay reachable.
      setShowUploadMenu(true);
    } else {
      Alert.alert(
        'Add photos',
        'Choose how to add photos to your portfolio',
        [
          { text: 'Choose from gallery', onPress: handlePickPhotos },
          { text: 'Take a photo', onPress: handleTakePhoto },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title={selectionMode ? `${selectedPhotos.length} selected` : `Portfolio (${photos.length}/${slotLimit})`}
        onBack={() => {
          if (selectionMode) {
            setSelectionMode(false);
            setSelectedPhotos([]);
          } else {
            navigation.goBack();
          }
        }}
        theme={theme}
        navigation={navigation}
        rightActions={[
          selectionMode ? (
            <TouchableOpacity key="delete" style={s.deleteBtn} onPress={deleteSelected} disabled={selectedPhotos.length === 0}>
              <Text style={[s.deleteBtnText, selectedPhotos.length === 0 && { opacity: 0.4 }]}>Delete</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity key="select" style={s.editBtn} onPress={() => setSelectionMode(true)} disabled={photos.length === 0}>
              <Text style={[s.editBtnText, photos.length === 0 && { opacity: 0.3 }]}>Select</Text>
            </TouchableOpacity>
          ),
        ]}
      />

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={[...photos, ...(photos.length < slotLimit ? ['add'] : [])]}
          keyExtractor={(item, i) => `${item}-${i}`}
          numColumns={3}
          contentContainerStyle={s.grid}
          ListHeaderComponent={
            <>
              <View style={s.statsCard}>
                <View style={s.statRow}>
                  <View style={s.stat}>
                    <Text style={s.statValue}>{photos.length}</Text>
                    <Text style={s.statLabel}>Photos</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.stat}>
                    <Text style={s.statValue}>{slotLimit - photos.length}</Text>
                    <Text style={s.statLabel}>Slots left</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.stat}>
                    <Text style={s.statValue}>{photos.length > 0 ? '✓' : '—'}</Text>
                    <Text style={s.statLabel}>Portfolio</Text>
                  </View>
                </View>
                <Text style={s.statHint}>
                  Providers with 10+ photos get 3x more bookings
                </Text>
              </View>

              {verifiedPhotos.length > 0 && (
                <View style={s.verifiedSection}>
                  <Text style={s.verifiedSectionTitle}>✓ Verified event photos (from customers)</Text>
                  <Text style={s.verifiedSectionSub}>
                    Real proof from completed bookings — customers share these, you can't edit or remove them here.
                  </Text>
                  <FlatList
                    data={verifiedPhotos}
                    keyExtractor={item => item.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                    renderItem={({ item }) => (
                      <View style={s.verifiedPhotoCell}>
                        <Image source={{ uri: item.photo_url }} style={s.verifiedPhoto} />
                        {item.booking && (
                          <Text style={s.verifiedPhotoCaption} numberOfLines={1}>{item.booking.event_type}</Text>
                        )}
                      </View>
                    )}
                  />
                </View>
              )}

              <Text style={s.yourPhotosLabel}>Your photos</Text>
            </>
          }
          renderItem={({ item }) => {
            if (item === 'add') {
              return (
                <TouchableOpacity
                  style={s.addPhotoCell}
                  onPress={uploading ? null : showUploadOptions}
                  disabled={uploading}
                >
                  {uploading ? (
                    <View style={s.uploadingBox}>
                      <ActivityIndicator color={theme.accent} />
                      <Text style={s.uploadingText}>{uploadProgress}%</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={s.addPhotoIcon}>+</Text>
                      <Text style={s.addPhotoText}>Add photo</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            }
            const isSelected = selectedPhotos.includes(item);
            return (
              <TouchableOpacity
                style={s.photoCell}
                onPress={() => selectionMode ? toggleSelection(item) : null}
                onLongPress={() => {
                  setSelectionMode(true);
                  toggleSelection(item);
                }}
              >
                <Image source={{ uri: item }} style={s.photo} />
                {selectionMode && (
                  <View style={[s.selectionOverlay, isSelected && s.selectionOverlayActive]}>
                    {isSelected && <Text style={s.selectionCheck}>✓</Text>}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {!loading && photos.length === 0 && (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>📷</Text>
          <Text style={s.emptyTitle}>No portfolio photos yet</Text>
          <Text style={s.emptySub}>
            Add photos of your best work to attract more customers.
            Providers with photos get significantly more bookings.
          </Text>
          <TouchableOpacity style={s.uploadBtn} onPress={showUploadOptions}>
            <Text style={s.uploadBtnText}>+ Upload your first photos</Text>
          </TouchableOpacity>
        </View>
      )}

      {!selectionMode && photos.length > 0 && (
        <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
          <TouchableOpacity
            style={[s.addMoreBtn, uploading && { opacity: 0.6 }]}
            onPress={showUploadOptions}
            disabled={uploading || photos.length >= slotLimit}
          >
            {uploading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={theme.btnPrimaryText} size="small" />
                <Text style={s.addMoreBtnText}>Uploading {uploadProgress}%</Text>
              </View>
            ) : (
              <Text style={s.addMoreBtnText}>
                {photos.length >= slotLimit ? 'Maximum photos reached' : '+ Add more photos'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Web upload menu — Alert.alert with multiple custom actions is unreliable on web */}
      <Modal
        visible={showUploadMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUploadMenu(false)}
      >
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setShowUploadMenu(false)}>
          <View style={s.menuSheet}>
            <Text style={s.menuTitle}>Add photos</Text>
            <TouchableOpacity style={s.menuOption} onPress={handlePickPhotos}>
              <Text style={s.menuOptionText}>📁 Choose from gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuOption} onPress={handleTakePhoto}>
              <Text style={s.menuOptionText}>📷 Take a photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuCancel} onPress={() => setShowUploadMenu(false)}>
              <Text style={s.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    editBtn: { paddingHorizontal: 12, paddingVertical: 6 },
    editBtnText: { fontSize: 14, color: theme.accent, fontWeight: '600' },
    deleteBtn: { paddingHorizontal: 12, paddingVertical: 6 },
    deleteBtnText: { fontSize: 14, color: theme.statusDeclinedText, fontWeight: '700' },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    statsCard: { margin: 12, padding: 16, backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border },
    statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: '700', color: theme.text },
    statLabel: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
    statDivider: { width: 0.5, height: 28, backgroundColor: theme.border },
    statHint: { fontSize: 12, color: theme.accent, textAlign: 'center', fontWeight: '600' },

    verifiedSection: { marginHorizontal: 12, marginBottom: 8, padding: 14, backgroundColor: '#E8F5E9', borderRadius: 16 },
    verifiedSectionTitle: { fontSize: 13, fontWeight: '700', color: '#2E7D32', marginBottom: 4 },
    verifiedSectionSub: { fontSize: 11.5, color: '#2E7D32', lineHeight: 16, marginBottom: 12 },
    verifiedPhotoCell: { width: 90 },
    verifiedPhoto: { width: 90, height: 90, borderRadius: 12, backgroundColor: '#fff' },
    verifiedPhotoCaption: { fontSize: 10.5, color: '#2E7D32', fontWeight: '600', marginTop: 4 },
    yourPhotosLabel: { fontSize: 12, fontWeight: '700', color: theme.textTertiary, marginHorizontal: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
    grid: { paddingHorizontal: 4, paddingBottom: 140 },
    photoCell: { width: '33%', aspectRatio: 1, padding: 3 },
    photo: { width: '100%', height: '100%', borderRadius: 12 },
    selectionOverlay: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    selectionOverlayActive: { backgroundColor: 'rgba(0,0,0,0.4)', borderColor: '#fff' },
    selectionCheck: { fontSize: 24, color: '#fff', fontWeight: '700' },
    addPhotoCell: { width: '33%', aspectRatio: 1, padding: 3, alignItems: 'center', justifyContent: 'center' },
    addPhotoIcon: { fontSize: 26, color: theme.textTertiary },
    addPhotoText: { fontSize: 11, color: theme.textSecondary, marginTop: 5 },
    uploadingBox: { alignItems: 'center', gap: 6 },
    uploadingText: { fontSize: 12, color: theme.accent, fontWeight: '700' },

    emptyBox: { position: 'absolute', top: '28%', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 32 },
    emptyIcon: { fontSize: 46, marginBottom: 14, opacity: 0.5 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 8 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 26 },
    uploadBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14 },
    uploadBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    addMoreBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
    addMoreBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    menuSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
    menuTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 14, textAlign: 'center' },
    menuOption: { paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    menuOptionText: { fontSize: 15, color: theme.text, textAlign: 'center', fontWeight: '500' },
    menuCancel: { paddingVertical: 15, marginTop: 6 },
    menuCancelText: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', fontWeight: '600' },
  });
}