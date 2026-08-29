import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Share, Platform, KeyboardAvoidingView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft } from 'phosphor-react-native';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert } from '../../helpers';
import { buildVisitorListText, buildVisitorListPdfHtml } from '../../visitorListTemplate';
import { useEventCapabilities } from '../../hooks/useEventCapabilities';
import { useEventContext } from '../../hooks/useEventContext';
import { isEnabled } from '../../lib/capabilities';
import CapabilityBlocked from '../../components/CapabilityBlocked';
import AppHeader from '../../components/AppHeader';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import { useEventShellData } from '../../hooks/useEventShellData';
import { StatCard, WarmInput, SectionEyebrow } from '../../components/desktop/DesktopKit';
import { MAROON, WAIT, CARD, LINE, TEXT, MUTED, CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

const INCLUDE_OPTIONS = [
  { key: 'confirmed', label: 'Confirmed only' },
  { key: 'confirmed_pending', label: 'Confirmed + pending' },
  { key: 'everyone', label: 'Everyone' },
];

function formatEventDate(dateStr) {
  if (!dateStr) return 'Date TBD';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function VisitorList({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { guestCount, currentUserName } = useEventShellData(eventId);

  const { event, update, loading: eventLoading, error: eventError } = useEventContext(eventId);

  const [guests, setGuests] = useState([]);
  const [loadingGuests, setLoadingGuests] = useState(true);
  const [host, setHost] = useState(null);

  // society_name/flat_number/venue(existing column)/entry_start_time/
  // entry_end_time/guard_phone all live on the events row, sourced through
  // the shared useEventContext hook instead of a route-passed object — the
  // form still needs its own local state while the host types (a controlled
  // TextInput can't read straight from the shared cache), but it's seeded
  // once from the real event row (detailsSeeded guards against later
  // live-refreshes from other screens wiping mid-edit input).
  const [societyName, setSocietyName] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [entryStart, setEntryStart] = useState('');
  const [entryEnd, setEntryEnd] = useState('');
  const [guardPhone, setGuardPhone] = useState('');
  const [editingDetails, setEditingDetails] = useState(true);
  const [detailsSeeded, setDetailsSeeded] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  const [includeFilter, setIncludeFilter] = useState('confirmed');
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (event && !detailsSeeded) {
      setSocietyName(event.society_name || '');
      setFlatNumber(event.flat_number || '');
      setVenueAddress(event.venue || '');
      setEntryStart(event.entry_start_time || '');
      setEntryEnd(event.entry_end_time || '');
      setGuardPhone(event.guard_phone || '');
      setEditingDetails(!(event.society_name?.trim() && event.flat_number?.trim()));
      setDetailsSeeded(true);
    }
  }, [event, detailsSeeded]);

  useEffect(() => { if (eventId) fetchGuests(); }, [eventId]);
  useEffect(() => { if (event?.host_id) fetchHost(event.host_id); }, [event?.host_id]);

  async function fetchGuests() {
    try {
      setLoadingGuests(true);
      const { data, error } = await supabase
        .from('event_invitees').select('id, name, phone, rsvp_status').eq('event_id', eventId);
      if (error) throw error;
      setGuests(data || []);
    } catch (err) {
      console.log('fetchGuests error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setLoadingGuests(false);
    }
  }

  async function fetchHost(hostId) {
    try {
      const { data, error } = await supabase.from('users').select('name, phone').eq('id', hostId).maybeSingle();
      if (error) throw error;
      setHost(data || null);
    } catch (err) {
      console.log('fetchHost error:', err.message);
    }
  }

  const detailsComplete = !!(societyName.trim() && flatNumber.trim());

  async function saveSocietyDetails() {
    if (!detailsComplete) {
      showAlert('Required', 'Society name and flat number are required.');
      return;
    }
    setSavingDetails(true);
    try {
      await update({
        society_name: societyName.trim(),
        flat_number: flatNumber.trim(),
        venue: venueAddress.trim() || null,
        entry_start_time: entryStart.trim() || null,
        entry_end_time: entryEnd.trim() || null,
        guard_phone: guardPhone.trim() || null,
      });
      setEditingDetails(false);
    } catch (err) {
      console.log('saveSocietyDetails error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setSavingDetails(false);
    }
  }

  const confirmedCount = guests.filter(g => g.rsvp_status === 'yes').length;
  const pendingCount = guests.filter(g => g.rsvp_status === 'pending').length;

  const filteredGuests = useMemo(() => {
    if (includeFilter === 'confirmed') return guests.filter(g => g.rsvp_status === 'yes');
    if (includeFilter === 'confirmed_pending') return guests.filter(g => g.rsvp_status === 'yes' || g.rsvp_status === 'pending');
    return guests;
  }, [guests, includeFilter]);

  const previewText = useMemo(() => buildVisitorListText({
    eventName: event.name,
    eventDate: formatEventDate(event.event_date),
    societyName,
    flatNumber,
    entryStartTime: entryStart,
    entryEndTime: entryEnd,
    guests: filteredGuests,
    hostName: host?.name || '',
    hostPhone: host?.phone || '',
  }), [event, societyName, flatNumber, entryStart, entryEnd, filteredGuests, host]);

  async function handleShareWhatsApp() {
    setSharing(true);
    try {
      await Share.share({ message: previewText });
    } catch (err) {
      console.log('handleShareWhatsApp error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyText() {
    setCopying(true);
    try {
      await Clipboard.setStringAsync(previewText);
      showAlert('Copied', 'Visitor list copied — paste it anywhere to send.');
    } catch (err) {
      console.log('handleCopyText error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setCopying(false);
    }
  }

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const html = buildVisitorListPdfHtml({
        eventName: event.name,
        eventDate: formatEventDate(event.event_date),
        societyName,
        flatNumber,
        venueAddress,
        entryStartTime: entryStart,
        entryEndTime: entryEnd,
        guests: filteredGuests,
        hostName: host?.name || '',
        hostPhone: host?.phone || '',
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Visitor list', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Saved', 'Visitor list PDF created.');
      }
    } catch (err) {
      console.log('handleDownloadPdf error:', err.message);
      showAlert('Error', err.message || 'Could not generate the PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  const actionsDisabled = !detailsComplete || loadingGuests;

  const capabilities = useEventCapabilities(eventId);

  if (eventLoading && !event) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }
  if (eventError || !event) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={[s.cardHint, { textAlign: 'center', marginTop: 40 }]}>{eventError || "This event couldn't be found."}</Text>
      </SafeAreaView>
    );
  }
  if (!capabilities.loading && !isEnabled(capabilities, 'society_gate_pass')) {
    return <CapabilityBlocked navigation={navigation} />;
  }

  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="gatepasses" event={event} guestCount={guestCount} currentUserName={currentUserName} navigation={navigation}>
        <SectionEyebrow>ENTRY MANAGEMENT</SectionEyebrow>
        <Text style={ds.title}>Visitor list</Text>

        {guests.length > 0 && (
          <View style={ds.statsRow}>
            <StatCard value={confirmedCount} label="CONFIRMED" color={MAROON} />
            <StatCard value={pendingCount} label="PENDING" color={WAIT} />
            <StatCard value={guests.length} label="TOTAL" color={MUTED} />
          </View>
        )}

        <View style={ds.twoPane}>
          {/* ── Form pane ── */}
          <View style={ds.formPane}>
            <View style={ds.formCard}>
              <Text style={ds.cardTitle}>Society details</Text>
              <Text style={ds.cardHint}>Fill this in once — it's saved on this event and reused every time you generate a list.</Text>

              <Text style={ds.fieldLabel}>Society name *</Text>
              <WarmInput placeholder="e.g. Oberoi Springs" value={societyName} onChangeText={setSocietyName} />

              <Text style={ds.fieldLabel}>Flat number *</Text>
              <WarmInput placeholder="e.g. B-704" value={flatNumber} onChangeText={setFlatNumber} style={{ marginTop: 8 }} />

              <Text style={ds.fieldLabel}>Venue address (optional)</Text>
              <WarmInput placeholder="Full address for guests unfamiliar with the area" value={venueAddress} onChangeText={setVenueAddress} style={{ marginTop: 8 }} />

              <Text style={ds.fieldLabel}>Entry window (optional)</Text>
              <View style={[ds.rowGap, { marginTop: 8 }]}>
                <WarmInput placeholder="6:00 PM" value={entryStart} onChangeText={setEntryStart} style={{ flex: 1 }} />
                <Text style={ds.toText}>to</Text>
                <WarmInput placeholder="11:00 PM" value={entryEnd} onChangeText={setEntryEnd} style={{ flex: 1 }} />
              </View>

              <Text style={ds.fieldLabel}>Guard / RWA phone (optional)</Text>
              <WarmInput placeholder="Where the list gets sent" value={guardPhone} onChangeText={setGuardPhone} keyboardType="phone-pad" style={{ marginTop: 8 }} />

              <TouchableOpacity style={ds.saveBtn} onPress={saveSocietyDetails} disabled={savingDetails}>
                {savingDetails ? <ActivityIndicator color="#fff" /> : <Text style={ds.saveBtnText}>Save details</Text>}
              </TouchableOpacity>
            </View>

            {guests.length > 0 && (
              <View style={ds.formCard}>
                <Text style={ds.cardTitle}>Include on the list</Text>
                <View style={ds.chipsWrap}>
                  {INCLUDE_OPTIONS.map(opt => (
                    <TouchableOpacity key={opt.key} style={[ds.chip, includeFilter === opt.key && ds.chipActive]} onPress={() => setIncludeFilter(opt.key)}>
                      <Text style={[ds.chipText, includeFilter === opt.key && ds.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={[ds.saveBtn, actionsDisabled && { opacity: 0.5 }]} onPress={handleShareWhatsApp} disabled={actionsDisabled || sharing}>
                  {sharing ? <ActivityIndicator color="#fff" /> : <Text style={ds.saveBtnText}>Share on WhatsApp</Text>}
                </TouchableOpacity>
                <View style={ds.rowGap}>
                  <TouchableOpacity style={[ds.secondaryBtn, actionsDisabled && { opacity: 0.5 }]} onPress={handleCopyText} disabled={actionsDisabled || copying}>
                    {copying ? <ActivityIndicator color={TEXT} /> : <Text style={ds.secondaryBtnText}>Copy text</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[ds.secondaryBtn, actionsDisabled && { opacity: 0.5 }]} onPress={handleDownloadPdf} disabled={actionsDisabled || generatingPdf}>
                    {generatingPdf ? <ActivityIndicator color={TEXT} /> : <Text style={ds.secondaryBtnText}>Download PDF</Text>}
                  </TouchableOpacity>
                </View>
                {!detailsComplete && <Text style={ds.disabledHint}>Fill in society name and flat number above to enable sharing.</Text>}
              </View>
            )}
          </View>

          {/* ── Live preview pane ── */}
          <View style={ds.previewPane}>
            <Text style={ds.cardTitle}>Preview — exactly what gets sent</Text>
            <ScrollView style={ds.previewBox}>
              <Text style={ds.previewText}>{previewText}</Text>
            </ScrollView>
          </View>
        </View>
      </DesktopEventShell>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Visitor list" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* ── Society details ── */}
        {editingDetails ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Society details</Text>
            <Text style={s.cardHint}>Fill this in once — it's saved on this event and reused every time you generate a list.</Text>

            <Text style={s.fieldLabel}>Society name *</Text>
            <TextInput style={s.input} placeholder="e.g. Oberoi Springs" placeholderTextColor={theme.textTertiary} value={societyName} onChangeText={setSocietyName} />

            <Text style={s.fieldLabel}>Flat number *</Text>
            <TextInput style={s.input} placeholder="e.g. B-704" placeholderTextColor={theme.textTertiary} value={flatNumber} onChangeText={setFlatNumber} />

            <Text style={s.fieldLabel}>Venue address (optional)</Text>
            <TextInput style={s.input} placeholder="Full address for guests unfamiliar with the area" placeholderTextColor={theme.textTertiary} value={venueAddress} onChangeText={setVenueAddress} />

            <Text style={s.fieldLabel}>Entry window (optional)</Text>
            <View style={s.rowGap}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="6:00 PM" placeholderTextColor={theme.textTertiary} value={entryStart} onChangeText={setEntryStart} />
              <Text style={s.toText}>to</Text>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="11:00 PM" placeholderTextColor={theme.textTertiary} value={entryEnd} onChangeText={setEntryEnd} />
            </View>

            <Text style={s.fieldLabel}>Guard / RWA phone (optional)</Text>
            <TextInput style={s.input} placeholder="Where the list gets sent" placeholderTextColor={theme.textTertiary} value={guardPhone} onChangeText={setGuardPhone} keyboardType="phone-pad" />

            <TouchableOpacity style={s.saveBtn} onPress={saveSocietyDetails} disabled={savingDetails}>
              {savingDetails ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.saveBtnText}>Save details</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.card}>
            <View style={s.summaryRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{flatNumber}, {societyName}</Text>
                {venueAddress ? <Text style={s.cardHint}>{venueAddress}</Text> : null}
                {(entryStart || entryEnd) ? (
                  <Text style={s.cardHint}>Entry: {entryStart || '—'} to {entryEnd || '—'}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setEditingDetails(true)}>
                <Text style={s.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loadingGuests ? (
          <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 30 }} />
        ) : guests.length === 0 ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>No guests yet</Text>
            <Text style={s.cardHint}>Add guests from the Guest List screen first — the visitor list is built from your guest list's names and phone numbers.</Text>
          </View>
        ) : (
          <>
            {/* ── Guest summary ── */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statValue}>{confirmedCount}</Text>
                <Text style={s.statLabel}>Confirmed</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statValue}>{pendingCount}</Text>
                <Text style={s.statLabel}>Pending</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statValue}>{guests.length}</Text>
                <Text style={s.statLabel}>Total</Text>
              </View>
            </View>

            {/* ── Include selector ── */}
            <View>
              <Text style={s.sectionLabel}>Include on the list</Text>
              <View style={s.chipsWrap}>
                {INCLUDE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.chip, includeFilter === opt.key && s.chipActive]}
                    onPress={() => setIncludeFilter(opt.key)}
                  >
                    <Text style={[s.chipText, includeFilter === opt.key && s.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Preview ── */}
            <View>
              <Text style={s.sectionLabel}>Preview — exactly what gets sent</Text>
              <ScrollView style={s.previewBox} nestedScrollEnabled>
                <Text style={s.previewText}>{previewText}</Text>
              </ScrollView>
            </View>

            {/* ── Actions ── */}
            <TouchableOpacity style={[s.primaryBtn, actionsDisabled && s.btnDisabled]} onPress={handleShareWhatsApp} disabled={actionsDisabled || sharing}>
              {sharing ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Share on WhatsApp</Text>}
            </TouchableOpacity>
            <View style={s.rowGap}>
              <TouchableOpacity style={[s.secondaryBtn, actionsDisabled && s.btnDisabled]} onPress={handleCopyText} disabled={actionsDisabled || copying}>
                {copying ? <ActivityIndicator color={theme.text} /> : <Text style={s.secondaryBtnText}>Copy text</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[s.secondaryBtn, actionsDisabled && s.btnDisabled]} onPress={handleDownloadPdf} disabled={actionsDisabled || generatingPdf}>
                {generatingPdf ? <ActivityIndicator color={theme.text} /> : <Text style={s.secondaryBtnText}>Download PDF</Text>}
              </TouchableOpacity>
            </View>
            {!detailsComplete && (
              <Text style={s.disabledHint}>Fill in society name and flat number above to enable sharing.</Text>
            )}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
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

    card: {
      backgroundColor: theme.cardBg, borderRadius: 14, padding: 16,
      borderWidth: 0.5, borderColor: theme.border,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    cardHint: { fontSize: 12.5, color: theme.textSecondary, marginTop: 4, lineHeight: 18 },
    summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    editLink: { fontSize: 13, fontWeight: '700', color: theme.accent },

    fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginTop: 14, marginBottom: 6 },
    input: {
      backgroundColor: theme.bgSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: theme.text, borderWidth: 0.5, borderColor: theme.border,
    },
    rowGap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    toText: { fontSize: 13, color: theme.textSecondary },

    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    saveBtnText: { fontSize: 14.5, fontWeight: '700', color: theme.btnPrimaryText },

    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: {
      flex: 1, alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, paddingVertical: 12,
      borderWidth: 0.5, borderColor: theme.border,
    },
    statValue: { fontSize: 18, fontWeight: '800', color: theme.text },
    statLabel: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },

    sectionLabel: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary, marginBottom: 10 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16,
      backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
    },
    chipActive: { backgroundColor: theme.accent + '18', borderColor: theme.accent },
    chipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
    chipTextActive: { color: theme.accent },

    previewBox: {
      backgroundColor: theme.bgTertiary, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      padding: 14, maxHeight: 280,
    },
    previewText: {
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      fontSize: 12.5, color: theme.text, lineHeight: 19,
    },

    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
    secondaryBtn: {
      flex: 1, backgroundColor: theme.cardBg, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
      borderWidth: 0.5, borderColor: theme.border,
    },
    secondaryBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    btnDisabled: { opacity: 0.5 },
    disabledHint: { fontSize: 12, color: theme.textSecondary, textAlign: 'center' },
  });
}

// Desktop: real form+preview two-pane reskin (same pattern as the invite
// designer), colours from lib/desktopTheme.js only.
const ds = StyleSheet.create({
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginTop: 2, marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 22, maxWidth: 640 },
  twoPane: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  formPane: { width: 420, gap: 16 },
  previewPane: { flex: 1, backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 20 },
  formCard: { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 18 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: TEXT, fontFamily: 'Manrope-SemiBold', marginBottom: 4 },
  cardHint: { fontSize: 12.5, color: MUTED, lineHeight: 18, marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: MUTED, marginTop: 12, marginBottom: 6 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toText: { fontSize: 13, color: MUTED },
  saveBtn: { backgroundColor: MAROON, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  secondaryBtn: { flex: 1, backgroundColor: CREAM, borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: LINE },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: TEXT },
  disabledHint: { fontSize: 11.5, color: MUTED, textAlign: 'center', marginTop: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, backgroundColor: CREAM, borderWidth: 1, borderColor: LINE },
  chipActive: { backgroundColor: MAROON, borderColor: MAROON },
  chipText: { fontSize: 12.5, fontWeight: '600', color: MUTED },
  chipTextActive: { color: '#fff' },
  previewBox: { maxHeight: 460 },
  previewText: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12.5, color: TEXT, lineHeight: 19 },
});
