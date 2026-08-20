import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { enqueue, drain } from '../../lib/uploadQueue';
import { useUploadQueue } from '../../hooks/useUploadQueue';
import { useEventContext } from '../../hooks/useEventContext';
import SyncIndicator from '../../components/SyncIndicator';

// expo-camera is native-only — never import CameraView etc. at the top
// level on web, matches FaceScan.js's established guard.
let CameraView, useCameraPermissions;
if (Platform.OS !== 'web') {
  CameraView = require('expo-camera').CameraView;
  useCameraPermissions = require('expo-camera').useCameraPermissions;
} else {
  CameraView = View;
  useCameraPermissions = () => [{ granted: false }, () => {}];
}

const STATUS_COLOR = {
  pending: '#E8A020', uploading: '#3B82F6', uploaded: '#3B82F6',
  indexing: '#3B82F6', done: '#4CAF50', failed: '#F44336',
};

export default function CameraCapture({ route, navigation }) {
  const { eventId, isGuestCapture = false } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState('off');
  const [uploaderId, setUploaderId] = useState(null);
  const cameraRef = useRef(null);
  const shutterLockRef = useRef(false);

  const { entries } = useUploadQueue();
  const { event, loading: eventLoading } = useEventContext(eventId);

  // Only registered Utsav accounts can upload — always the real signed-in
  // uid, whether this is the host capturing from their own album
  // (AlbumDetailScreen.js) or another account member capturing into
  // someone else's event via an invite code (GuestAccess.js).
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUploaderId(session?.user?.id || null));
  }, []);

  const eventEntries = entries
    .filter(e => e.eventId === eventId)
    .sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
  const thumbnails = eventEntries.slice(0, 5);
  const uploadingCount = eventEntries.filter(e => e.status !== 'done' && e.status !== 'failed').length;

  if (eventLoading && !event) {
    return <SafeAreaView style={s.container} />;
  }

  if (isGuestCapture && event?.guest_capture_enabled === false) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={s.centerIcon}>📷</Text>
          <Text style={s.centerTitle}>Camera capture is off</Text>
          <Text style={s.centerSub}>The host has turned off guest photo capture for this event.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.primaryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={s.centerIcon}>📱</Text>
          <Text style={s.centerTitle}>Open the Utsav app to use the camera</Text>
          <Text style={s.centerSub}>In-album camera capture uses your device's camera and isn't available on web.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.primaryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <SafeAreaView style={s.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={s.centerIcon}>📷</Text>
          <Text style={s.centerTitle}>Camera access needed</Text>
          <Text style={s.centerSub}>Allow camera access to take photos for this event's album.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={requestPermission}>
            <Text style={s.primaryBtnText}>Allow camera access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.secondaryBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  function handleCapture() {
    // Synchronous lock so a double-tap can't fire two overlapping captures —
    // released as soon as takePictureAsync resolves (the actual capture is
    // fast; it's the upload that's slow, and that's never awaited here).
    if (shutterLockRef.current || !cameraRef.current) return;
    shutterLockRef.current = true;

    cameraRef.current.takePictureAsync({ quality: 0.8, base64: false })
      .then(photo => {
        shutterLockRef.current = false;
        // Fire-and-forget — capture must feel instant, never await the
        // queue/upload from the shutter handler.
        enqueue({
          eventId: eventId,
          localUri: photo.uri,
          uploaderId,
          uploaderName: null,
        }).then(() => drain()).catch(err => {
          console.log('CameraCapture enqueue error:', err.message);
          showAlert('Could not save photo', err.message);
        });
      })
      .catch(err => {
        shutterLockRef.current = false;
        console.log('takePictureAsync error:', err.message);
        showAlert('Capture failed', err.message);
      });
  }

  return (
    <View style={s.container}>
      <CameraView ref={cameraRef} style={s.camera} facing={facing} flash={flash} />
      <View style={s.overlayWrap} pointerEvents="box-none">
        <SafeAreaView style={s.overlay}>
          <View style={s.header}>
            <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}>
              <Text style={s.headerBtnText}>✕</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={s.counterText}>
                {eventEntries.length} photo{eventEntries.length === 1 ? '' : 's'}
                {uploadingCount > 0 ? ` · ${uploadingCount} uploading` : ''}
              </Text>
              <SyncIndicator scopeEventId={eventId} light />
            </View>
            <TouchableOpacity style={s.headerBtn} onPress={() => setFlash(f => (f === 'off' ? 'on' : 'off'))}>
              <Text style={s.headerBtnText}>{flash === 'on' ? '⚡' : '⚡︎'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }} />

          {thumbnails.length > 0 && (
            <FlatList
              horizontal
              data={thumbnails}
              keyExtractor={item => item.clientRef}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.thumbStrip}
              renderItem={({ item }) => (
                <View style={s.thumbCell}>
                  <Image source={{ uri: item.status === 'done' && item.cloudinaryUrl ? item.cloudinaryUrl : item.localUri }} style={s.thumbImg} />
                  <View style={[s.thumbDot, { backgroundColor: STATUS_COLOR[item.status] || '#999' }]} />
                </View>
              )}
            />
          )}

          <View style={s.controlsRow}>
            <View style={{ width: 50 }} />
            <TouchableOpacity style={s.shutterBtn} onPress={handleCapture}>
              <View style={s.shutterInner} />
            </TouchableOpacity>
            <TouchableOpacity style={s.flipBtn} onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}>
              <Text style={s.flipBtnText}>🔄</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', position: 'relative' },
    camera: { flex: 1 },
    overlayWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    overlay: { flex: 1, backgroundColor: 'transparent' },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    headerBtnText: { fontSize: 18, color: '#fff' },
    counterText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },

    thumbStrip: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
    thumbCell: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden', position: 'relative' },
    thumbImg: { width: '100%', height: '100%' },
    thumbDot: { position: 'absolute', bottom: 3, right: 3, width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderColor: '#fff' },

    controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, paddingBottom: 24 },
    shutterBtn: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
    flipBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    flipBtnText: { fontSize: 20 },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    centerIcon: { fontSize: 48, marginBottom: 16 },
    centerTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 8, textAlign: 'center' },
    centerSub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginBottom: 10 },
    primaryBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
    secondaryBtn: { paddingVertical: 8 },
    secondaryBtnText: { color: theme.textSecondary, fontSize: 13, fontWeight: '600' },
  });
}
