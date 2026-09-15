import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import AppHeader from '../../components/AppHeader';
import { eventTypeName } from '../../lib/eventTypeNames';
import { registerTourTarget } from '../../lib/tourTargets';
import { useTour } from '../../hooks/useTour';
import CoachMarkTour from '../../components/CoachMarkTour';

// "add more tutorials in the profile for invites and other planning
// options" — same spotlight-tour engine every other screen already uses
// (see EventTodo.js/GuestList.js), added here since InviteHub is now the
// one front door for both invite systems.
const INVITES_TOUR_STEPS = [
  {
    key: 'single-page',
    target: 'invites-single-page',
    title: 'Quick and simple',
    description: 'One shareable card — pick a template, fill in your event details, and share it in minutes. Good for most events.',
  },
  {
    key: 'designer-suite',
    target: 'invites-designer-suite',
    title: 'The full design system',
    description: 'For multi-function events — Haldi, Sangeet, Reception, etc. — the Designer Suite gives each function its own design, and is where every newer invite feature lands first.',
  },
];

// "The invite designer in the guest list should be moved to the invites
// tab itself on the main screen. So when clicked invites on the main
// screen or through guest list (create and share invite) should give two
// options - single page invite or Designer invite suite."
//
// Two real invite systems already existed side by side with no single
// front door between them: GuestList.js's own inline "Invite Designer"
// modal (one shareable card — template, colors, save/share; the "Single
// Page Invite" option below) and ToranInvites.js (the richer, per-function,
// multi-archetype system built across the whole invite-architecture wave —
// the "Designer Invite Suite" option below, and where any future
// invite-related feature for a specific event belongs going forward).
// PlanScreen.js's quick-tools "🎨 Invites" tile hardcoded straight into the
// single-page modal, and GuestList's own "Create & Share Invite" CTA did
// the same — the Designer Suite was only reachable via a small, easy-to-
// miss utility chip buried in the guest list. This screen is the one door
// both of those now go through first.
//
// Reached two ways: with an `event` already known (PlanView.js's header
// icon, or GuestList's CTA once an invite doesn't exist yet) — skips
// straight to the two options. Without one (PlanScreen.js's global
// quick-tools tile, no event picked yet) — shows a lightweight event
// picker first. This is a smaller, purpose-built picker rather than
// reusing GuestList's own (which is entangled with that screen's much
// larger guest-list/picker state) — just enough to get an event id before
// handing off to either destination.
export default function InviteHub({ route, navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { event: routeEvent, forceTour } = route.params || {};

  const [loading, setLoading] = useState(!routeEvent);
  const [myEvents, setMyEvents] = useState([]);
  const [pickedEvent, setPickedEvent] = useState(routeEvent || null);
  const [myInvitesCount, setMyInvitesCount] = useState(0);

  const invitesTour = useTour('invites_intro');
  useEffect(() => {
    if (forceTour === 'invites_intro') {
      invitesTour.forceRestart();
    } else if (invitesTour.checked) {
      invitesTour.startTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitesTour.checked, forceTour]);
  const singlePageRef = useRef(null);
  const designerSuiteRef = useRef(null);
  useEffect(() => {
    registerTourTarget('invites-single-page', singlePageRef);
    registerTourTarget('invites-designer-suite', designerSuiteRef);
  }, []);

  useEffect(() => {
    if (routeEvent) return;
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setLoading(false); return; }
      const { data } = await supabase
        .from('events').select('*')
        .eq('host_id', userData.user.id)
        .order('created_at', { ascending: false });
      if (!cancelled) { setMyEvents(data || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [routeEvent]);

  // Runs unconditionally, regardless of whether the user has an event of
  // their own or one was passed in via route params — "My Invitations"
  // (events THIS person is a guest at, via event_invitees.user_id — see
  // MyInvites.js) needs to be visible here for every logged-in user, not
  // just hosts who've already picked an event. This is also the entry
  // point to typing in an invite code by hand, which someone with ZERO
  // linked invites still needs to reach — per Anish: "it should be visible
  // in everyone's app," the card itself always renders below (count===0
  // just changes its wording), it isn't hidden the way it was before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { count } = await supabase
        .from('event_invitees')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .is('anonymized_at', null);
      if (!cancelled) setMyInvitesCount(count || 0);
    })();
    return () => { cancelled = true; };
  }, []);

  function openSinglePage(ev) {
    navigation.navigate('GuestList', { event: ev, openModal: 'invite' });
  }
  function openDesignerSuite(ev) {
    navigation.navigate('ToranInvites', { eventId: ev.id });
  }

  // Always renders — not gated on myInvitesCount > 0 — since it's also
  // how someone with zero linked invites reaches MyInvites.js's manual
  // "Have an invite code?" box. Wording just adapts to whether there's
  // anything linked yet.
  function renderMyInvitationsCard() {
    return (
      <TouchableOpacity style={s.myInvitesCard} onPress={() => navigation.navigate('MyInvites')}>
        <Text style={s.myInvitesEmoji}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.myInvitesTitle}>My Invitations</Text>
          <Text style={s.myInvitesSub}>
            {myInvitesCount === 0
              ? "See events you're invited to, or add one with an invite code"
              : myInvitesCount === 1
              ? "You're invited to 1 event"
              : `You're invited to ${myInvitesCount} events`}
          </Text>
        </View>
        <Text style={s.myInvitesCaret}>›</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title="Invites" />
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.accent} />
      </SafeAreaView>
    );
  }

  if (!pickedEvent) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title="Invites" />
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>{renderMyInvitationsCard()}</View>
        <Text style={s.sectionLabel}>Which event is this invite for?</Text>
        <FlatList
          data={myEvents}
          keyExtractor={e => e.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={s.emptyText}>No events yet — create one from the Plan tab first.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.eventRow} onPress={() => setPickedEvent(item)}>
              <View style={{ flex: 1 }}>
                <Text style={s.eventRowTitle}>{item.working_title || eventTypeName(item.event_type_slug)}</Text>
                {item.event_date ? <Text style={s.eventRowMeta}>{item.event_date}</Text> : null}
              </View>
              <Text style={s.eventRowCaret}>›</Text>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader theme={theme} navigation={navigation} onBack={() => navigation.goBack()} title="Invites" />
      <View style={{ padding: 20 }}>
        {renderMyInvitationsCard()}
        <Text style={s.sectionLabel}>{pickedEvent.working_title || eventTypeName(pickedEvent.event_type_slug)}</Text>

        <TouchableOpacity ref={singlePageRef} style={s.optionCard} onPress={() => openSinglePage(pickedEvent)}>
          <Text style={s.optionEmoji}>📄</Text>
          <Text style={s.optionTitle}>Single Page Invite</Text>
          <Text style={s.optionSub}>One shareable card — pick a template, add your event details, and share it in minutes.</Text>
        </TouchableOpacity>

        <TouchableOpacity ref={designerSuiteRef} style={s.optionCard} onPress={() => openDesignerSuite(pickedEvent)}>
          <Text style={s.optionEmoji}>🎨</Text>
          <Text style={s.optionTitle}>Designer Invite Suite</Text>
          <Text style={s.optionSub}>The full design system for this event — per-function designs (Haldi, Sangeet, Reception, etc.), multiple archetypes, and every later invite feature lives here.</Text>
        </TouchableOpacity>
      </View>

      <CoachMarkTour
        visible={invitesTour.isTourActive}
        steps={INVITES_TOUR_STEPS}
        onComplete={invitesTour.markComplete}
        onSkip={invitesTour.markComplete}
      />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    sectionLabel: { fontSize: 15, fontWeight: '700', color: theme.text, paddingHorizontal: 20, marginTop: 16, marginBottom: 14 },
    emptyText: { fontSize: 13.5, color: theme.textSecondary, textAlign: 'center', marginTop: 30 },
    eventRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10,
    },
    eventRowTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    eventRowMeta: { fontSize: 12.5, color: theme.textSecondary, marginTop: 2 },
    eventRowCaret: { fontSize: 18, color: theme.textTertiary },
    optionCard: {
      backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border,
      padding: 20, marginBottom: 14,
    },
    optionEmoji: { fontSize: 26, marginBottom: 8 },
    optionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
    optionSub: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    myInvitesCard: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardBg,
      borderRadius: 18, borderWidth: 1.5, borderColor: theme.accent,
      padding: 16, marginBottom: 18,
    },
    myInvitesEmoji: { fontSize: 26, marginRight: 12 },
    myInvitesTitle: { fontSize: 15, fontWeight: '700', color: theme.accent, marginBottom: 3 },
    myInvitesSub: { fontSize: 12.5, color: theme.textSecondary },
    myInvitesCaret: { fontSize: 18, color: theme.accent, marginLeft: 8 },
  });
}
