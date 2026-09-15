import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Platform, Linking, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode-svg';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert, resolveGuestPartySize, toWhatsappNumber } from '../../helpers';
import { insertGuestPassesWithRetry } from '../../lib/capabilities';
import { useEventContext } from '../../hooks/useEventContext';
import { PUBLIC_WEB_URL } from '../../config';
import AppHeader from '../../components/AppHeader';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import { useEventShellData } from '../../hooks/useEventShellData';
import { StatCard, SectionEyebrow } from '../../components/desktop/DesktopKit';
import { MAROON, WAIT, CARD, LINE, TEXT, MUTED } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

function qrSvgFor(passCode) {
  const raw = new QRCode({ content: `${PUBLIC_WEB_URL}/p/${passCode}`, width: 96, height: 96, padding: 4, color: '#000000', background: '#ffffff', ecl: 'M' }).svg();
  return raw.replace(/^<\?xml[^>]*\?>\s*/, '');
}

// Issues one gate pass per guest who doesn't already have one — idempotent,
// re-running only fills gaps (new guests added since the last run). Reached
// from GatePass.js's "Issue passes" action.
//
// "there should be a send button below the generated QR code that opens
// whatsapp and share the QR code with the address details and whom to show
// this qr code" — this screen used to ONLY handle the bulk-issue step and
// had no way to see or send an already-issued guest's pass at all (the one
// place that could do that, sendPassToGuest() in GuestList.js, is buried in
// a guest's detail popup AND explicitly refuses to run on web). So this now
// also lists every guest who already has a pass, with their real QR and a
// "Send via WhatsApp" button, right here — and it works the same in a
// browser as in the app, via a wa.me link to this guest's own public pass
// page (/p/<code>, already served by GuestPassScreen.js) rather than an
// attached image, so there's no ViewShot/ClipboardAPI dependency at all.
export default function PassIssue({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { event, context, update } = useEventContext(eventId);
  const { guestCount, currentUserName } = useEventShellData(eventId);

  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [guests, setGuests] = useState([]);
  const [passes, setPasses] = useState([]);

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    try {
      setLoading(true);
      // entry_type/household_size may not exist yet on this database (see
      // supabase/migrations/household_entries.sql — printed, not applied
      // automatically). Retry without them rather than block pass issuing
      // over columns that are still pending.
      let { data: guestRows, error: guestErr } = await supabase.from('event_invitees')
        .select('id, name, phone, plus_ones, entry_type, household_size, rsvp_status').eq('event_id', eventId).neq('rsvp_status', 'no');
      if (guestErr) {
        ({ data: guestRows, error: guestErr } = await supabase.from('event_invitees')
          .select('id, name, phone, plus_ones, rsvp_status').eq('event_id', eventId).neq('rsvp_status', 'no'));
      }
      if (guestErr) throw guestErr;
      const { data: passRows, error: passErr } = await supabase.from('guest_passes').select('id, guest_id, pass_code, status, arrived_count').eq('event_id', eventId);
      if (passErr) throw passErr;
      setGuests(guestRows || []);
      setPasses(passRows || []);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  const passByGuestId = new Map(passes.map(p => [p.guest_id, p]));
  const issuedGuestIds = new Set(passes.map(p => p.guest_id));
  const missingGuests = guests.filter(g => !issuedGuestIds.has(g.id));
  const issuedGuests = guests.filter(g => issuedGuestIds.has(g.id));

  async function issueMissing() {
    if (missingGuests.length === 0) {
      showAlert('All caught up', 'Every guest already has a pass.');
      return;
    }
    setIssuing(true);
    try {
      const existingCodes = passes.map(p => p.pass_code);
      const baseRows = missingGuests.map(guest => ({
        event_id: eventId,
        guest_id: guest.id,
        party_size: resolveGuestPartySize(guest),
      }));
      const { rows, error } = await insertGuestPassesWithRetry(supabase, baseRows, existingCodes);
      if (error) throw error;

      if (!event?.gate_pass_issued_at) {
        await update({ gate_pass_issued_at: new Date().toISOString() });
      }

      showAlert('Passes issued', `${rows.length} pass${rows.length === 1 ? '' : 'es'} created.`);
      await load();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setIssuing(false);
    }
  }

  // Text-only, same wa.me pattern GuestList.js's sendWhatsappTo() uses for
  // invites — a link to the guest's own pass page, not an attached image,
  // so this works identically on the phone app, mobile browser, and
  // desktop browser (no capture/share/clipboard step to fail on any of
  // them). GuestPassScreen.js renders the actual QR when the guest (or the
  // guard, over the guest's shoulder) opens the link.
  function sendPassWhatsapp(guest, pass) {
    const number = toWhatsappNumber(guest.phone);
    if (!number) {
      showAlert('No phone number', `${guest.name} doesn't have a valid phone number saved.`);
      return;
    }
    const venueLabel = context?.venue?.isSet
      ? (context.venue.societyName ? `${context.venue.flatNumber ? context.venue.flatNumber + ', ' : ''}${context.venue.societyName}` : context.venue.label)
      : (event?.venue || null);
    const venueAddress = context?.venue?.isSet ? context.venue.address : null;
    const passUrl = `${PUBLIC_WEB_URL}/p/${pass.pass_code}`;
    const lines = [
      `Dear ${guest.name} Ji,`,
      `Here's your entry pass${context?.dateLabel ? ` for ${context.dateLabel}` : ''}.`,
      venueLabel ? `📍 ${venueLabel}` : null,
      venueAddress || null,
      `🔒 Pass code: ${pass.pass_code}`,
      `Show this at the gate — either the code above, or open this link to show your QR code: ${passUrl}`,
    ].filter(Boolean);
    const url = `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
    Linking.openURL(url).catch(() => {
      showAlert('Could not open WhatsApp', 'Make sure WhatsApp is installed.');
    });
  }

  const issuedListEl = issuedGuests.length > 0 ? (
    <View style={{ marginTop: 20 }}>
      <Text style={s.sectionTitle}>Already issued</Text>
      {issuedGuests.map(item => {
        const pass = passByGuestId.get(item.id);
        if (!pass) return null;
        return (
          <View key={item.id} style={s.passRow}>
            <SvgXml xml={qrSvgFor(pass.pass_code)} width={64} height={64} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.guestName}>{item.name}</Text>
              <Text style={s.passCodeText}>{pass.pass_code}</Text>
              {pass.status === 'checked_in' ? (
                <Text style={s.checkedInText}>✓ Checked in{pass.arrived_count > 1 ? ` · ${pass.arrived_count} arrived` : ''}</Text>
              ) : null}
              <TouchableOpacity style={s.sendBtn} onPress={() => sendPassWhatsapp(item, pass)}>
                <Text style={s.sendBtnText}>💬 Send via WhatsApp</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  ) : null;

  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="gatepasses" event={event} guestCount={guestCount} currentUserName={currentUserName} navigation={navigation}>
        <View style={ds.headerRow}>
          <View>
            <SectionEyebrow>ENTRY MANAGEMENT</SectionEyebrow>
            <Text style={ds.title}>Issue passes</Text>
          </View>
          <TouchableOpacity
            style={[ds.primaryBtn, missingGuests.length === 0 && { opacity: 0.5 }]}
            onPress={issueMissing}
            disabled={issuing || missingGuests.length === 0}
          >
            {issuing ? <ActivityIndicator color="#fff" /> : (
              <Text style={ds.primaryBtnText}>
                {missingGuests.length === 0 ? 'All passes issued' : `Issue ${missingGuests.length} pass${missingGuests.length === 1 ? '' : 'es'}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : (
          <>
            <View style={ds.statsRow}>
              <StatCard value={passes.length} label="ALREADY ISSUED" color={MAROON} />
              <StatCard value={missingGuests.length} label="STILL TO ISSUE" color={WAIT} />
            </View>

            {missingGuests.length === 0 && issuedGuests.length === 0 ? (
              <View style={ds.emptyCard}><Text style={ds.emptyText}>No guests to issue passes for yet.</Text></View>
            ) : (
              <>
                {missingGuests.length > 0 ? (
                  <View style={ds.grid}>
                    {missingGuests.map(item => (
                      <View key={item.id} style={ds.guestRow}>
                        <Text style={ds.guestName}>{item.name}</Text>
                        {item.entry_type === 'household' ? (
                          <Text style={ds.guestMeta}>🏠 {item.household_size || 1} people</Text>
                        ) : item.plus_ones > 0 ? <Text style={ds.guestMeta}>+{item.plus_ones}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}
                {issuedGuests.length > 0 ? (
                  <View style={{ marginTop: 24 }}>
                    <SectionEyebrow>ALREADY ISSUED</SectionEyebrow>
                    <View style={ds.issuedGrid}>
                      {issuedGuests.map(item => {
                        const pass = passByGuestId.get(item.id);
                        if (!pass) return null;
                        return (
                          <View key={item.id} style={ds.issuedCard}>
                            <SvgXml xml={qrSvgFor(pass.pass_code)} width={72} height={72} />
                            <Text style={ds.guestName}>{item.name}</Text>
                            <Text style={ds.passCode}>{pass.pass_code}</Text>
                            {pass.status === 'checked_in' ? (
                              <Text style={ds.checkedIn}>✓ Checked in{pass.arrived_count > 1 ? ` · ${pass.arrived_count} arrived` : ''}</Text>
                            ) : null}
                            <TouchableOpacity style={ds.sendBtn} onPress={() => sendPassWhatsapp(item, pass)}>
                              <Text style={ds.sendBtnText}>💬 Send via WhatsApp</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </>
        )}
      </DesktopEventShell>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Issue passes" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{passes.length}</Text>
              <Text style={s.statLabel}>Already issued</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{missingGuests.length}</Text>
              <Text style={s.statLabel}>Still to issue</Text>
            </View>
          </View>

          <FlatList
            data={missingGuests}
            keyExtractor={g => g.id}
            contentContainerStyle={s.list}
            ListEmptyComponent={missingGuests.length === 0 && issuedGuests.length === 0 ? <Text style={s.emptyText}>No guests to issue passes for yet.</Text> : null}
            ListFooterComponent={issuedListEl}
            renderItem={({ item }) => (
              <View style={s.guestRow}>
                <Text style={s.guestName}>{item.name}</Text>
                {item.entry_type === 'household' ? (
                  <Text style={s.guestMeta}>🏠 {item.household_size || 1} people</Text>
                ) : item.plus_ones > 0 ? <Text style={s.guestMeta}>+{item.plus_ones}</Text> : null}
              </View>
            )}
          />

          <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
            <TouchableOpacity
              style={[s.primaryBtn, missingGuests.length === 0 && s.btnDisabled]}
              onPress={issueMissing}
              disabled={issuing || missingGuests.length === 0}
            >
              {issuing ? <ActivityIndicator color={theme.btnPrimaryText} /> : (
                <Text style={s.primaryBtnText}>
                  {missingGuests.length === 0 ? 'All passes issued' : `Issue ${missingGuests.length} pass${missingGuests.length === 1 ? '' : 'es'}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
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

    statsRow: { flexDirection: 'row', gap: 10, padding: 16 },
    statCard: { flex: 1, alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, paddingVertical: 14, borderWidth: 0.5, borderColor: theme.border },
    statValue: { fontSize: 20, fontWeight: '800', color: theme.text },
    statLabel: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },

    list: { paddingHorizontal: 16, paddingBottom: 100 },
    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingVertical: 30 },
    guestRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: theme.cardBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    },
    guestName: { fontSize: 14, fontWeight: '600', color: theme.text },
    guestMeta: { fontSize: 12, color: theme.textSecondary },

    sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    passRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      padding: 12, marginBottom: 10,
    },
    passCodeText: { fontSize: 12.5, color: theme.textSecondary, fontFamily: 'Courier', letterSpacing: 1, marginTop: 2 },
    checkedInText: { fontSize: 12, fontWeight: '700', color: '#4CAF50', marginTop: 4 },
    sendBtn: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#25D366', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    sendBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
    btnDisabled: { opacity: 0.5 },
  });
}

const ds = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginTop: 2 },
  primaryBtn: { backgroundColor: MAROON, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13 },
  primaryBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 24, maxWidth: 440 },
  emptyCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 40, alignItems: 'center', maxWidth: 480, alignSelf: 'center' },
  emptyText: { fontSize: 13.5, color: MUTED },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  guestRow: { width: 260, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: LINE, paddingHorizontal: 14, paddingVertical: 12 },
  guestName: { fontSize: 13.5, fontWeight: '600', color: TEXT },
  guestMeta: { fontSize: 12, color: MUTED },

  issuedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  issuedCard: { width: 200, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 16, alignItems: 'center' },
  passCode: { fontSize: 12, color: MUTED, fontFamily: 'Courier', letterSpacing: 1, marginTop: 8 },
  checkedIn: { fontSize: 11.5, fontWeight: '700', color: '#4CAF50', marginTop: 6, textAlign: 'center' },
  sendBtn: { marginTop: 12, backgroundColor: '#25D366', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, width: '100%', alignItems: 'center' },
  sendBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
});
