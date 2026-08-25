import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert, resolveGuestPartySize } from '../../helpers';
import { insertGuestPassesWithRetry } from '../../lib/capabilities';
import { useEventContext } from '../../hooks/useEventContext';
import AppHeader from '../../components/AppHeader';

// Issues one gate pass per guest who doesn't already have one — idempotent,
// re-running only fills gaps (new guests added since the last run). Reached
// from GatePass.js's "Issue passes" action.
export default function PassIssue({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const { event, update } = useEventContext(eventId);

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
        .select('id, name, plus_ones, entry_type, household_size, rsvp_status').eq('event_id', eventId).neq('rsvp_status', 'no');
      if (guestErr) {
        ({ data: guestRows, error: guestErr } = await supabase.from('event_invitees')
          .select('id, name, plus_ones, rsvp_status').eq('event_id', eventId).neq('rsvp_status', 'no'));
      }
      if (guestErr) throw guestErr;
      const { data: passRows, error: passErr } = await supabase.from('guest_passes').select('id, guest_id, pass_code').eq('event_id', eventId);
      if (passErr) throw passErr;
      setGuests(guestRows || []);
      setPasses(passRows || []);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  const issuedGuestIds = new Set(passes.map(p => p.guest_id));
  const missingGuests = guests.filter(g => !issuedGuestIds.has(g.id));

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
            ListEmptyComponent={<Text style={s.emptyText}>Every guest already has a pass.</Text>}
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

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
    btnDisabled: { opacity: 0.5 },
  });
}
