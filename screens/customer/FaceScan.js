import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList, Image, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { uploadToCloudinary, searchFaceInCollection } from '../../helpers';
import { useTheme } from '../../ThemeContext';
import { useEventContext } from '../../hooks/useEventContext';
import AppHeader from '../../components/AppHeader';

// expo-camera, expo-file-system, expo-sharing are native-only — never import
// CameraView etc. at the top level on web, or the bundle can break on load.
let CameraView, useCameraPermissions, FileSystem, Sharing;
if (Platform.OS !== 'web') {
  CameraView = require('expo-camera').CameraView;
  useCameraPermissions = require('expo-camera').useCameraPermissions;
  FileSystem = require('expo-file-system/legacy');
  Sharing = require('expo-sharing');
}

// ── Web fallback — camera face-matching is native-only ──
function WebNotAvailable({ navigation, event, theme }) {
  const s = makeStyles(theme);
  return (
    <SafeAreaView style={s.container}>
      <AppHeader title={event?.name || 'Find my photos'} onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <View style={s.webFallback}>
        <Text style={s.webFallbackIcon}>📱</Text>
        <Text style={s.webFallbackTitle}>Open the Utsav app to scan your face</Text>
        <Text style={s.webFallbackSub}>
          Face-matching photo search uses your device's camera and isn't available in the web version.
          Open Utsav on your phone to find your photos from {event?.name || 'this event'}.
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default function FaceScan({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { event, loading: eventLoading } = useEventContext(eventId);

  if (Platform.OS === 'web') {
    return <WebNotAvailable navigation={navigation} event={event} theme={theme} />;
  }

  if (eventLoading && !event) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return <NativeFaceScan event={event} navigation={navigation} theme={theme} s={s} />;
}

// ── Native flow — full camera + face recognition ──
function NativeFaceScan({ event, navigation, theme, s }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState('scan');
  const [scanning, setScanning] = useState(false);
  const [myPhotos, setMyPhotos] = useState([]);
  const cameraRef = useRef(null);

  async function handleTakeSelfie() {
    if (!cameraRef.current) return;
    try {
      setScanning(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { url: selfieUrl } = await uploadToCloudinary(photo.uri);

      const matchedPhotoIds = await searchFaceInCollection(
        selfieUrl,
        event.rekognition_collection_id
      );

      if (matchedPhotoIds.length === 0) {
        Alert.alert(
          'No photos found 😔',
          'We could not find any photos of you at this event. Make sure you are at the right event or try again with better lighting.',
          [{ text: 'Try again' }]
        );
        setScanning(false);
        return;
      }

      const { data: photos } = await supabase
        .from('photos')
        .select('*')
        .in('id', matchedPhotoIds);

      await supabase
        .from('event_guests')
        .upsert({
          event_id: event.id,
          guest_id: session.user.id,
          selfie_url: selfieUrl,
          matched_photos: matchedPhotoIds,
        });

      setMyPhotos(photos || []);
      setStep('results');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleDownloadPhoto(photoUrl) {
    try {
      const filename = `utsav_photo_${Date.now()}.jpg`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.downloadAsync(photoUrl, fileUri);
      await Sharing.shareAsync(fileUri);
    } catch (err) {
      Alert.alert('Download failed', err.message);
    }
  }

  if (!permission) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBoxLight}>
          <Text style={s.permIcon}>📷</Text>
          <Text style={s.permTitle}>Camera permission needed</Text>
          <Text style={s.permSub}>
            We need camera access to scan your face and find your photos.
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Allow camera access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'results') {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="My photos" onBack={() => setStep('scan')} theme={theme} navigation={navigation} />

        <View style={s.resultsHeader}>
          <Text style={s.resultsIcon}>🎉</Text>
          <Text style={s.resultsTitle}>
            Found {myPhotos.length} photos of you!
          </Text>
          <Text style={s.resultsSub}>
            From {event.name}
          </Text>
        </View>

        <FlatList
          data={myPhotos}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={s.photoGrid}
          renderItem={({ item }) => (
            <View style={s.photoCard}>
              <Image
                source={{ uri: item.cloudinary_url }}
                style={s.photoImage}
              />
              <TouchableOpacity
                style={s.downloadBtn}
                onPress={() => handleDownloadPhoto(item.cloudinary_url)}
              >
                <Text style={s.downloadBtnText}>⬇ Save</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title={event.name} onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={s.instructionBox}>
        <Text style={s.instructionText}>
          📸 Position your face in the frame and tap the button below
        </Text>
      </View>

      <View style={s.cameraWrapper}>
        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="front"
        />
        <View style={s.faceFrame} pointerEvents="none">
          <View style={s.faceCircle} />
        </View>
      </View>

      <View style={s.bottomBar}>
        <Text style={s.eventName}>{event.name}</Text>
        <Text style={s.eventDate}>
          {new Date(event.event_date).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
          })}
        </Text>
        <TouchableOpacity
          style={[s.scanBtn, scanning && { opacity: 0.7 }]}
          onPress={handleTakeSelfie}
          disabled={scanning}
        >
          {scanning ? (
            <View style={s.scanningRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={s.scanBtnText}>Scanning your face...</Text>
            </View>
          ) : (
            <Text style={s.scanBtnText}>🤳 Find my photos</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#161616' },
    backIcon: { fontSize: 22, color: '#fff', width: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', gap: 12 },
    centerBoxLight: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, gap: 12, padding: 32 },
    permIcon: { fontSize: 46, marginBottom: 8, opacity: 0.6 },
    permTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    permSub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
    permBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingHorizontal: 26, paddingVertical: 13, marginTop: 10 },
    permBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    instructionBox: { backgroundColor: '#161616', padding: 14, alignItems: 'center' },
    instructionText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center' },
    cameraWrapper: { flex: 1, position: 'relative' },
    camera: { flex: 1 },
    faceFrame: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
    },
    faceCircle: { width: 220, height: 280, borderRadius: 110, borderWidth: 2, borderColor: theme.accent, borderStyle: 'dashed' },

    bottomBar: { backgroundColor: '#161616', padding: 22, alignItems: 'center' },
    eventName: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
    eventDate: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 18 },
    scanBtn: { backgroundColor: theme.accent, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 40, alignItems: 'center', width: '100%' },
    scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    resultsHeader: { alignItems: 'center', padding: 22, backgroundColor: theme.bg, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    resultsIcon: { fontSize: 38, marginBottom: 10 },
    resultsTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 4 },
    resultsSub: { fontSize: 13, color: theme.textSecondary },

    photoGrid: { padding: 8, backgroundColor: theme.bg },
    photoCard: { width: '50%', padding: 5 },
    photoImage: { width: '100%', aspectRatio: 1, borderRadius: 14 },
    downloadBtn: { backgroundColor: theme.btnPrimary, borderRadius: 10, padding: 9, alignItems: 'center', marginTop: 6 },
    downloadBtnText: { color: theme.btnPrimaryText, fontSize: 12, fontWeight: '700' },

    // Web fallback
    webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: theme.bg },
    webFallbackIcon: { fontSize: 48, marginBottom: 18, opacity: 0.5 },
    webFallbackTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 10, textAlign: 'center' },
    webFallbackSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21 },
  });
}