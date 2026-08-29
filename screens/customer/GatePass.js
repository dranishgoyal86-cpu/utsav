import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ArrowLeft } from 'phosphor-react-native';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { isEnabled } from '../../lib/capabilities';
import { useEventCapabilities } from '../../hooks/useEventCapabilities';
import AppHeader from '../../components/AppHeader';
import { registerTourTarget } from '../../lib/tourTargets';
import { useTour } from '../../hooks/useTour';
import CoachMarkTour from '../../components/CoachMarkTour';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import { useEventShellData } from '../../hooks/useEventShellData';
import { SectionEyebrow } from '../../components/desktop/DesktopKit';
import { TEXT } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

// Deliberately just 2 steps, not padded to match other tours' step counts.
// Step 1's investigation found this screen's action area is a genuine
// 3-way capability branch (society_gate_pass / venue_attendance_qr /
// corporate_visitor_register) — each shows a different combination of
// buttons (3, 2, and 3 respectively, none identical), plus a 4th
// no-buttons-at-all state (no_entry_control) where there's nothing to
// spotlight at all. "Issue passes" and "Open scanner" are the only two
// buttons common to EVERY non-empty branch — a safe, always-correct
// 2-step tour beats a longer one that breaks for some real fraction of
// events. The engine's own "unmeasurable step gets skipped" behavior
// already handles no_entry_control gracefully (both steps skip, tour ends
// quietly via onSkip) — no extra branching needed here.
const GATEPASS_TOUR_STEPS = [
  {
    key: 'issue',
    target: 'gatepass-issue-btn',
    title: 'Issue gate passes',
    description: 'Generate QR passes for your guests — each one carries exactly what your gate needs to know.',
  },
  {
    key: 'scan',
    target: 'gatepass-scanner-btn',
    title: 'Scan guests in',
    description: "Open the scanner at the gate to check guests in as they arrive — no manual list-checking needed.",
  },
];

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// Entry point from the guest list. Branches entirely on entryControl's
// capability_key, resolved by lib/capabilities.js's group-exclusion pass —
// never on venueType directly, since that's exactly the hardcoding the
// capability rules exist to replace (a banquet hall wedding should never be
// able to show a society gate pass just because a screen guessed from
// venueType itself).
export default function GatePass({ route, navigation }) {
  const { eventId, forceTour } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { event, guestCount, currentUserName } = useEventShellData(eventId);
  const capabilities = useEventCapabilities(eventId);
  const entryControl = capabilities.entryControl;

  const [counts, setCounts] = useState({ issued: 0, checkedIn: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [exporting, setExporting] = useState(false);

  const gatePassTour = useTour('gatepass_intro');
  useEffect(() => {
    if (forceTour === 'gatepass_intro') {
      gatePassTour.forceRestart();
    } else if (gatePassTour.checked) {
      gatePassTour.startTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatePassTour.checked, forceTour]);
  // Same ref reused across all 3 capability branches' "Issue passes"/"Open
  // scanner" buttons below — only one branch ever actually mounts at a
  // time (capability_key is mutually exclusive), so there's no conflict.
  const issueBtnRef = useRef(null);
  const scannerBtnRef = useRef(null);
  useEffect(() => {
    registerTourTarget('gatepass-issue-btn', issueBtnRef);
    registerTourTarget('gatepass-scanner-btn', scannerBtnRef);
  }, []);

  useEffect(() => { loadCounts(); }, [eventId]);

  async function loadCounts() {
    try {
      setLoadingCounts(true);
      const { data, error } = await supabase.from('guest_passes').select('status').eq('event_id', eventId);
      if (error) throw error;
      const rows = data || [];
      setCounts({ issued: rows.length, checkedIn: rows.filter(r => r.status === 'checked_in').length });
    } catch (err) {
      console.log('GatePass loadCounts error:', err.message);
    } finally {
      setLoadingCounts(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const { data: passes, error } = await supabase
        .from('guest_passes').select('guest_id, pass_code, party_size, status, checked_in_at, arrived_count').eq('event_id', eventId);
      if (error) throw error;

      const guestIds = [...new Set((passes || []).map(p => p.guest_id).filter(Boolean))];
      let guestsById = {};
      if (guestIds.length > 0) {
        const { data: guests } = await supabase.from('event_invitees').select('id, name, phone').in('id', guestIds);
        (guests || []).forEach(g => { guestsById[g.id] = g; });
      }

      const header = ['Name', 'Phone', 'Pass code', 'Party size', 'Status', 'Checked in at', 'Arrived'];
      const rows = (passes || []).map(p => {
        const g = guestsById[p.guest_id] || {};
        return [g.name, g.phone, p.pass_code, p.party_size, p.status, p.checked_in_at, p.arrived_count].map(csvEscape).join(',');
      });
      const csv = [header.map(csvEscape).join(','), ...rows].join('\n');
      const fileUri = FileSystem.documentDirectory + `visitor-register-${eventId}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Visitor register export', UTI: 'public.comma-separated-values-text' });
      } else {
        showAlert('Saved', 'CSV file created.');
      }
    } catch (err) {
      showAlert('Error', err.message || 'Could not export CSV.');
    } finally {
      setExporting(false);
    }
  }

  const progressPct = counts.issued > 0 ? Math.round((counts.checkedIn / counts.issued) * 100) : 0;

  // Real 3-way capability branch (see this file's own top comment) --
  // shared between mobile and desktop rather than duplicated, same
  // "extract, don't duplicate" call as PlanView.js/BookingsScreen.js.
  const body = (
    <>
      {capabilities.loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : !entryControl || entryControl.capability_key === 'no_entry_control' ? (
        <View style={s.explainBox}>
          <Text style={s.explainIcon}>🚪</Text>
          <Text style={s.explainTitle}>No entry management needed</Text>
          <Text style={s.explainSub}>
            {entryControl?.description || "This venue doesn't need gate passes or a check-in scanner — there's no shared entrance to manage."}
          </Text>
        </View>
      ) : (
        <>
          {!loadingCounts && counts.issued > 0 && (
            <View style={s.progressCard}>
              <Text style={s.progressLabel}>{counts.checkedIn} of {counts.issued} arrived</Text>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${progressPct}%` }]} />
              </View>
            </View>
          )}

          {entryControl.capability_key === 'society_gate_pass' && (
            <View style={s.body}>
              <Text style={s.hint}>Each pass carries your society name and flat number, so the guard knows exactly who to expect and where they're headed.</Text>
              <TouchableOpacity ref={issueBtnRef} style={s.actionBtn} onPress={() => navigation.navigate('PassIssue', { eventId })}>
                <Text style={s.actionBtnIcon}>🎫</Text>
                <Text style={s.actionBtnText}>Issue passes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('VisitorList', { eventId })}>
                <Text style={s.actionBtnIcon}>📋</Text>
                <Text style={s.actionBtnText}>Share visitor list with the guard</Text>
              </TouchableOpacity>
              <TouchableOpacity ref={scannerBtnRef} style={s.actionBtn} onPress={() => navigation.navigate('PassScanner', { eventId })}>
                <Text style={s.actionBtnIcon}>📷</Text>
                <Text style={s.actionBtnText}>Open scanner</Text>
              </TouchableOpacity>
            </View>
          )}

          {entryControl.capability_key === 'venue_attendance_qr' && (
            <View style={s.body}>
              <Text style={s.hint}>The venue controls its own gate — these passes track who's actually arrived on your side.</Text>
              <TouchableOpacity ref={issueBtnRef} style={s.actionBtn} onPress={() => navigation.navigate('PassIssue', { eventId })}>
                <Text style={s.actionBtnIcon}>🎫</Text>
                <Text style={s.actionBtnText}>Issue passes</Text>
              </TouchableOpacity>
              <TouchableOpacity ref={scannerBtnRef} style={s.actionBtn} onPress={() => navigation.navigate('PassScanner', { eventId })}>
                <Text style={s.actionBtnIcon}>📷</Text>
                <Text style={s.actionBtnText}>Open scanner</Text>
              </TouchableOpacity>
            </View>
          )}

          {entryControl.capability_key === 'corporate_visitor_register' && (
            <View style={s.body}>
              <Text style={s.hint}>Issue a pass per attendee, scan them in at the door, then export the full sign-in register anytime.</Text>
              <TouchableOpacity ref={issueBtnRef} style={s.actionBtn} onPress={() => navigation.navigate('PassIssue', { eventId })}>
                <Text style={s.actionBtnIcon}>🎫</Text>
                <Text style={s.actionBtnText}>Issue passes</Text>
              </TouchableOpacity>
              <TouchableOpacity ref={scannerBtnRef} style={s.actionBtn} onPress={() => navigation.navigate('PassScanner', { eventId })}>
                <Text style={s.actionBtnIcon}>📷</Text>
                <Text style={s.actionBtnText}>Open scanner</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={exportCsv} disabled={exporting}>
                {exporting ? <ActivityIndicator color={theme.text} /> : (
                  <>
                    <Text style={s.actionBtnIcon}>📄</Text>
                    <Text style={s.actionBtnText}>Export visitor register (CSV)</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </>
  );

  const tourEl = (
    <CoachMarkTour
      visible={gatePassTour.isTourActive}
      steps={GATEPASS_TOUR_STEPS}
      onComplete={gatePassTour.markComplete}
      onSkip={gatePassTour.markComplete}
    />
  );

  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="gatepasses" event={event} guestCount={guestCount} currentUserName={currentUserName} navigation={navigation}>
        <SectionEyebrow>ENTRY MANAGEMENT</SectionEyebrow>
        <Text style={ds.title}>Gate pass</Text>
        <View style={ds.body}>{body}</View>
        {tourEl}
      </DesktopEventShell>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title="Gate pass"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        eventId={eventId}
      />
      {body}
      {tourEl}
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

    explainBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    explainIcon: { fontSize: 44, marginBottom: 16, opacity: 0.6 },
    explainTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 8, textAlign: 'center' },
    explainSub: { fontSize: 13.5, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    progressCard: { margin: 16, marginBottom: 0, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 16 },
    progressLabel: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 8 },
    progressTrack: { height: 8, borderRadius: 4, backgroundColor: theme.bgTertiary, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: theme.accent, borderRadius: 4 },

    body: { padding: 16, gap: 10 },
    hint: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18, marginBottom: 6 },
    actionBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 16, paddingVertical: 16,
    },
    actionBtnIcon: { fontSize: 18 },
    actionBtnText: { fontSize: 14, fontWeight: '600', color: theme.text },
  });
}

// Desktop: title chrome only -- `body`'s real 3-way capability branch keeps
// its proven mobile styling (`s`), same trade-off as PlanView/Bookings.
const ds = StyleSheet.create({
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT, marginTop: 2, marginBottom: 20 },
  body: { maxWidth: 520 },
});
