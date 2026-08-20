import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode-svg';
import * as Location from 'expo-location';
import { useTheme } from '../ThemeContext';
import { supabase } from '../supabase';
import { callEdgeFunction, showAlert, confirmDestructive } from '../helpers';
import { haversineMeters } from '../lib/haversine';
import { PUBLIC_WEB_URL } from '../config';
import SparkleIcon from '../components/SparkleIcon';

// One-shot proximity radius for the "you're near the venue" self-check-in
// prompt — a single foreground location read on page-open, never continuous
// tracking. Deliberately generous: venue parking/entrance lots can be large,
// and this is a convenience nudge, not a precise geofence boundary.
const PROXIMITY_RADIUS_M = 300;

function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function qrSvgFor(passCode) {
  const raw = new QRCode({ content: `${PUBLIC_WEB_URL}/p/${passCode}`, width: 160, height: 160, padding: 4, color: '#000000', background: '#ffffff', ecl: 'M' }).svg();
  return raw.replace(/^<\?xml[^>]*\?>\s*/, '');
}

// The one no-login, guest-reachable place a guest's own pass actually
// lives — reached via the QR code / wa.me link the host shares (PassCard.js
// builds that same /p/{passCode} URL). Mirrors RSVPScreen.js's shape (public
// edge function, no auth) but for gate-pass status/check-in instead of RSVP.
export default function GuestPassScreen({ route }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const passCode = (route?.params?.passCode || '').toUpperCase();

  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCheckInPrompt, setShowCheckInPrompt] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [dataDeleted, setDataDeleted] = useState(false);

  useEffect(() => { fetchPass(); }, [passCode]);

  async function fetchPass() {
    if (!passCode) {
      setLoadError('No pass code was provided.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { pass: p } = await callEdgeFunction('guest-pass', { action: 'get_pass', pass_code: passCode });
      setPass(p);
    } catch (err) {
      setLoadError(err.message || 'Pass not found.');
    } finally {
      setLoading(false);
    }
  }

  // Foreground-only proximity check — a single location read right after
  // the pass loads, nothing continuous, no background permission requested.
  // Fails completely silently: this is a bonus convenience on top of the
  // pass page, never something that should nag, block, or error the guest
  // out of just seeing their pass.
  useEffect(() => {
    if (!pass || pass.status === 'checked_in' || pass.venueLat == null || pass.venueLng == null) return;
    if (Platform.OS === 'web' && !(typeof navigator !== 'undefined' && navigator.geolocation)) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const dist = haversineMeters(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          { lat: pass.venueLat, lng: pass.venueLng }
        );
        if (dist <= PROXIMITY_RADIUS_M) setShowCheckInPrompt(true);
      } catch (err) {
        console.log('proximity check skipped:', err.message);
      }
    })();
  }, [pass?.status, pass?.venueLat, pass?.venueLng]);

  async function handleProximityCheckIn() {
    setCheckingIn(true);
    try {
      const { pass: updated } = await callEdgeFunction('guest-pass', {
        action: 'self_check_in',
        pass_code: passCode,
        arrived_count: pass.partySize,
      });
      setPass(updated);
      setShowCheckInPrompt(false);
    } catch (err) {
      showAlert('Could not check in', err.message || 'Please try again, or check in at the gate.');
    } finally {
      setCheckingIn(false);
    }
  }

  function requestDataDeletion() {
    confirmDestructive(
      'Delete my data?',
      "This permanently removes your name, phone number, and any notes from this event's guest list — it can't be undone. The host keeps only anonymous counts (RSVP status, headcount) for their records.",
      'Delete my data',
      async () => {
        setDeletingData(true);
        try {
          const { data: found, error: rpcError } = await supabase.rpc('request_guest_deletion_by_pass_code', {
            p_pass_code: passCode,
          });
          if (rpcError) throw rpcError;
          if (!found) {
            showAlert('Not found', "We couldn't match this pass to a guest record.");
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

  if (loading) {
    return (
      <SafeAreaView style={[s.container, s.centerBox]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </SafeAreaView>
    );
  }

  if (loadError || !pass) {
    return (
      <SafeAreaView style={[s.container, s.centerBox]}>
        <Text style={s.errorIcon}>😕</Text>
        <Text style={s.errorTitle}>Pass not found</Text>
        <Text style={s.errorSub}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  const qrSvgString = qrSvgFor(pass.passCode);
  const alreadyCheckedIn = pass.status === 'checked_in';

  return (
    <SafeAreaView style={s.container}>
      <View style={s.scroll}>
        <View style={s.card}>
          <Text style={s.guestName}>{pass.guestName}</Text>
          {pass.partySize > 1 ? <Text style={s.partySize}>Party of {pass.partySize}</Text> : null}
          {pass.eventName ? <Text style={s.where}>{pass.eventName}</Text> : null}
          {pass.venueName ? <Text style={s.whereSub}>{pass.venueName}</Text> : null}
          {pass.venueAddress ? (
            <TouchableOpacity onPress={() => Linking.openURL(googleMapsUrl(pass.venueAddress))}>
              <Text style={s.venueLink}>{pass.venueAddress}</Text>
            </TouchableOpacity>
          ) : null}
          {pass.eventDate ? (
            <Text style={s.when}>
              {new Date(pass.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              {pass.entryWindow ? ` · ${pass.entryWindow}` : ''}
            </Text>
          ) : null}
          <Text style={s.code}>{pass.passCode}</Text>
          <View style={s.qrBox}>
            <SvgXml xml={qrSvgString} width={160} height={160} />
          </View>
          {alreadyCheckedIn ? (
            <Text style={s.checkedInBadge}>✓ Checked in{pass.arrivedCount > 1 ? ` · ${pass.arrivedCount} arrived` : ''}</Text>
          ) : null}
        </View>

        {dataDeleted ? (
          <Text style={s.dataDeletedText}>✓ Your name, phone, and notes have been removed from this event's guest list.</Text>
        ) : (
          <TouchableOpacity style={s.deleteDataLink} onPress={requestDataDeletion} disabled={deletingData}>
            {deletingData
              ? <ActivityIndicator size="small" color={theme.textTertiary} />
              : <Text style={s.deleteDataLinkText}>Request my data be deleted</Text>
            }
          </TouchableOpacity>
        )}

        {showCheckInPrompt && !alreadyCheckedIn ? (
          <TouchableOpacity style={s.proximityBtn} onPress={handleProximityCheckIn} disabled={checkingIn}>
            {checkingIn
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.proximityBtnText}>📍 You're near the venue — check in now?</Text>
            }
          </TouchableOpacity>
        ) : null}

        <View style={s.appFooter}>
          <View style={s.appFooterDivider} />
          <View style={s.appFooterBrand}>
            <SparkleIcon style={s.appFooterIcon} />
            <Text style={s.appFooterName}>Utsav</Text>
          </View>
          <TouchableOpacity style={s.appFooterBtn} onPress={() => Linking.openURL(PUBLIC_WEB_URL)}>
            <Text style={s.appFooterBtnText}>Plan your own event on Utsav →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centerBox: { alignItems: 'center', justifyContent: 'center', padding: 32 },
    errorIcon: { fontSize: 40, marginBottom: 12 },
    errorTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 6 },
    errorSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },

    scroll: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
    card: {
      backgroundColor: theme.cardBg, borderRadius: 20, borderWidth: 1, borderColor: theme.accent,
      paddingVertical: 30, paddingHorizontal: 24, alignItems: 'center', width: '100%', maxWidth: 380,
    },
    guestName: { fontSize: 26, fontWeight: '800', color: theme.text, textAlign: 'center' },
    partySize: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginTop: 4 },
    where: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 14, textAlign: 'center' },
    whereSub: { fontSize: 13, color: theme.textSecondary, marginTop: 2, textAlign: 'center' },
    venueLink: { fontSize: 12.5, color: theme.accent, fontWeight: '600', marginTop: 4, textAlign: 'center' },
    when: { fontSize: 14, color: theme.textSecondary, marginTop: 10, textAlign: 'center' },
    code: { fontSize: 22, fontWeight: '800', letterSpacing: 4, color: theme.text, marginTop: 16, fontFamily: 'Courier' },
    qrBox: { marginTop: 18, backgroundColor: '#fff', padding: 10, borderRadius: 12 },
    checkedInBadge: { fontSize: 13, fontWeight: '700', color: '#4CAF50', marginTop: 16 },

    proximityBtn: {
      marginTop: 18, backgroundColor: '#2E7D32', borderRadius: 16, paddingVertical: 16,
      paddingHorizontal: 20, alignItems: 'center', width: '100%', maxWidth: 380,
    },
    proximityBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700', textAlign: 'center' },

    deleteDataLink: { marginTop: 18, paddingVertical: 8 },
    deleteDataLinkText: { fontSize: 12.5, color: theme.textTertiary, textAlign: 'center', textDecorationLine: 'underline' },
    dataDeletedText: { fontSize: 12.5, color: theme.textSecondary, textAlign: 'center', marginTop: 18, lineHeight: 18 },

    appFooter: { alignItems: 'center', marginTop: 32, width: '100%', maxWidth: 380 },
    appFooterDivider: { height: 0.5, backgroundColor: theme.border, width: '100%', marginBottom: 20 },
    appFooterBrand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    appFooterIcon: { fontSize: 16, color: theme.accent },
    appFooterName: { fontSize: 14, fontWeight: '700', color: theme.text },
    appFooterBtn: { paddingVertical: 10 },
    appFooterBtnText: { fontSize: 13, fontWeight: '600', color: theme.accent },
  });
}
