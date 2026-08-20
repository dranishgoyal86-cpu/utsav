import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Switch, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { useCapabilityRules } from '../../hooks/useCapabilities';
import { resolveCapabilities, isEnabled } from '../../lib/capabilities';
import { enqueue, drain } from '../../lib/uploadQueue';
import { callEdgeFunction, confirmDestructive } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import { GEOFENCE_TASK } from '../../lib/geofenceTask';

// Only registered Utsav accounts can upload photos — no anonymous/no-account
// path. GuestAccess.js is itself only reachable by an already-authenticated
// customer (it's registered in App.js's customer stack — a Stack.Screen
// that doesn't exist at all in the logged-out branch, unlike RSVP/GuestPass/
// GuestSignup), so every upload here goes under that person's own uid — the
// existing photos RLS insert policy (auth.uid() = uploaded_by) already
// covers this with no changes. This also means the geofencing opt-in below
// never needs a "please log in" redirect of its own: there is no path to
// this screen at all while logged out, so that half of gating is already
// structurally guaranteed by the navigator, not something to add here. The
// real gap is narrower — being LOGGED IN doesn't mean this session is
// actually THIS event's invitee (any authenticated customer can type a
// correct invite code), which the geofencing toggle checks for separately
// via the guest-pass edge function's get_my_pass action before ever
// offering it — the existing find-photos/camera/gallery menu items below
// stay open to any logged-in customer, unchanged, since that's their
// existing, already-shipped behavior and not what this task is about.
export default function GuestAccess({ navigation }) {
  const { theme } = useTheme();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const s = makeStyles(theme);
  const { rules: capabilityRules } = useCapabilityRules();

  const [step, setStep] = useState('code'); // 'code' | 'menu'
  const [event, setEvent] = useState(null);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  // Geofencing opt-in — myPass is this session's own pass for `event`
  // (null while loading, or if this session isn't actually this event's
  // invitee / no pass has been issued yet). geofenceEnabled is local-only
  // UI state for the Switch, not read back from the DB — this component
  // only ever runs on the device that itself calls startGeofencingAsync/
  // stopGeofencingAsync, so local state and the actual OS registration
  // never drift within a single session.
  const [myPass, setMyPass] = useState(null);
  const [myPassReason, setMyPassReason] = useState(null);
  const [loadingMyPass, setLoadingMyPass] = useState(false);
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);
  const [geofenceBusy, setGeofenceBusy] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [dataDeleted, setDataDeleted] = useState(false);

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  // Resolves whether THIS logged-in session is actually this event's own
  // invitee (not just any authenticated customer who typed the right code)
  // and, if so, their own pass — the credential the geofence region gets
  // registered against. Silent either way: `reason` distinguishes "not
  // this event's guest" from "invited but no pass issued yet" from "the
  // identity-linking migration hasn't landed on this database yet" so the
  // toggle section can render (or quietly not render) accordingly, never
  // as an error the guest has to deal with — this is a bonus feature layered
  // on top of the existing find-photos/camera flow, not a blocker for it.
  useEffect(() => {
    if (step !== 'menu' || !event?.id) return;
    (async () => {
      setLoadingMyPass(true);
      try {
        const { pass } = await callEdgeFunction('guest-pass', { action: 'get_my_pass', event_id: event.id });
        setMyPass(pass || null);
        setMyPassReason(pass ? null : 'not_invited');
        if (pass?.status === 'checked_in') setGeofenceEnabled(false);
      } catch (err) {
        console.log('get_my_pass error:', err.message);
        setMyPass(null);
        setMyPassReason('linking_unavailable');
      } finally {
        setLoadingMyPass(false);
      }
    })();
  }, [step, event?.id]);

  // Stale-region cleanup — an event that's already happened has nothing
  // left to auto-check-in for, and a still-registered region wastes one of
  // the platform's limited concurrent geofence slots (iOS caps at 20) for
  // no reason. Runs whenever a pass with venue coords loads; harmless to
  // call even if nothing was ever actually registered on this device.
  useEffect(() => {
    if (Platform.OS === 'web' || !event?.event_date) return;
    const eventDate = new Date(event.event_date + 'T00:00:00');
    const isPast = eventDate < new Date(new Date().toDateString());
    if (!isPast) return;
    Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    if (myPass && event?.id) {
      supabase.rpc('set_geofence_opted_in', { p_event_id: event.id, p_enabled: false })
        .then(({ error }) => { if (error) console.log('geofence cleanup RPC error (non-fatal):', error.message); });
    }
  }, [event?.event_date, myPass]);

  async function handleToggleGeofence(enabled) {
    if (!enabled) {
      setGeofenceBusy(true);
      try {
        await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
        setGeofenceEnabled(false);
      } finally {
        setGeofenceBusy(false);
      }
      return;
    }
    if (!myPass?.passCode) {
      showAlert('Not available yet', "This isn't set up for you on this event yet — ask your host to issue gate passes first.");
      return;
    }
    if (myPass.venueLat == null || myPass.venueLng == null) {
      showAlert('Not available yet', "The host hasn't set an exact venue location for this event.");
      return;
    }
    setGeofenceBusy(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        showAlert('Permission needed', 'Location access is needed to enable auto check-in.');
        return;
      }
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        showAlert(
          'Background permission needed',
          Platform.OS === 'ios'
            ? 'Enable "Always" location access for Utsav in Settings to use auto check-in.'
            : 'Enable "Allow all the time" location access for Utsav to use auto check-in.'
        );
        return;
      }
      await Location.startGeofencingAsync(GEOFENCE_TASK, [{
        identifier: myPass.passCode, // matches lib/geofenceTask.js's self_check_in call
        latitude: myPass.venueLat,
        longitude: myPass.venueLng,
        radius: 300, // matches GuestPassScreen.js's foreground PROXIMITY_RADIUS_M
        notifyOnEnter: true,
        notifyOnExit: false,
      }]);
      setGeofenceEnabled(true);
      // Best-effort — geofence_opted_in is purely informational bookkeeping
      // (what's actually armed lives in the OS's geofence registration
      // itself), so a failed write here doesn't need to block the toggle
      // from working. Goes through the RPC, not a plain client update —
      // event_invitees' RLS only permits the host, not the guest's own
      // session, to write to their own row (see the migration file).
      supabase.rpc('set_geofence_opted_in', { p_event_id: event.id, p_enabled: true })
        .then(({ error }) => { if (error) console.log('geofence_opted_in RPC error:', error.message); });
    } catch (err) {
      showAlert('Could not enable auto check-in', err.message);
    } finally {
      setGeofenceBusy(false);
    }
  }

  // Scoped to THIS event's row only (event_id = p_event_id and user_id =
  // auth.uid(), enforced server-side inside the RPC) — not every event this
  // guest account is linked to, matching set_geofence_opted_in()'s own
  // scoping exactly (supabase/migrations/geofence_opt_in.sql).
  function requestDataDeletion() {
    confirmDestructive(
      'Delete my data?',
      "This permanently removes your name, phone number, and any notes from this event's guest list — it can't be undone. The host keeps only anonymous counts (RSVP status, headcount) for their records.",
      'Delete my data',
      async () => {
        setDeletingData(true);
        try {
          const { data: found, error: rpcError } = await supabase.rpc('request_guest_deletion_by_account', {
            p_event_id: event.id,
          });
          if (rpcError) throw rpcError;
          if (!found) {
            showAlert('Not found', "We couldn't find your guest record for this event.");
            return;
          }
          setDataDeleted(true);
        } catch (err) {
          showAlert('Error', err.message || 'Could not process your request. Please try again.');
        } finally {
          setDeletingData(false);
        }
      }
    );
  }

  async function handleJoinEvent() {
    if (!inviteCode || inviteCode.length < 6) {
      showAlert('Invalid code', 'Please enter a valid 6-character invite code.');
      return;
    }
    try {
      setLoading(true);
      const { data: eventData, error } = await supabase
        .from('events')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .maybeSingle();

      if (error) throw error;

      if (!eventData) {
        showAlert('Event not found', 'Please check your invite code and try again.');
        return;
      }

      setEvent(eventData);
      setStep('menu');
    } catch (err) {
      console.log('Join event error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function findMyPhotos() {
    // Guests can't know ahead of time whether an event's host has face
    // recognition enabled (it needs 40+ guests) — the code-entry field
    // itself has no per-event browsable list to hide, so the gate happens
    // right after lookup instead, before FaceScan is ever reached.
    const resolved = resolveCapabilities(capabilityRules, {
      eventTypeSlug: event.event_type_slug,
      venueType: event.venue_type,
      guestCount: event.guest_count,
      age: event.child_age,
      isDryEvent: event.is_dry_event,
      isVegOnly: event.is_veg_only,
      hasBudget: event.budget_total != null,
    });
    if (!isEnabled(resolved, 'face_recognition')) {
      showAlert('Not available', "Face recognition search isn't set up for this event.");
      return;
    }
    navigation.navigate('FaceScan', { eventId: event.id });
  }

  function openCamera() {
    if (event.guest_capture_enabled === false) {
      showAlert('Not available', 'The host has turned off guest photo capture for this event.');
      return;
    }
    navigation.navigate('CameraCapture', { eventId: event.id, isGuestCapture: true });
  }

  async function pickFromGallery() {
    if (event.guest_capture_enabled === false) {
      showAlert('Not available', 'The host has turned off guest photo capture for this event.');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showAlert('Not signed in', 'Please log in to add photos.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;

    setUploadingGallery(true);
    try {
      for (const asset of result.assets) {
        await enqueue({
          eventId: event.id,
          localUri: asset.uri,
          uploaderId: session.user.id,
          uploaderName: null,
          source: 'gallery',
        });
      }
      drain();
      showAlert('Added', `${result.assets.length} photo${result.assets.length > 1 ? 's' : ''} queued for upload.`);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setUploadingGallery(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title={step === 'menu' ? (event?.name || 'Join event') : 'Find my photos'}
        onBack={() => (step === 'menu' ? setStep('code') : navigation.goBack())}
        theme={theme}
        navigation={navigation}
      />

      {step === 'code' ? (
        <KeyboardAvoidingView style={s.inner} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.heroBox}>
            <Text style={s.heroIcon}>🤳</Text>
            <Text style={s.heroTitle}>Find your photos</Text>
            <Text style={s.heroSub}>
              Enter the invite code from the event host. We'll use face recognition to find all your photos instantly, or add your own.
            </Text>
          </View>

          <View style={s.form}>
            <Text style={s.label}>Event invite code</Text>
            <TextInput
              style={s.codeInput}
              placeholder="ABC123"
              placeholderTextColor={theme.textTertiary}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              maxLength={6}
            />
            <Text style={s.hint}>
              Ask the event host for the 6-character code
            </Text>

            <TouchableOpacity
              style={[s.joinBtn, loading && { opacity: 0.7 }]}
              onPress={handleJoinEvent}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={theme.btnPrimaryText} />
                : <Text style={s.joinBtnText}>Continue →</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={s.inner}>
          <View style={s.menuList}>
            <TouchableOpacity style={s.menuItem} onPress={findMyPhotos}>
              <Text style={s.menuItemIcon}>🤳</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.menuItemTitle}>Find my photos</Text>
                <Text style={s.menuItemSub}>Scan your face to find photos of you</Text>
              </View>
              <Text style={s.menuItemArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.menuItem} onPress={openCamera}>
              <Text style={s.menuItemIcon}>📷</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.menuItemTitle}>Take photos</Text>
                <Text style={s.menuItemSub}>Open the camera and add to the album</Text>
              </View>
              <Text style={s.menuItemArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.menuItem} onPress={pickFromGallery} disabled={uploadingGallery}>
              <Text style={s.menuItemIcon}>🖼️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.menuItemTitle}>Add photos</Text>
                <Text style={s.menuItemSub}>Choose from your gallery</Text>
              </View>
              {uploadingGallery ? <ActivityIndicator color={theme.accent} /> : <Text style={s.menuItemArrow}>›</Text>}
            </TouchableOpacity>
          </View>

          {/* Only shown once we've confirmed this session is actually this
              event's own invitee AND has a pass issued — silently absent
              otherwise (not invited, no pass yet, or the identity-linking
              migration hasn't landed on this database yet), never an error. */}
          {!loadingMyPass && myPass?.passCode && myPass.status !== 'checked_in' && (
            <View style={s.geofenceOptInRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.geofenceOptInTitle}>Auto check-in on arrival</Text>
                <Text style={s.geofenceOptInSubtitle}>
                  Utsav will check you in automatically when you arrive near the venue — no need to find a guard or scan a code. Uses background location only for this event, and stops once you're checked in.
                </Text>
              </View>
              {geofenceBusy
                ? <ActivityIndicator color={theme.accent} />
                : <Switch value={geofenceEnabled} onValueChange={handleToggleGeofence} />
              }
            </View>
          )}
          {!loadingMyPass && myPass?.status === 'checked_in' && (
            <View style={s.geofenceOptInRow}>
              <Text style={s.geofenceOptInTitle}>✓ You're checked in for this event</Text>
            </View>
          )}

          {/* Same "linked to this event" check as the geofence toggle above
              (myPass present, or no pass issued yet but still linked) — a
              guest whose account was never actually matched to this event's
              invitee row has nothing here to delete. */}
          {!loadingMyPass && (myPass || myPassReason === 'no_pass_issued') && (
            dataDeleted ? (
              <Text style={s.dataDeletedText}>✓ Your name, phone, and notes have been removed from this event's guest list.</Text>
            ) : (
              <TouchableOpacity style={s.deleteDataLink} onPress={requestDataDeletion} disabled={deletingData}>
                {deletingData
                  ? <ActivityIndicator color={theme.textTertiary} />
                  : <Text style={s.deleteDataLinkText}>Delete my data for this event</Text>
                }
              </TouchableOpacity>
            )
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.bg, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },

    inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
    heroBox: { alignItems: 'center', marginBottom: 36 },
    heroIcon: { fontSize: 58, marginBottom: 14 },
    heroTitle: { fontSize: 23, fontWeight: '700', color: theme.text, marginBottom: 8, letterSpacing: -0.3 },
    heroSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21 },

    form: {
      backgroundColor: theme.cardBg, borderRadius: 24, padding: 26,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    },
    label: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 11 },
    codeInput: {
      backgroundColor: theme.bg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 17,
      fontSize: 28, fontWeight: '700', borderWidth: 1.5, borderColor: theme.border,
      color: theme.text, textAlign: 'center', letterSpacing: 8,
    },
    hint: { fontSize: 12, color: theme.textSecondary, textAlign: 'center', marginTop: 10, marginBottom: 6 },
    joinBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
    joinBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },

    menuList: { gap: 12 },
    menuItem: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border,
      padding: 16,
    },
    menuItemIcon: { fontSize: 26 },
    menuItemTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 2 },
    menuItemSub: { fontSize: 12.5, color: theme.textSecondary },
    menuItemArrow: { fontSize: 18, color: theme.textTertiary },

    geofenceOptInRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12,
      backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border,
      padding: 16,
    },
    geofenceOptInTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 4 },
    geofenceOptInSubtitle: { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },

    deleteDataLink: { marginTop: 14, paddingVertical: 8, alignItems: 'center' },
    deleteDataLinkText: { fontSize: 12.5, color: theme.textTertiary, textDecorationLine: 'underline' },
    dataDeletedText: { fontSize: 12.5, color: theme.textSecondary, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  });
}
