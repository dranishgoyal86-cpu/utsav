import { useState, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { X } from 'phosphor-react-native';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import SwipeableRow from '../../components/SwipeableRow';

// The screen that was simply missing before this wave — a guest with a
// real Utsav account (linked via event_invitees.user_id — see
// helpers.js's linkGuestAccountByPhone and supabase/migrations/
// 20260914010000_guest_realtime_link_and_event_status.sql's real-time
// version) had no in-app place to see what they're invited to at all. Two
// separate queries combined in JS, this project's established no-joins
// convention — same shape as RsvpDashboard.js.
//
// Tapping a row reuses RSVPScreen.js as-is (inviteCode + guestId) rather
// than building a second invite-viewing/editing surface — that screen
// already handles viewing, editing, and resubmitting an RSVP correctly.
export default function MyInvites({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [codeInput, setCodeInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  // "guest should be able to delete his invite in his my invitations
  // window" (Anish, Sept 18) — two genuinely different actions, so a
  // swipe-to-delete asks which one rather than assuming: removing this row
  // from the guest's OWN list only unlinks event_invitees.user_id (the
  // host's guest list, RSVP status and gate pass are all untouched — the
  // guest just stops seeing it here, same as before they ever linked their
  // account); declining also flips rsvp_status to 'no' first, a real
  // answer the host sees on their guest list.
  const [deleteChoiceRow, setDeleteChoiceRow] = useState(null);
  const [removingInvite, setRemovingInvite] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setRows([]); return; }

      const { data: invitees, error: invErr } = await supabase
        .from('event_invitees')
        .select('id, event_id, rsvp_status')
        .eq('user_id', session.user.id)
        .is('anonymized_at', null);
      if (invErr) throw invErr;
      if (!invitees?.length) { setRows([]); return; }

      const eventIds = [...new Set(invitees.map(i => i.event_id))];
      const { data: events, error: evErr } = await supabase
        .from('events')
        .select('id, name, event_date, event_time, venue, invite_code, is_cancelled, cancellation_reason')
        .in('id', eventIds);
      if (evErr) throw evErr;

      const eventById = new Map((events || []).map(e => [e.id, e]));
      const merged = invitees
        .map(inv => ({ invitee: inv, event: eventById.get(inv.event_id) }))
        .filter(r => !!r.event)
        .sort((a, b) => new Date(a.event.event_date || 0) - new Date(b.event.event_date || 0));
      setRows(merged);
    } catch (err) {
      console.log('MyInvites load error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  // "so if some user who downloaded the app can track his own invitations
  // by putting that code inside my invitation. it will be easier than
  // matching phone no. and email id." — a manual fallback for when the
  // automatic phone/email matching (helpers.js's linkGuestAccountByPhone,
  // or the real-time link_and_notify_invitee on RSVP/signup) misses —
  // wrong number on file, RSVP submitted by a relative, a typo, etc. The
  // code itself (event code + this guest's own 4-char suffix) is shown to
  // every guest on their RSVP confirmation screen — see RSVPScreen.js.
  async function claimByCode() {
    const code = codeInput.trim();
    if (!code) return;
    try {
      setClaiming(true);
      const { data, error } = await supabase.rpc('claim_invite_by_code', { p_code: code });
      if (error) throw error;
      if (!data?.ok) {
        const message = data?.error === 'already_claimed'
          ? "This invite is already linked to a different account. If that's a mistake, ask your host to check the guest list."
          : data?.error === 'invalid_format'
          ? 'That code looks incomplete — check the code on your invite and try again (it looks like ABC123-D4E5).'
          : 'We couldn\'t find an invite with that code. Double-check it and try again.';
        showAlert('Invalid code', message);
        return;
      }
      setCodeInput('');
      showAlert('You\'re invited! 🎉', `You've been added as a guest on "${data.event_name}".`);
      load();
    } catch (err) {
      showAlert('Something went wrong', err.message || 'Could not check that code. Please try again.');
    } finally {
      setClaiming(false);
    }
  }

  // "it should show the invite image and the invitation details... rather
  // than just showing the RSVP screen again" — InviteDetails.js is the new
  // "view my invite" screen (image, date/time/venue, RSVP status, check-in);
  // its own "Edit RSVP" button is what hands off to RSVPScreen.js now.
  function openInvite(row) {
    navigation.navigate('InviteDetails', { inviteCode: row.event.invite_code, guestId: row.invitee.id });
  }

  function promptRemove(row) {
    setDeleteChoiceRow(row);
  }

  // "just wants to delete his invitation sitting in his app" — unlinks this
  // guest's account from the invite. Nothing on the host's side changes:
  // their guest list, this person's RSVP answer, and any gate pass already
  // issued all stay exactly as they were. Purely cosmetic from the guest's
  // side — it just stops showing up here.
  async function removeFromMyList() {
    const row = deleteChoiceRow;
    if (!row) return;
    setRemovingInvite(true);
    try {
      // Sept 18 fix: event_invitees' only UPDATE policy is host-only
      // (auth.uid() = owner_user_id) — a plain client-side .update() here
      // as the GUEST silently touched 0 rows (this project's documented
      // RLS-silent-no-op gotcha, see guest_account_link.sql), which is why
      // the row kept reappearing on the next visit. remove_my_invite() is
      // the real, SECURITY DEFINER fix — see supabase/migrations/
      // 20260918000000_guest_unlink_own_invite.sql — and also marks the row
      // so linkGuestAccountByPhone()'s own every-login re-link never
      // silently reattaches it again.
      const { data: ok, error } = await supabase.rpc('remove_my_invite', { p_event_id: row.event.id, p_decline: false });
      if (error) throw error;
      if (!ok) throw new Error("Couldn't remove this invite — please try again.");
      setDeleteChoiceRow(null);
      setRows(prev => prev.filter(r => r.invitee.id !== row.invitee.id));
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setRemovingInvite(false);
    }
  }

  // "or decline rsvp also" — a real "I'm not coming" the host sees on their
  // guest list, in addition to the same unlink as removeFromMyList above.
  async function declineAndRemove() {
    const row = deleteChoiceRow;
    if (!row) return;
    setRemovingInvite(true);
    try {
      // Same RLS/re-link fix as removeFromMyList() above, with p_decline
      // true so the RPC also flips rsvp_status to 'no' in the same write.
      const { data: ok, error } = await supabase.rpc('remove_my_invite', { p_event_id: row.event.id, p_decline: true });
      if (error) throw error;
      if (!ok) throw new Error("Couldn't remove this invite — please try again.");
      setDeleteChoiceRow(null);
      setRows(prev => prev.filter(r => r.invitee.id !== row.invitee.id));
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setRemovingInvite(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const RSVP_LABELS = { yes: "You're going", no: "You declined", maybe: 'Maybe going', pending: 'Awaiting your RSVP' };

  const codeEntryCard = (
    <View style={s.codeCard}>
      <Text style={s.codeCardTitle}>Have an invite code?</Text>
      <Text style={s.codeCardSub}>Enter the code from your invite (e.g. ABC123-D4E5) to add it here.</Text>
      <View style={s.codeRow}>
        <TextInput
          style={s.codeInput}
          value={codeInput}
          onChangeText={setCodeInput}
          placeholder="ABC123-D4E5"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TouchableOpacity style={s.codeBtn} onPress={claimByCode} disabled={claiming || !codeInput.trim()}>
          {claiming ? <ActivityIndicator size="small" color={theme.btnPrimaryText} /> : <Text style={s.codeBtnText}>Add</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="My invites" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      {loading ? (
        <View style={s.centerBox}><ActivityIndicator color={theme.accent} /></View>
      ) : rows.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyIcon}>💌</Text>
          <Text style={s.emptyTitle}>No invites yet</Text>
          <Text style={s.emptySub}>Events you're invited to will show up here once your account is linked to them.</Text>
          {codeEntryCard}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.invitee.id}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={codeEntryCard}
          renderItem={({ item }) => (
            <SwipeableRow style={s.cardWrap} onPress={() => openInvite(item)} onDelete={() => promptRemove(item)} deleteLabel="Remove">
              <View style={s.card}>
                <View style={{ flex: 1 }}>
                  <Text style={s.eventName}>{item.event.name}</Text>
                  <Text style={s.eventMeta}>
                    {[formatDate(item.event.event_date), item.event.venue].filter(Boolean).join(' · ') || 'Details coming soon'}
                  </Text>
                  {item.event.is_cancelled ? (
                    <Text style={s.cancelledBadge}>
                      Cancelled{item.event.cancellation_reason ? ` — ${item.event.cancellation_reason}` : ''}
                    </Text>
                  ) : (
                    <Text style={s.statusText}>{RSVP_LABELS[item.invitee.rsvp_status] || RSVP_LABELS.pending}</Text>
                  )}
                </View>
                <Text style={s.arrow}>›</Text>
              </View>
            </SwipeableRow>
          )}
        />
      )}

      <Modal visible={!!deleteChoiceRow} transparent animationType="fade" onRequestClose={() => setDeleteChoiceRow(null)}>
        <View style={s.deleteOverlay}>
          <View style={s.deleteModal}>
            <View style={s.deleteModalHeader}>
              <Text style={s.deleteModalTitle}>Remove this invite?</Text>
              <TouchableOpacity onPress={() => setDeleteChoiceRow(null)}>
                <X size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.deleteModalHint}>
              You can just stop seeing "{deleteChoiceRow?.event?.name}" here, or also let the host know you're not coming.
            </Text>
            <TouchableOpacity style={[s.deleteModalBtn, { backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border }]} onPress={removeFromMyList} disabled={removingInvite}>
              {removingInvite ? <ActivityIndicator color={theme.text} /> : <Text style={[s.deleteModalBtnText, { color: theme.text }]}>Just remove it from my list</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[s.deleteModalBtn, { backgroundColor: theme.statusDeclinedText }]} onPress={declineAndRemove} disabled={removingInvite}>
              {removingInvite ? <ActivityIndicator color="#FFF" /> : <Text style={s.deleteModalBtnText}>Also decline the RSVP</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon: { fontSize: 44, marginBottom: 14, opacity: 0.6 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
    // Sept 18: "it's overlapping and the red button is showing" (Anish) —
    // SwipeableRow's own wrap has overflow:hidden but no border radius of
    // its own by default, so at the card's rounded top-right/bottom-right
    // corners the square-cornered red delete button underneath poked
    // through the tiny gap the rounding left uncovered. Matches the fix
    // PlanScreen.js's planCardWrap already uses for the exact same
    // component — giving the WRAP the same borderRadius as the card it
    // contains, so overflow:hidden clips to the identical rounded shape.
    cardWrap: { borderRadius: 18, marginBottom: 10 },
    card: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 18,
      borderWidth: 0.5, borderColor: theme.border, padding: 16,
    },
    eventName: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 4 },
    eventMeta: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 6 },
    statusText: { fontSize: 12, fontWeight: '600', color: theme.accent },
    cancelledBadge: { fontSize: 12, fontWeight: '700', color: theme.statusDeclinedText },
    arrow: { fontSize: 18, color: theme.textTertiary },
    codeCard: {
      backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border,
      padding: 16, marginBottom: 16, width: '100%',
    },
    codeCardTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text, marginBottom: 4 },
    codeCardSub: { fontSize: 12, color: theme.textSecondary, marginBottom: 12, lineHeight: 17 },
    codeRow: { flexDirection: 'row', gap: 10 },
    codeInput: {
      flex: 1, backgroundColor: theme.bg, borderRadius: 12, borderWidth: 1, borderColor: theme.border,
      paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: theme.text, letterSpacing: 1,
    },
    codeBtn: {
      backgroundColor: theme.btnPrimary, borderRadius: 12, paddingHorizontal: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    codeBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
    deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    deleteModal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 20 },
    deleteModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    deleteModalTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    deleteModalHint: { fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginBottom: 16 },
    deleteModalBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
    deleteModalBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  });
}
