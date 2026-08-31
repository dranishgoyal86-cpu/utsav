import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { useFocusEffect } from '@react-navigation/native';
import { showAlert, confirmDestructive, deleteEventCascade } from '../../helpers';
import { X } from 'phosphor-react-native';
import SwipeableRow from '../../components/SwipeableRow';
import SparkleIcon from '../../components/SparkleIcon';
import NotificationBell from '../../components/NotificationBell';
import { useCapabilityRules } from '../../hooks/useCapabilities';
import { resolveCapabilities, isEnabled } from '../../lib/capabilities';
import { useTour } from '../../hooks/useTour';
import CoachMarkTour from '../../components/CoachMarkTour';
import PlanHero from './PlanHero';
import { StatCard, SectionEyebrow } from '../../components/desktop/DesktopKit';
import { MAROON, GOLD, OK, WAIT, CARD, LINE, TEXT, MUTED, CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

// First-login core-loop tour — 5 real, always-mounted elements (the
// PlanHero input + all 4 non-Albums bottom tabs), deliberately scoped to
// this one screen rather than driving cross-tab navigation mid-tour. A
// truly new host has zero saved_plans, so anything reachable only from an
// existing plan (guest list, checklist — see TOOLS above) isn't on-screen
// yet and can't be a real spotlight target; those get a follow-up
// per-feature tour once an event actually exists (out of scope here, see
// task brief). GlobalSearch's header icon likewise isn't rendered on this
// specific screen (PlanScreen never adopted AppHeader — see AppHeader.js's
// own file-list comment), so the last step describes it honestly instead of
// spotlighting something not actually present here.
const CORE_LOOP_TOUR_STEPS = [
  {
    key: 'hero',
    target: 'plan-hero-input',
    title: 'Start here 👋',
    description: "Tell us what you're planning, in your own words — or tap the mic to speak it. We'll set up your event plan instantly.",
  },
  {
    key: 'plan-tab',
    target: 'tab-Plan',
    title: 'Your planning hub',
    description: 'Every event you plan lives here — and once you get going, your guest list, checklist and invites live right alongside it.',
  },
  {
    key: 'discover-tab',
    target: 'tab-Discover',
    title: 'Find real vendors',
    description: 'Browse and book caterers, decorators, photographers and more — verified listings, bookable right in the app.',
  },
  {
    key: 'bookings-tab',
    target: 'tab-Bookings',
    title: 'Track your bookings',
    description: 'Every vendor you book, and every conversation with them, lives here.',
  },
  {
    key: 'profile-tab',
    target: 'tab-Profile',
    title: 'Search & help, anytime',
    description: 'Tap 🔍 at the top of Discover, Bookings or your guest list to search anything fast. Your account and support live here in Profile.',
  },
];

const TOOLS = [
  { icon: '🤳', label: 'Find photos', sub: 'Face recognition', screen: 'GuestAccess' },
  { icon: '👥', label: 'Guest list', sub: 'Import & invite', screen: 'GuestList' },
  { icon: '🎨', label: 'Invites', sub: 'Create & share', screen: 'GuestList', params: { openDesigner: true } },
  { icon: '✅', label: 'Checklist', sub: 'Track & manage', screen: 'EventTodo' },
];

const SORT_OPTIONS = [
  { id: 'date', label: 'Date' },
  { id: 'budget', label: 'Budget' },
  { id: 'recent', label: 'Recently updated' },
];

// saved_plans.event_type holds one of two different vocabularies depending
// on which flow created the row: the old EventPlanner.js writes an
// eventTaxonomy.js category id ('wedding', 'religious', ...); PlanHero.js
// (the new flow) writes an event_type_slug from lib/eventTypeNames.js
// ('hindu-wedding', 'kids-birthday', ...) — confirmed only 3 of 16 new-flow
// slugs coincided with the old keys, so most new-flow plans fell through to
// the 🎉 fallback. Both vocabularies are real and both need to resolve.
const EVENT_ICONS = {
  // eventTaxonomy.js category ids (old flow)
  wedding: '💍', religious: '🪔', personal: '🎂', corporate: '💼',
  social: '👥', entertainment: '🎵', educational: '🎓', sports: '🏆',
  exhibition: '🎪', government: '🏛️',
  // legacy ids from saved_plans rows created before the eventTaxonomy
  // restructure — keep resolving correctly for anything already saved.
  birthday: '🎂', engagement: '💑', diwali: '🪔', babyshower: '🍼',
  anniversary: '❤️', lastrites: '🕊️', other: '🎉',
  // event_type_slug values (new flow, lib/eventTypeNames.js)
  'hindu-wedding': '💍', 'kids-birthday': '🎈', 'adult-birthday': '🎂',
  // Wave 7 — new wedding traditions, same icon as hindu-wedding (💍
  // represents "wedding," not a specific tradition).
  'nikah': '💍', 'anand-karaj': '💍', 'christian-wedding': '💍',
  'parsi-wedding': '💍', 'jain-wedding': '💍', 'interfaith-wedding': '💍',
  'mundan': '👶', 'baby-shower': '🍼', 'housewarming': '🏡',
  'naming-ceremony': '📛', 'religious-event': '🪔',
  'corporate-conference': '💼', 'product-launch': '🚀',
  'concert': '🎵', 'festival-fair': '🎉', 'sports-event': '🏆',
};

const STATUS_LABEL = {
  planning: { label: 'Planning', color: '#E8A020', bg: '#FFF8F0' },
  booked: { label: 'Booked', color: '#2E7D32', bg: '#E8F5E9' },
  done: { label: 'Done', color: '#888', bg: '#F2F2F0' },
};

export default function PlanScreen({ navigation, route }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  // First-login core-loop tour — startTour() internally no-ops if this
  // user already has a completed_at row for 'core_loop', so it's safe to
  // call unconditionally once the check resolves; no separate "is this
  // genuinely their first login" signal needed beyond that (see report).
  // forceTour route param (set by ProfileScreen.js's Replay Tutorial
  // action, via navigation.navigate('CustomerTabs', { screen: 'Plan',
  // params: { forceTour: 'core_loop' } })) bypasses the completed check
  // entirely, same as any other forceRestart() call.
  const tour = useTour('core_loop');
  useEffect(() => {
    if (route?.params?.forceTour === 'core_loop') {
      tour.forceRestart();
    } else if (tour.checked) {
      tour.startTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.checked, route?.params?.forceTour]);
  const [userName, setUserName] = useState('');
  const [savedPlans, setSavedPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [sortBy, setSortBy] = useState('date');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  // Holds the plan pending a delete decision — only shown when the plan has
  // a linked event_id (guest list/invites/checklist to actually choose
  // about); a never-linked plan just deletes straight away, same as before.
  const [deleteChoiceModal, setDeleteChoiceModal] = useState(null);
  const [deletingPlan, setDeletingPlan] = useState(false);

  // Capability fields (venue_type/event_type_slug/guest_count/...) live on
  // the linked events row, not on saved_plans itself — fetched as a second,
  // separate query (no joins, per project convention) and combined in JS
  // per plan card below. Per-plan-card capability resolution can't use the
  // useCapabilities() hook directly (React forbids hooks inside .map()), so
  // this screen fetches the raw rule set once via useCapabilityRules() and
  // calls the plain resolveCapabilities() function per card instead.
  const [eventsById, setEventsById] = useState({});
  const { rules: capabilityRules } = useCapabilityRules();
  // Per-plan booking summary — shown as a tick/color on the plan card itself
  // so a booking made anywhere in the app (ItemDetail/ProviderProfile) is
  // immediately visible from the plan it belongs to, without a separate trip
  // to the Bookings tab. Keyed by saved_plans.id (bookings.saved_plan_id),
  // same bridge BookingsScreen.js's own savedPlanId filter already uses.
  const [bookingsByPlanId, setBookingsByPlanId] = useState({});

  const s = makeStyles(theme);

  useEffect(() => { fetchUserName(); }, []);

  useFocusEffect(
    useCallback(() => { fetchSavedPlans(); }, [])
  );

  async function fetchUserName() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('users').select('name, pending_claim_category').eq('id', session.user.id).single();
      if (data?.name) setUserName(data.name.split(' ')[0]);
      // Set by ClaimVendorFlow.js right after mobile-OTP verification — if the
      // vendor closed the app before finishing email OTP/password, this is
      // the resume safety net: they'd otherwise land on the normal Plan
      // screen with a half-finished, still-passwordless account. Only fires
      // once per mount (app open / fresh login), not on every tab focus.
      // ClaimVendorFlow clears the flag once the claim is actually submitted.
      if (data?.pending_claim_category) {
        navigation.navigate('ClaimVendorFlow', { resume: true });
      }
    } catch (err) {
      console.log('PlanScreen fetchUserName error:', err.message);
    }
  }

  async function fetchSavedPlans() {
    try {
      setLoadingPlans(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSavedPlans([]); return; }

      const { data, error } = await supabase
        .from('saved_plans')
        .select('*')
        .eq('customer_id', session.user.id);

      if (error) throw error;
      setSavedPlans(data || []);

      const eventIds = (data || []).map(p => p.event_id).filter(Boolean);
      if (eventIds.length > 0) {
        const { data: events, error: eventsError } = await supabase
          .from('events')
          .select('id, venue_type, is_dry_event, is_veg_only, event_type_slug, guest_count, child_age, budget_total')
          .in('id', eventIds);
        if (eventsError) throw eventsError;
        const map = {};
        (events || []).forEach(e => { map[e.id] = e; });
        setEventsById(map);
      } else {
        setEventsById({});
      }

      const planIds = (data || []).map(p => p.id);
      if (planIds.length > 0) {
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('bookings')
          .select('id, saved_plan_id, status')
          .in('saved_plan_id', planIds)
          .eq('archived_by_customer', false);
        if (bookingsError) throw bookingsError;
        const byPlan = {};
        (bookingsData || []).forEach(b => {
          if (!byPlan[b.saved_plan_id]) byPlan[b.saved_plan_id] = [];
          byPlan[b.saved_plan_id].push(b);
        });
        setBookingsByPlanId(byPlan);
      } else {
        setBookingsByPlanId({});
      }
    } catch (err) {
      console.log('fetchSavedPlans error:', err.message);
      setSavedPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  }

  // A plan can carry more than one booking (different vendors booked under
  // the same event) — a single booking opens straight into it, more than one
  // opens Bookings pre-filtered to this plan (the existing savedPlanId/
  // planTitle filter BookingsScreen.js already supports).
  function openPlanBookings(plan) {
    const bookings = bookingsByPlanId[plan.id] || [];
    if (bookings.length === 1) {
      navigation.navigate('Booking', { bookingId: bookings[0].id });
    } else {
      navigation.navigate('Bookings', { savedPlanId: plan.id, planTitle: plan.title });
    }
  }

  // Resolves which of this plan's per-card tool buttons should show. Absent
  // linked-event data (not fetched yet, or the plan predates this feature)
  // resolves to nothing shown — matching the "never show a feature that
  // doesn't apply" rule via the safer default of hiding rather than guessing.
  function resolvePlanCapabilities(plan) {
    const ev = plan.event_id ? eventsById[plan.event_id] : null;
    if (!ev) return { visible: [], secondary: [], byKey: {} };
    return resolveCapabilities(capabilityRules, {
      eventTypeSlug: ev.event_type_slug,
      venueType: ev.venue_type,
      guestCount: ev.guest_count,
      age: ev.child_age,
      isDryEvent: ev.is_dry_event,
      isVegOnly: ev.is_veg_only,
      hasBudget: ev.budget_total != null,
    });
  }

  function openSavedPlan(savedPlan) {
    // Plans started through the new engine (PlanHero.js) carry event_id from
    // the moment they're created — those open straight into the live plan
    // document. Older plans without one still fall back to EventPlanner.js.
    if (savedPlan.event_id) {
      navigation.navigate('PlanView', { eventId: savedPlan.event_id });
    } else {
      navigation.navigate('EventPlanner', { savedPlan });
    }
  }

  // Re-fetches the real events row rather than trusting whatever this
  // screen's own savedPlans cache holds (same staleness concern as
  // EventPlanner.js's openGuestList() and the GuestList/EventTodo
  // self-correcting-name fix elsewhere this session). Shared by every
  // per-event tool card button below.
  function openEventTool(plan, screenName) {
    if (!plan.event_id) {
      showAlert('No event linked', 'This plan has no linked event yet.');
      return;
    }
    // VisitorList.js and GiftStickers.js both take eventId directly (not a
    // full event object) and fetch their own fresh data — passing a
    // stale/partial event object here was silently breaking both (eventId
    // destructured to undefined, "invalid input syntax for type uuid" on
    // every query).
    navigation.navigate(screenName, { eventId: plan.event_id });
  }

  async function deletePlanRow(plan) {
    const { error } = await supabase.from('saved_plans').delete().eq('id', plan.id);
    if (error) throw error;
    setSavedPlans(prev => prev.filter(p => p.id !== plan.id));
    setSelectedIds(prev => prev.filter(id => id !== plan.id));
  }

  // Guest list, invites, and checklist all share this plan's name and only
  // make sense tied to it — deleting the plan without them just leaves
  // orphaned, unreachable data behind. The photo album is the one exception
  // hosts consistently want kept regardless (memories, not logistics), so
  // it's never touched either way — ask which of the other two the host
  // actually wants when there's something linked to ask about.
  function deletePlan(plan) {
    if (!plan.event_id) {
      confirmDestructive(
        'Delete this plan?',
        `"${plan.title}" will be permanently removed. This cannot be undone.`,
        'Delete',
        async () => {
          try {
            await deletePlanRow(plan);
          } catch (err) {
            showAlert('Error', err.message);
          }
        }
      );
      return;
    }
    setDeleteChoiceModal(plan);
  }

  async function deleteEverything() {
    const plan = deleteChoiceModal;
    if (!plan) return;
    setDeletingPlan(true);
    try {
      await deleteEventCascade(plan.event_id);
      await deletePlanRow(plan);
      setDeleteChoiceModal(null);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setDeletingPlan(false);
    }
  }

  async function deletePlanOnly() {
    const plan = deleteChoiceModal;
    if (!plan) return;
    setDeletingPlan(true);
    try {
      await deletePlanRow(plan);
      setDeleteChoiceModal(null);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setDeletingPlan(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  function openCompare() {
    const plansToCompare = savedPlans.filter(p => selectedIds.includes(p.id));
    navigation.navigate('ComparePlans', { plans: plansToCompare });
  }

  const sortedPlans = [...savedPlans].sort((a, b) => {
    if (sortBy === 'date') return new Date(a.event_date) - new Date(b.event_date);
    if (sortBy === 'budget') return (b.total_budget || 0) - (a.total_budget || 0);
    if (sortBy === 'recent') return new Date(b.updated_at) - new Date(a.updated_at);
    return 0;
  });

  // Desktop stat strip — every number here is a real derived value from
  // savedPlans/bookingsByPlanId (already fetched for the mobile view), not
  // a new query or a fabricated metric.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = savedPlans
    .filter(p => p.event_date && new Date(p.event_date) >= today)
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  let nextEventLabel = 'No date set';
  if (upcoming[0]) {
    const days = Math.round((new Date(upcoming[0].event_date) - today) / 86400000);
    nextEventLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`;
  }
  const totalBudget = savedPlans.reduce((sum, p) => sum + (p.total_budget || 0), 0);
  const totalBudgetLabel = totalBudget > 0 ? `₹${(totalBudget / 100000).toFixed(1)}L` : '—';
  const totalBookings = Object.values(bookingsByPlanId).reduce((sum, arr) => sum + arr.length, 0);

  if (isDesktopWeb) {
    return (
      <View style={ds.page}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ds.scroll}>
          <View style={ds.headerRow}>
            <View>
              <SectionEyebrow>YOUR EVENTS</SectionEyebrow>
              <Text style={ds.title}>{userName ? `Welcome back, ${userName}` : 'Welcome back'}</Text>
            </View>
            <NotificationBell navigation={navigation} />
          </View>

          <View style={ds.statsRow}>
            <StatCard value={savedPlans.length} label="ACTIVE PLANS" color={MAROON} />
            <StatCard value={nextEventLabel} label="NEXT EVENT" color={GOLD} />
            <StatCard value={totalBudgetLabel} label="TOTAL BUDGET" color={OK} />
            <StatCard value={totalBookings} label="BOOKINGS" color={WAIT} />
          </View>

          <View style={ds.heroWrap}>
            <PlanHero navigation={navigation} />
          </View>

          <View style={ds.sectionHeaderRow}>
            <SectionEyebrow>
              {savedPlans.length > 0 ? `YOUR PLANS (${savedPlans.length})` : 'CURRENTLY PLANNING'}
            </SectionEyebrow>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {savedPlans.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {SORT_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[ds.sortChip, sortBy === opt.id && ds.sortChipActive]}
                      onPress={() => setSortBy(opt.id)}
                    >
                      <Text style={[ds.sortChipText, sortBy === opt.id && ds.sortChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {savedPlans.length > 1 && (
                <TouchableOpacity onPress={() => { setCompareMode(!compareMode); setSelectedIds([]); }}>
                  <Text style={ds.compareToggle}>{compareMode ? 'Cancel' : 'Compare'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {loadingPlans ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={MAROON} />
            </View>
          ) : sortedPlans.length === 0 ? (
            <View style={ds.emptyCard}>
              <Text style={{ fontSize: 30, marginBottom: 10 }}>✦</Text>
              <Text style={ds.emptyTitle}>No active plan yet</Text>
              <Text style={ds.emptySub}>Tell your agent what you're planning above, and it'll start building your event here.</Text>
            </View>
          ) : (
            <View style={ds.plansGrid}>
              {sortedPlans.map(p => {
                const st = STATUS_LABEL[p.status] || STATUS_LABEL.planning;
                const isSelected = selectedIds.includes(p.id);
                const capabilities = resolvePlanCapabilities(p);
                const showVisitorList = isEnabled(capabilities, 'society_gate_pass');
                const showGiftStickers = isEnabled(capabilities, 'gift_qr_stickers');
                const planBookings = bookingsByPlanId[p.id] || [];
                const hasBooking = planBookings.length > 0;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[ds.planCard, compareMode && isSelected && ds.planCardSelected, hasBooking && ds.planCardBooked]}
                    onPress={() => compareMode ? toggleSelect(p.id) : openSavedPlan(p)}
                    activeOpacity={0.85}
                  >
                    <View style={ds.planCardTop}>
                      <Text style={ds.planCardIcon}>{EVENT_ICONS[p.event_type] || '🎉'}</Text>
                      {compareMode ? (
                        <View style={[ds.checkbox, isSelected && ds.checkboxActive]}>
                          {isSelected && <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>✓</Text>}
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => deletePlan(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <X size={15} color={MUTED} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={ds.planCardTitle} numberOfLines={1}>{p.title}</Text>
                    <Text style={ds.planCardMeta}>
                      {p.event_date ? new Date(p.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set'}
                      {p.total_budget ? `  ·  ₹${(p.total_budget / 100000).toFixed(1)}L` : ''}
                    </Text>
                    <View style={ds.planCardFoot}>
                      <View style={[ds.statusBadge, { backgroundColor: st.bg }]}>
                        <Text style={[ds.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {hasBooking && !compareMode ? (
                          <TouchableOpacity style={ds.miniBtn} onPress={() => openPlanBookings(p)}>
                            <Text style={{ fontSize: 13, color: OK }}>✓</Text>
                          </TouchableOpacity>
                        ) : null}
                        {p.event_id && !compareMode && showVisitorList ? (
                          <TouchableOpacity style={ds.miniBtn} onPress={() => openEventTool(p, 'VisitorList')}>
                            <Text style={{ fontSize: 13 }}>🚪</Text>
                          </TouchableOpacity>
                        ) : null}
                        {p.event_id && !compareMode && showGiftStickers ? (
                          <TouchableOpacity style={ds.miniBtn} onPress={() => openEventTool(p, 'GiftStickers')}>
                            <Text style={{ fontSize: 13 }}>🎁</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {compareMode && selectedIds.length >= 2 && (
            <TouchableOpacity style={ds.compareBtn} onPress={openCompare}>
              <Text style={ds.compareBtnText}>Compare {selectedIds.length} plans →</Text>
            </TouchableOpacity>
          )}

          <SectionEyebrow>TOOLS</SectionEyebrow>
          <View style={ds.toolsGrid}>
            {TOOLS.map(tool => (
              <TouchableOpacity
                key={tool.label}
                style={ds.toolCard}
                onPress={() => navigation.navigate(tool.screen, tool.params)}
              >
                <Text style={{ fontSize: 22, marginBottom: 8 }}>{tool.icon}</Text>
                <Text style={ds.toolLabel}>{tool.label}</Text>
                <Text style={ds.toolSub}>{tool.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Modal visible={!!deleteChoiceModal} transparent animationType="fade" onRequestClose={() => setDeleteChoiceModal(null)}>
          <View style={s.deleteOverlay}>
            <View style={s.deleteModal}>
              <View style={s.deleteModalHeader}>
                <Text style={s.deleteModalTitle}>Delete this plan?</Text>
                <TouchableOpacity onPress={() => setDeleteChoiceModal(null)}>
                  <X size={22} color={theme.text} />
                </TouchableOpacity>
              </View>
              <Text style={s.deleteModalHint}>
                "{deleteChoiceModal?.title}" has a guest list, invites, and checklist linked to it under the same name. Delete all of it together, or just remove this plan and leave the rest as-is. Its photo album is never touched either way.
              </Text>
              <TouchableOpacity style={[s.deleteModalBtn, { backgroundColor: '#F44336' }]} onPress={deleteEverything} disabled={deletingPlan}>
                {deletingPlan ? <ActivityIndicator color="#FFF" /> : <Text style={s.deleteModalBtnText}>Delete everything</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[s.deleteModalBtn, { backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border }]} onPress={deletePlanOnly} disabled={deletingPlan}>
                {deletingPlan ? <ActivityIndicator color={theme.text} /> : <Text style={[s.deleteModalBtnText, { color: theme.text }]}>Only delete this plan</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.scroll}
      >

        {/* ── Agent greeting ── */}
        <View style={[s.agentGreeting, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
            <View style={s.agentAvatar}>
              <SparkleIcon style={s.agentAvatarText} />
            </View>
            <View>
              <Text style={s.agentLine1}>Your event agent</Text>
              <Text style={s.agentLine2}>
                {userName ? `What are we planning, ${userName}?` : 'What are we planning?'}
              </Text>
            </View>
          </View>
          <NotificationBell navigation={navigation} />
        </View>

        <PlanHero navigation={navigation} />

        {/* ── Saved plans ── */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionLabel}>
            {savedPlans.length > 0 ? `YOUR PLANS (${savedPlans.length})` : 'CURRENTLY PLANNING'}
          </Text>
          {savedPlans.length > 1 && (
            <TouchableOpacity onPress={() => { setCompareMode(!compareMode); setSelectedIds([]); }}>
              <Text style={s.compareToggle}>{compareMode ? 'Cancel' : 'Compare'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {savedPlans.length > 1 && (
          <View style={s.sortRow}>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[s.sortChip, sortBy === opt.id && s.sortChipActive]}
                onPress={() => setSortBy(opt.id)}
              >
                <Text style={[s.sortChipText, sortBy === opt.id && s.sortChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loadingPlans ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : sortedPlans.length === 0 ? (
          <View style={s.emptyPlanCard}>
            <Text style={s.emptyPlanIcon}>✦</Text>
            <Text style={s.emptyPlanTitle}>No active plan yet</Text>
            <Text style={s.emptyPlanSub}>
              Tell your agent what you're planning above, and it'll start building your event here.
            </Text>
          </View>
        ) : (
          sortedPlans.map(p => {
            const st = STATUS_LABEL[p.status] || STATUS_LABEL.planning;
            const isSelected = selectedIds.includes(p.id);
            const capabilities = resolvePlanCapabilities(p);
            const showVisitorList = isEnabled(capabilities, 'society_gate_pass');
            const showGiftStickers = isEnabled(capabilities, 'gift_qr_stickers');
            const planBookings = bookingsByPlanId[p.id] || [];
            const hasBooking = planBookings.length > 0;
            const content = (
              <View style={[s.planCard, compareMode && isSelected && s.planCardSelected, hasBooking && s.planCardBooked]}>
                {compareMode && (
                  <View style={[s.checkbox, isSelected && s.checkboxActive]}>
                    {isSelected && <Text style={s.checkboxTick}>✓</Text>}
                  </View>
                )}
                <Text style={s.planCardIcon}>{EVENT_ICONS[p.event_type] || '🎉'}</Text>
                <View style={s.planCardInfo}>
                  <Text style={s.planCardTitle}>{p.title}</Text>
                  <Text style={s.planCardMeta}>
                    {p.event_date ? new Date(p.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set'}
                    {p.total_budget ? `  ·  ₹${(p.total_budget / 100000).toFixed(1)}L` : ''}
                  </Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                  <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                </View>
                {hasBooking && !compareMode ? (
                  <TouchableOpacity
                    style={s.bookedTick}
                    onPress={() => openPlanBookings(p)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.bookedTickText}>✓</Text>
                  </TouchableOpacity>
                ) : null}
                {p.event_id && !compareMode && showVisitorList ? (
                  <TouchableOpacity
                    style={s.giftRegisterBtn}
                    onPress={() => openEventTool(p, 'VisitorList')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 16 }}>🚪</Text>
                  </TouchableOpacity>
                ) : null}
                {p.event_id && !compareMode && showGiftStickers ? (
                  <TouchableOpacity
                    style={s.giftRegisterBtn}
                    onPress={() => openEventTool(p, 'GiftStickers')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 16 }}>🎁</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );

            if (compareMode) {
              return (
                <TouchableOpacity key={p.id} style={s.planCardWrap} onPress={() => toggleSelect(p.id)} activeOpacity={0.8}>
                  {content}
                </TouchableOpacity>
              );
            }
            return (
              <SwipeableRow key={p.id} style={s.planCardWrap} onPress={() => openSavedPlan(p)} onDelete={() => deletePlan(p)}>
                {content}
              </SwipeableRow>
            );
          })
        )}

        {compareMode && selectedIds.length >= 2 && (
          <TouchableOpacity style={s.compareBtn} onPress={openCompare}>
            <Text style={s.compareBtnText}>Compare {selectedIds.length} plans →</Text>
          </TouchableOpacity>
        )}

        {/* ── Tools ── */}
        <Text style={[s.sectionLabel, { marginTop: 28, marginBottom: 10 }]}>TOOLS</Text>
        <View style={s.toolsGrid}>
          {TOOLS.map(tool => (
            <TouchableOpacity
              key={tool.label}
              style={[s.toolCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
              onPress={() => navigation.navigate(tool.screen, tool.params)}
            >
              <Text style={s.toolIcon}>{tool.icon}</Text>
              <Text style={[s.toolLabel, { color: theme.text }]}>{tool.label}</Text>
              <Text style={[s.toolSub, { color: theme.textSecondary }]}>{tool.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={!!deleteChoiceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteChoiceModal(null)}
      >
        <View style={s.deleteOverlay}>
          <View style={s.deleteModal}>
            <View style={s.deleteModalHeader}>
              <Text style={s.deleteModalTitle}>Delete this plan?</Text>
              <TouchableOpacity onPress={() => setDeleteChoiceModal(null)}>
                <X size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.deleteModalHint}>
              "{deleteChoiceModal?.title}" has a guest list, invites, and checklist linked to it under the same name. Delete all of it together, or just remove this plan and leave the rest as-is. Its photo album is never touched either way.
            </Text>
            <TouchableOpacity
              style={[s.deleteModalBtn, { backgroundColor: '#F44336' }]}
              onPress={deleteEverything}
              disabled={deletingPlan}
            >
              {deletingPlan ? <ActivityIndicator color="#FFF" /> : <Text style={s.deleteModalBtnText}>Delete everything</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.deleteModalBtn, { backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border }]}
              onPress={deletePlanOnly}
              disabled={deletingPlan}
            >
              {deletingPlan
                ? <ActivityIndicator color={theme.text} />
                : <Text style={[s.deleteModalBtnText, { color: theme.text }]}>Only delete this plan</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CoachMarkTour
        visible={tour.isTourActive}
        steps={CORE_LOOP_TOUR_STEPS}
        onComplete={tour.markComplete}
        onSkip={tour.markComplete}
      />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },

    agentGreeting: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18, marginTop: 8 },
    agentAvatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: theme.text,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: theme.accent, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    },
    agentAvatarText: { fontSize: 17, color: theme.accent },
    agentLine1: { fontSize: 13, color: theme.textSecondary, fontWeight: '600', marginBottom: 2 },
    agentLine2: { fontSize: 20, fontWeight: '700', color: theme.text, letterSpacing: -0.2 },

    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 10 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.6 },
    compareToggle: { fontSize: 12, fontWeight: '700', color: theme.accent },

    sortRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    sortChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    sortChipActive: { backgroundColor: theme.text, borderColor: theme.text },
    sortChipText: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },
    sortChipTextActive: { color: theme.bg },

    loadingBox: { paddingVertical: 30, alignItems: 'center' },

    emptyPlanCard: {
      backgroundColor: theme.cardBg, borderRadius: 20, borderWidth: 0.5, borderColor: theme.border,
      padding: 28, alignItems: 'center',
    },
    emptyPlanIcon: { fontSize: 26, color: theme.textTertiary, marginBottom: 10 },
    emptyPlanTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptyPlanSub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19 },

    planCardWrap: { borderRadius: 18, marginBottom: 10 },
    planCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border,
      padding: 14,
      shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    },
    planCardSelected: { borderColor: theme.accent, borderWidth: 1.5 },
    planCardBooked: { borderColor: '#2E7D32', borderWidth: 1 },
    bookedTick: {
      marginLeft: 8, width: 24, height: 24, borderRadius: 12,
      backgroundColor: '#2E7D32', alignItems: 'center', justifyContent: 'center',
    },
    bookedTickText: { fontSize: 12, color: '#FFF', fontWeight: '700' },
    checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    checkboxActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    checkboxTick: { fontSize: 11, color: '#fff', fontWeight: '700' },
    planCardIcon: { fontSize: 24 },
    planCardInfo: { flex: 1 },
    planCardTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
    planCardMeta: { fontSize: 12, color: theme.textSecondary },
    statusBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
    statusBadgeText: { fontSize: 11, fontWeight: '700' },
    giftRegisterBtn: {
      marginLeft: 8, width: 30, height: 30, borderRadius: 15,
      backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center',
    },

    compareBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 4 },
    compareBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    toolCard: { width: '47%', borderRadius: 16, padding: 16, borderWidth: 0.5 },
    toolIcon: { fontSize: 24, marginBottom: 8 },
    toolLabel: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
    toolSub: { fontSize: 11 },

    deleteOverlay: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 20 },
    deleteModal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 24, gap: 12, width: '100%', maxWidth: 400 },
    deleteModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    deleteModalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    deleteModalHint: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
    deleteModalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    deleteModalBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  });
}

// Desktop content-pane styles — colours all sourced from lib/desktopTheme.js
// (same palette as DesktopEventShell/GuestTable/etc.), fonts limited to
// Fraunces/Cormorant Garamond/Manrope, no new tokens introduced anywhere
// in this file.
const ds = StyleSheet.create({
  page: { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 32, maxWidth: 1100, width: '100%', alignSelf: 'center' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title: { fontFamily: 'Fraunces-SemiBold', fontSize: 28, color: TEXT, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 26 },

  heroWrap: { marginBottom: 30, maxWidth: 640 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 6 },
  compareToggle: { fontSize: 12.5, fontWeight: '700', color: MAROON },
  sortChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 14, backgroundColor: CARD, borderWidth: 1, borderColor: LINE },
  sortChipActive: { backgroundColor: MAROON, borderColor: MAROON },
  sortChipText: { fontSize: 12, color: MUTED, fontWeight: '600' },
  sortChipTextActive: { color: '#fff' },

  emptyCard: { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 40, alignItems: 'center', maxWidth: 480, alignSelf: 'center' },
  emptyTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 17, color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 19, maxWidth: 340 },

  plansGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 8 },
  planCard: {
    width: 260, backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE,
    padding: 16,
  },
  planCardSelected: { borderColor: MAROON, borderWidth: 1.5 },
  planCardBooked: { borderColor: OK, borderWidth: 1 },
  planCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planCardIcon: { fontSize: 24 },
  checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: MAROON, borderColor: MAROON },
  planCardTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 16, color: TEXT, marginBottom: 4 },
  planCardMeta: { fontSize: 12, color: MUTED, marginBottom: 12 },
  planCardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  miniBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },

  compareBtn: { backgroundColor: MAROON, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 26, maxWidth: 300 },
  compareBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  toolCard: { width: 190, borderRadius: 16, padding: 18, backgroundColor: CARD, borderWidth: 1, borderColor: LINE },
  toolLabel: { fontSize: 13.5, fontWeight: '700', color: TEXT, marginBottom: 3, fontFamily: 'Manrope-SemiBold' },
  toolSub: { fontSize: 11.5, color: MUTED },
});
