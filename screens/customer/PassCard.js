import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ArrowLeft } from 'phosphor-react-native';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { buildPassCardHtml } from '../../gatePassTemplate';
import { useEventContext } from '../../hooks/useEventContext';
import { PUBLIC_WEB_URL } from '../../config';
import AppHeader from '../../components/AppHeader';

// 'utsav.app' isn't a real domain this project owns (see linking.js) — was
// previously baked in here uncorrected, meaning every printed/shared pass's
// QR code led nowhere. GuestPassScreen.js now actually serves this route.
const PASS_URL_BASE = `${PUBLIC_WEB_URL}/p/`;

function qrSvgFor(passCode) {
  const raw = new QRCode({ content: `${PASS_URL_BASE}${passCode}`, width: 160, height: 160, padding: 4, color: '#000000', background: '#ffffff', ecl: 'M' }).svg();
  return raw.replace(/^<\?xml[^>]*\?>\s*/, '');
}

// Renders one guest's pass. The pass must be fully legible with the QR
// covered — a society guard usually reads it aloud rather than scans it —
// so the render order below (name, then where, then when, then code, then
// QR) matches gatePassTemplate.js's buildPassCardHtml() print layout
// exactly; this screen is the on-device preview of that same hierarchy.
export default function PassCard({ route, navigation }) {
  const { eventId, passId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { context, event: eventRow } = useEventContext(eventId);

  const [pass, setPass] = useState(null);
  const [guest, setGuest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { load(); }, [passId]);

  async function load() {
    try {
      setLoading(true);
      const { data: passRow, error: passErr } = await supabase.from('guest_passes').select('*').eq('id', passId).single();
      if (passErr) throw passErr;
      setPass(passRow);

      if (passRow.guest_id) {
        const { data: guestRow } = await supabase.from('event_invitees').select('name, phone').eq('id', passRow.guest_id).maybeSingle();
        setGuest(guestRow || null);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  const qrSvgString = useMemo(() => (pass ? qrSvgFor(pass.pass_code) : ''), [pass?.pass_code]);

  const venueLabel = context?.venue?.isSet
    ? (context.venue.societyName ? `${context.venue.flatNumber ? context.venue.flatNumber + ', ' : ''}${context.venue.societyName}` : context.venue.label)
    : null;
  const venueAddress = context?.venue?.isSet ? context.venue.address : null;
  const entryWindow = eventRow?.entry_start_time || eventRow?.entry_end_time
    ? `${eventRow.entry_start_time || '—'} to ${eventRow.entry_end_time || '—'}`
    : null;

  async function share() {
    if (!pass || !guest) return;
    setSharing(true);
    try {
      const html = buildPassCardHtml({
        guestName: guest.name,
        partySize: pass.party_size || 1,
        venueLabel,
        venueAddress,
        dateLabel: context?.dateLabel,
        entryWindow,
        passCode: pass.pass_code,
        qrSvgString,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${guest.name}'s pass`, UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Saved', 'Pass created.');
      }
    } catch (err) {
      showAlert('Error', err.message || 'Could not create the pass.');
    } finally {
      setSharing(false);
    }
  }

  if (loading || !pass) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Gate pass" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <View style={s.scroll}>
        <View style={s.card}>
          <Text style={s.guestName}>{guest?.name || 'Guest'}</Text>
          {pass.party_size > 1 ? <Text style={s.partySize}>Party of {pass.party_size}</Text> : null}
          {venueLabel ? <Text style={s.where}>{venueLabel}</Text> : null}
          {venueAddress ? <Text style={s.whereSub}>{venueAddress}</Text> : null}
          {context?.dateLabel ? (
            <Text style={s.when}>{context.dateLabel}{entryWindow ? ` · ${entryWindow}` : ''}</Text>
          ) : null}
          <Text style={s.code}>{pass.pass_code}</Text>
          <View style={s.qrBox}>
            <SvgXml xml={qrSvgString} width={160} height={160} />
          </View>
          {pass.status === 'checked_in' ? (
            <Text style={s.checkedInBadge}>✓ Checked in{pass.arrived_count > 1 ? ` · ${pass.arrived_count} arrived` : ''}</Text>
          ) : null}
        </View>
      </View>

      <View style={s.bottomBar}>
        <TouchableOpacity style={s.primaryBtn} onPress={share} disabled={sharing}>
          {sharing ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Share pass</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    backBtn: { padding: 4 },

    scroll: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
    card: {
      backgroundColor: theme.cardBg, borderRadius: 20, borderWidth: 1, borderColor: theme.accent,
      paddingVertical: 30, paddingHorizontal: 24, alignItems: 'center', width: '100%', maxWidth: 380,
    },
    guestName: { fontSize: 26, fontWeight: '800', color: theme.text, textAlign: 'center' },
    partySize: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginTop: 4 },
    where: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 14, textAlign: 'center' },
    whereSub: { fontSize: 13, color: theme.textSecondary, marginTop: 2, textAlign: 'center' },
    when: { fontSize: 14, color: theme.textSecondary, marginTop: 10, textAlign: 'center' },
    code: { fontSize: 22, fontWeight: '800', letterSpacing: 4, color: theme.text, marginTop: 16, fontFamily: 'Courier' },
    qrBox: { marginTop: 18, backgroundColor: '#fff', padding: 10, borderRadius: 12 },
    checkedInBadge: { fontSize: 13, fontWeight: '700', color: '#4CAF50', marginTop: 16 },

    bottomBar: { padding: 16, borderTopWidth: 0.5, borderTopColor: theme.border },
    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
  });
}
