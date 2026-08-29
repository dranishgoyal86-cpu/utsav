import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { useEventContext } from '../../hooks/useEventContext';
import { useCapabilities } from '../../hooks/useCapabilities';
import { isEnabled } from '../../lib/capabilities';
import AppHeader from '../../components/AppHeader';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import RsvpDashboardDesktop from '../../components/desktop/RsvpDashboardDesktop';

// Wave 13 — same shared breakpoint every desktop screen in this app uses.
const DESKTOP_BREAKPOINT = 768;

// Wave 2, Task 3 — read-only, no new table. Aggregates event_functions +
// event_invitee_functions + event_invitee_function_rsvps in JS (this
// project's established "no nested joins, separate queries combined
// client-side" convention), since there's no per-function guest count/RSVP
// breakdown anywhere yet — GuestList.js's existing showRsvpTracking summary
// is event-level only (event_invitees.rsvp_status), a different table.
export default function RsvpDashboard({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { event } = useEventContext(eventId);
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && windowWidth >= DESKTOP_BREAKPOINT;

  const [loading, setLoading] = useState(true);
  const [totalInvited, setTotalInvited] = useState(0);
  const [totalResponded, setTotalResponded] = useState(0);
  const [currentUserName, setCurrentUserName] = useState(null);

  // Wave 13 follow-up — desktop sidebar footer, same currentUserName role
  // GuestList.js's shell already has. This screen has no userId state of
  // its own (read-only dashboard, never needed one before).
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('users').select('name').eq('id', user.id).maybeSingle()
        .then(({ data, error }) => {
          if (error) { console.log('user name fetch skipped:', error.message); return; }
          setCurrentUserName(data?.name || null);
        });
    });
  }, []);
  const [functionRows, setFunctionRows] = useState([]);
  const [stickerCount, setStickerCount] = useState(0);
  const [stickerTotal, setStickerTotal] = useState(0);
  const [notedCount, setNotedCount] = useState(0);
  const [notedTotal, setNotedTotal] = useState(0);

  const capabilities = useCapabilities({
    eventTypeSlug: event?.event_type_slug ?? null,
    venueType: event?.venue_type ?? null,
    guestCount: event?.guest_count ?? null,
    age: event?.child_age ?? null,
    isDryEvent: event?.is_dry_event ?? false,
    isVegOnly: event?.is_veg_only ?? false,
    hasBudget: event?.budget_total != null,
  });
  const gated = !isEnabled(capabilities, 'rsvp_tracking') && !capabilities.loading;

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    try {
      setLoading(true);

      const { data: invitees, error: inviteesErr } = await supabase
        .from('event_invitees').select('id, rsvp_status').eq('event_id', eventId);
      if (inviteesErr) throw inviteesErr;
      setTotalInvited((invitees || []).length);
      setTotalResponded((invitees || []).filter((g) => !!g.rsvp_status).length);

      // template_id added Wave 13 — the desktop dashboard colour-links each
      // function's progress bar to its own real assigned design (or the
      // event's own design, when null) via lib/functionDesignColors.js.
      // Mobile's own render never reads this field, so its output is
      // unchanged.
      const { data: functions, error: functionsErr } = await supabase
        .from('event_functions').select('id, name, date, time, template_id')
        .eq('event_id', eventId).order('sort_order', { ascending: true });
      if (functionsErr) throw functionsErr;

      if (!functions || functions.length === 0) { setFunctionRows([]); return; }

      const functionIds = functions.map((f) => f.id);
      const { data: scoped, error: scopedErr } = await supabase
        .from('event_invitee_functions').select('function_id, invitee_id')
        .in('function_id', functionIds);
      if (scopedErr) throw scopedErr;

      const { data: rsvps, error: rsvpsErr } = await supabase
        .from('event_invitee_function_rsvps').select('function_id, status')
        .in('function_id', functionIds);
      if (rsvpsErr) throw rsvpsErr;

      const scopedCountByFn = new Map();
      for (const row of scoped || []) {
        scopedCountByFn.set(row.function_id, (scopedCountByFn.get(row.function_id) || 0) + 1);
      }
      const statusCountsByFn = new Map();
      for (const row of rsvps || []) {
        const counts = statusCountsByFn.get(row.function_id) || { yes: 0, no: 0 };
        if (row.status === 'yes') counts.yes++;
        else if (row.status === 'no') counts.no++;
        statusCountsByFn.set(row.function_id, counts);
      }

      setFunctionRows(functions.map((f) => {
        const total = scopedCountByFn.get(f.id) || 0;
        const { yes = 0, no = 0 } = statusCountsByFn.get(f.id) || {};
        const pending = Math.max(0, total - yes - no);
        return { ...f, total, yes, no, pending };
      }));

      // Wave 3, Task 1 — reads gift_stickers directly, NOT reciprocity_ledger.
      // reciprocity_ledger is cross-event and only populated when the host
      // taps "Sync from events" on that screen (confirmed by reading
      // ReciprocityLedger.js in full) — a per-event dashboard reading it
      // could silently show stale/empty data. gift_stickers is this event's
      // actual live source of truth, same table that screen itself reads
      // from before syncing. No reciprocity/settled computation exists
      // anywhere to reuse — that's a manual host toggle on the ledger
      // screen, not a value to duplicate here.
      //
      // Corrected after review: this originally only read gift_stickers,
      // silently missing anything a host logged the simpler way, directly
      // on a guest's detail form (event_invitees.gift_type/gift_amount —
      // confirmed via GuestDetailModal.js to be a completely separate,
      // unsynced recording path, not a mirror of gift_stickers). No shared
      // key exists to dedupe the two, so they're shown as two distinct,
      // honestly-labeled counts below rather than merged into one number
      // that could double-count or under-count depending on which path a
      // host actually used.
      const { data: stickers, error: stickersErr } = await supabase
        .from('gift_stickers').select('amount, gift_type')
        .eq('event_id', eventId).not('guest_id', 'is', null);
      if (stickersErr) throw stickersErr;
      setStickerCount((stickers || []).length);
      setStickerTotal((stickers || []).reduce((sum, g) => (
        (g.gift_type === 'cash' || g.gift_type === 'upi') ? sum + (g.amount || 0) : sum
      ), 0));

      const { data: noted, error: notedErr } = await supabase
        .from('event_invitees').select('gift_type, gift_amount')
        .eq('event_id', eventId).not('gift_type', 'is', null);
      if (notedErr) throw notedErr;
      setNotedCount((noted || []).length);
      setNotedTotal((noted || []).reduce((sum, g) => (
        g.gift_type === 'cash' ? sum + (g.gift_amount || 0) : sum
      ), 0));
    } catch (err) {
      console.log('RsvpDashboard load error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  if (gated) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="RSVP dashboard" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <Text style={s.gatedText}>
          RSVP tracking becomes available once this event has more guests.
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="RSVP dashboard" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  // Wave 13 — desktop shell + the new stats/progress pattern. Same
  // "everything above runs unchanged, only the JSX branches" shape as
  // every other desktop screen this wave.
  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="rsvp" event={event} guestCount={totalInvited} currentUserName={currentUserName} navigation={navigation}>
        <RsvpDashboardDesktop
          totalInvited={totalInvited} totalResponded={totalResponded} functionRows={functionRows}
          stickerCount={stickerCount} stickerTotal={stickerTotal} notedCount={notedCount} notedTotal={notedTotal}
        />
      </DesktopEventShell>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="RSVP dashboard" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <FlatList
        data={functionRows}
        keyExtractor={(f) => f.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <>
            <View style={s.summaryCard}>
              <Text style={s.summaryValue}>{totalResponded} / {totalInvited}</Text>
              <Text style={s.summaryLabel}>Guests responded</Text>
            </View>

            {(stickerCount > 0 || notedCount > 0) && (
              <TouchableOpacity style={s.giftCard} onPress={() => navigation.navigate('ReciprocityLedger')}>
                <View style={{ flex: 1 }}>
                  {stickerCount > 0 && (
                    <Text style={s.giftValue}>
                      {stickerCount} via Gift Stickers
                      {stickerTotal > 0 ? ` · ₹${stickerTotal.toLocaleString('en-IN')}` : ''}
                    </Text>
                  )}
                  {notedCount > 0 && (
                    <Text style={[s.giftValue, stickerCount > 0 && { marginTop: 4 }]}>
                      {notedCount} noted on guest profiles
                      {notedTotal > 0 ? ` · ₹${notedTotal.toLocaleString('en-IN')}` : ''}
                    </Text>
                  )}
                  <Text style={s.giftLabel}>Host-only · not visible to guests · may overlap, not deduped</Text>
                </View>
                <Text style={s.giftLink}>View gift ledger →</Text>
              </TouchableOpacity>
            )}

            {functionRows.length > 0 && <Text style={s.sectionLabel}>BY FUNCTION</Text>}
          </>
        }
        ListEmptyComponent={
          !loading ? <Text style={s.emptyText}>No functions set up for this event yet.</Text> : null
        }
        renderItem={({ item }) => {
          const respondedPct = item.total > 0 ? (item.yes + item.no) / item.total : 0;
          const yesPct = item.total > 0 ? item.yes / item.total : 0;
          return (
            <View style={s.functionCard}>
              <View style={s.functionHeader}>
                <Text style={s.functionName}>{item.name}</Text>
                <Text style={s.functionMeta}>{[formatDate(item.date), item.time].filter(Boolean).join(' · ')}</Text>
              </View>
              <View style={s.progressTrack}>
                <View style={[s.progressFillYes, { width: `${yesPct * 100}%` }]} />
                <View style={[s.progressFillResponded, { width: `${respondedPct * 100}%`, opacity: 0.35 }]} />
              </View>
              <View style={s.countsRow}>
                <Text style={s.countText}>✓ {item.yes} yes</Text>
                <Text style={s.countText}>✕ {item.no} no</Text>
                <Text style={s.countText}>{item.pending} pending</Text>
                <Text style={s.countTotal}>of {item.total}</Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    list: { paddingHorizontal: 16, paddingBottom: 40 },
    gatedText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', padding: 30 },
    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingVertical: 30 },

    summaryCard: { alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 16, paddingVertical: 20, borderWidth: 0.5, borderColor: theme.border, marginTop: 16, marginBottom: 16 },
    summaryValue: { fontSize: 28, fontWeight: '800', color: theme.text },
    summaryLabel: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },

    giftCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16,
    },
    giftValue: { fontSize: 14, fontWeight: '700', color: theme.text },
    giftLabel: { fontSize: 10.5, color: theme.textTertiary, marginTop: 2 },
    giftLink: { fontSize: 12, fontWeight: '700', color: theme.accent },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.6, marginBottom: 8 },
    functionCard: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, padding: 14, marginBottom: 10 },
    functionHeader: { marginBottom: 10 },
    functionName: { fontSize: 15, fontWeight: '700', color: theme.text },
    functionMeta: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },

    progressTrack: { height: 8, borderRadius: 4, backgroundColor: theme.bgTertiary, overflow: 'hidden', flexDirection: 'row' },
    progressFillYes: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: theme.accent, borderRadius: 4 },
    progressFillResponded: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: theme.text, borderRadius: 4 },

    countsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
    countText: { fontSize: 11, color: theme.textSecondary },
    countTotal: { fontSize: 11, color: theme.textTertiary, marginLeft: 'auto' },
  });
}
