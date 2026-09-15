import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Linking, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode-svg';
import * as Location from 'expo-location';
import { useTheme } from '../../ThemeContext';
import { callEdgeFunction, showAlert } from '../../helpers';
import { formatTimeRangeLabel } from '../../lib/eventContext';
import { GEOFENCE_TASK } from '../../lib/geofenceTask';
import AppHeader from '../../components/AppHeader';
import InviteCardPreview from '../../components/InviteCardPreview';
import { resolveInviteDesignColors } from './GuestList';
import { PUBLIC_WEB_URL } from '../../config';

function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function qrSvgFor(passCode) {
  const raw = new QRCode({ content: `${PUBLIC_WEB_URL}/p/${passCode}`, width: 150, height: 150, padding: 4, color: '#000000', background: '#ffffff', ecl: 'M' }).svg();
  return raw.replace(/^<\?xml[^>]*\?>\s*/, '');
}

const RSVP_LABELS = { yes: "You're going", no: "You declined", maybe: "You said maybe", pending: 'Awaiting your RSVP' };

// "when clicking on the invite... it should show the invite image and the
// invitation details... rather than just showing the RSVP screen again.
// Also, it should show the check-in feature." — the guest's own "view my
// invite" screen, reached by tapping a row in MyInvites.js (or, in future,
// anywhere else an already-linked invite is shown). Uses the exact same
// route params as RSVPScreen.js (inviteCode + guestId) and the same
// submit-rsvp get_event call, just to view rather than to fill in a form —
// "Edit RSVP" below still hands off to RSVPScreen.js for the actual form,
// which already handles viewing/editing/resubmitting correctly.
export default function InviteDetails({ route, navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const inviteCode = route?.params?.inviteCode || '';
  const guestId = route?.params?.guestId || '';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [event, setEvent] = useState(null);

  const [myPass, setMyPass] = useState(null);
  const [myPassReason, setMyPassReason] = useState(null);
  const [loadingMyPass, setLoadingMyPass] = useState(true);
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);
  const [geofenceBusy, setGeofenceBusy] = useState(false);

  useEffect(() => { load(); }, [inviteCode, guestId]);

  async function load() {
    if (!inviteCode) { setLoadError('No invite code was provided.'); setLoading(false); return; }
    try {
      setLoading(true);
      const { event: ev } = await callEdgeFunction('submit-rsvp', {
        action: 'get_event', invite_code: inviteCode, guest_id: guestId || undefined,
      });
      setEvent(ev);
    } catch (err) {
      setLoadError(err.message || 'Invite not found.');
    } finally {
      setLoading(false);
    }
  }

  // Check-in — same get_my_pass call GuestAccess.js already uses, just
  // keyed off the event we already resolved above instead of asking the
  // guest to type their invite code a second time. Silent either way:
  // no pass issued (this event doesn't use gate passes, or the host
  // hasn't issued one yet) just shows a plain note instead of the toggle.
  useEffect(() => {
    if (!event?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingMyPass(true);
      try {
        const { pass } = await callEdgeFunction('guest-pass', { action: 'get_my_pass', event_id: event.id });
        if (cancelled) return;
        setMyPass(pass || null);
        setMyPassReason(pass ? null : 'not_available');
      } catch (err) {
        if (cancelled) return;
        console.log('get_my_pass error:', err.message);
        setMyPass(null);
        setMyPassReason('not_available');
      } finally {
        if (!cancelled) setLoadingMyPass(false);
      }
    })();
    return () => { cancelled = true; };
  }, [event?.id]);

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
    if (!myPass?.passCode) return;
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
        identifier: myPass.passCode,
        latitude: myPass.venueLat,
        longitude: myPass.venueLng,
        radius: 300,
        notifyOnEnter: true,
        notifyOnExit: false,
      }]);
      setGeofenceEnabled(true);
    } catch (err) {
      showAlert('Could not enable auto check-in', err.message);
    } finally {
      setGeofenceBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title="Invite" />
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.accent} />
      </SafeAreaView>
    );
  }

  if (loadError || !event) {
    return (
      <SafeAreaView style={[s.container, s.centerBox]}>
        <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title="Invite" />
        <Text style={s.errorIcon}>😕</Text>
        <Text style={s.errorTitle}>Invite not found</Text>
        <Text style={s.errorSub}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  const eventDate = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const eventTime = formatTimeRangeLabel(event.event_time, event.event_duration_hours);
  const rsvpStatus = event.invitee?.rsvp_status;
  const hasResponded = rsvpStatus && rsvpStatus !== 'pending';

  const designPage = event.inviteDesign?.pages?.[0] || null;
  const designColors = event.inviteDesign
    ? resolveInviteDesignColors(event.inviteDesign.template_id, event.inviteDesign.variant)
    : null;

  return (
    <SafeAreaView style={s.container}>
      <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title={event.name || 'Invite'} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {event.is_cancelled ? (
          <View style={s.cancelledBanner}>
            <Text style={s.cancelledBannerText}>
              This event has been cancelled{event.cancellation_reason ? ` — ${event.cancellation_reason}` : ''}.
            </Text>
          </View>
        ) : null}

        {designPage && designColors ? (
          <InviteCardPreview page={designPage} colors={designColors} />
        ) : (
          <View style={s.fallbackCard}>
            <Text style={s.fallbackEmoji}>🎉</Text>
            <Text style={s.fallbackTitle}>{event.name}</Text>
          </View>
        )}

        <View style={s.detailsBox}>
          {eventDate ? <Text style={s.detailRow}>📅  {eventDate}</Text> : null}
          {eventTime ? <Text style={s.detailRow}>🕐  {eventTime}</Text> : null}
          {event.venue ? (
            <TouchableOpacity onPress={() => Linking.openURL(googleMapsUrl(event.venue))}>
              <Text style={s.detailRow}>📍  {event.venue}</Text>
              <Text style={s.mapLink}>View on Google Maps ›</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={s.rsvpRow}>
          <Text style={s.rsvpStatusText}>{RSVP_LABELS[rsvpStatus] || RSVP_LABELS.pending}</Text>
          {!event.is_cancelled ? (
            <TouchableOpacity
              style={s.editRsvpBtn}
              onPress={() => navigation.navigate('RSVP', { inviteCode, guestId })}
            >
              <Text style={s.editRsvpBtnText}>{hasResponded ? 'Edit RSVP' : 'RSVP now'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Check-in — mirrors GuestAccess.js's own geofencing section, keyed
            off the event we already have instead of a second code entry.
            Silently a note instead of a toggle when this event has no gate
            pass set up for this guest (see the "no check-in" decision). */}
        <View style={s.checkinBox}>
          <Text style={s.checkinTitle}>Check-in</Text>
          {loadingMyPass ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} />
          ) : myPass?.passCode && myPass.status !== 'checked_in' ? (
            <>
              <View style={s.qrWrap}>
                <SvgXml xml={qrSvgFor(myPass.passCode)} width={150} height={150} />
                <Text style={s.passCode}>{myPass.passCode}</Text>
              </View>
              <View style={s.geofenceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.geofenceTitle}>Auto check-in on arrival</Text>
                  <Text style={s.geofenceSub}>
                    Utsav will check you in automatically when you arrive near the venue — no need to find a guard or scan your code.
                  </Text>
                </View>
                {geofenceBusy ? <ActivityIndicator color={theme.accent} /> : (
                  <Switch value={geofenceEnabled} onValueChange={handleToggleGeofence} />
                )}
              </View>
            </>
          ) : myPass?.status === 'checked_in' ? (
            <Text style={s.checkedInText}>
              ✓ You're checked in{myPass.arrivedCount > 1 ? ` · ${myPass.arrivedCount} arrived` : ''}
            </Text>
          ) : (
            <Text style={s.checkinNote}>Check-in isn't set up for this event yet.</Text>
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centerBox: { alignItems: 'center' },
    scroll: { padding: 20, paddingBottom: 40 },

    errorIcon: { fontSize: 44, marginTop: 40, marginBottom: 14, textAlign: 'center' },
    errorTitle: { fontSize: 19, fontWeight: '700', color: theme.text, marginBottom: 8, textAlign: 'center' },
    errorSub: { fontSize: 13.5, color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 24 },

    cancelledBanner: {
      backgroundColor: theme.statusDeclinedText + '18', borderRadius: 14, borderWidth: 1, borderColor: theme.statusDeclinedText,
      padding: 14, marginBottom: 16,
    },
    cancelledBannerText: { fontSize: 13, fontWeight: '700', color: theme.statusDeclinedText, textAlign: 'center' },

    fallbackCard: {
      backgroundColor: theme.cardBg, borderRadius: 20, borderWidth: 0.5, borderColor: theme.border,
      paddingVertical: 40, alignItems: 'center', marginBottom: 16,
    },
    fallbackEmoji: { fontSize: 40, marginBottom: 10 },
    fallbackTitle: { fontSize: 20, fontWeight: '700', color: theme.text, textAlign: 'center' },

    detailsBox: {
      backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border,
      padding: 16, marginTop: 16, gap: 8,
    },
    detailRow: { fontSize: 14, fontWeight: '600', color: theme.text },
    mapLink: { fontSize: 12.5, color: theme.accent, fontWeight: '700', marginTop: 2 },

    rsvpRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 16, backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border,
      padding: 16,
    },
    rsvpStatusText: { fontSize: 14, fontWeight: '700', color: theme.text, flex: 1 },
    editRsvpBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
    editRsvpBtnText: { color: theme.btnPrimaryText, fontSize: 13, fontWeight: '700' },

    checkinBox: {
      marginTop: 16, backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border,
      padding: 16,
    },
    checkinTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text, marginBottom: 10 },
    checkinNote: { fontSize: 13, color: theme.textSecondary },
    checkedInText: { fontSize: 13.5, fontWeight: '700', color: '#4CAF50' },
    qrWrap: { alignItems: 'center', marginBottom: 14 },
    passCode: { fontSize: 16, fontWeight: '800', letterSpacing: 3, color: theme.text, marginTop: 10, fontFamily: 'Courier' },
    geofenceRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    geofenceTitle: { fontSize: 13.5, fontWeight: '700', color: theme.text, marginBottom: 3 },
    geofenceSub: { fontSize: 11.5, color: theme.textSecondary, lineHeight: 16 },
  });
}
