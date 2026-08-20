import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Switch, Share, Platform, Modal,
  useWindowDimensions, Image, Linking, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { PUBLIC_WEB_URL } from '../../config';
import { useTheme } from '../../ThemeContext';
import {
  notifyBookingConfirmed,
  notifyBookingDeclined,
  notifyServiceConfirmed,
  notifyBookingCompleted,
  notifyDisputeRaised,
} from '../../notifications';
import { canFastPathComplete } from '../../lib/bookingLifecycle';
import { EVENT_PLANNER, getParentCategory, resolveParentCategory } from '../../serviceTemplates';
import { showAlert, confirmDestructive } from '../../helpers';
import { formatTimeLabel } from '../../lib/eventContext';
import SwipeableRow from '../../components/SwipeableRow';
import { useProviderCapabilities } from '../../hooks/useProviderCapabilities';
import { isEnabled } from '../../lib/capabilities';

const Tab = createBottomTabNavigator();

// First-run setup guidance — a brand new provider lands on a dashboard built
// for an active one (earnings, bookings, upcoming events) with none of that
// yet. This tells them exactly what to do first, in order, and gets out of
// the way once they're set up.
const SETUP_STEPS = [
  { key: 'hasService', icon: '🛠️', label: 'Add your first service', screen: 'AddService' },
  { key: 'hasPortfolio', icon: '📸', label: 'Upload portfolio photos', screen: 'Portfolio' },
  { key: 'hasAvailability', icon: '📅', label: 'Set your availability', screen: 'Availability' },
  // Sits before verification deliberately — Verification now reads your
  // business name from here instead of asking again, so filling this in
  // first means the verification form has something to show.
  { key: 'hasBusinessProfile', icon: '🏢', label: 'Complete your Business Profile', screen: 'BillingProfile' },
  { key: 'verified', icon: '✓', label: 'Get verified', screen: 'Verification' },
];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Providers mainly work from a laptop/desktop — above this width on the web
// build, ProviderERP swaps its mobile bottom-tab bar for a persistent left
// sidebar (built below). Native (phone or tablet app) always keeps the
// mobile bar regardless of width — this is specifically a web-desktop thing.
const DESKTOP_BREAKPOINT = 768;

function TabIcon({ name, focused, theme, position = 'bottom' }) {
  const icons = {
    Overview: '◈',
    Bookings: focused ? '◷' : '◻',
    Earnings: '₹',
    Services: focused ? '⊞' : '⊟',
    Profile: focused ? '⊙' : '○',
  };

  // Sidebar row layout — icon and label side by side, left-aligned. The
  // active background/highlight is applied by the caller (DesktopSidebar's
  // own TouchableOpacity), not here, since a sidebar row's whole width
  // should highlight, not just an icon-sized box.
  if (position === 'left') {
    return (
      <>
        <Text style={{ fontSize: 16, width: 22, textAlign: 'center', color: focused ? theme.text : theme.textSecondary }}>
          {icons[name]}
        </Text>
        <Text style={{ fontSize: 13.5, color: focused ? theme.text : theme.textSecondary, fontWeight: focused ? '700' : '500' }}>
          {name}
        </Text>
      </>
    );
  }

  // Auto-sizing, no fixed width — matches CustomerTabs' TabIcon (App.js)
  // exactly. The old fixed width:60 "highlight pill" box was designed for
  // the floating-glass-pill bar this replaced; on the new flush bar it just
  // clipped longer labels ("Overview", "Bookings") into wrapping.
  // numberOfLines={1} is the real guarantee against wrapping regardless of
  // exact per-tab width math on a given device — worst case it ellipsizes
  // ("Overv…") instead of ever breaking onto a second line.
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 4, width: '100%' }}>
      <Text style={{ fontSize: 16, color: focused ? theme.text : theme.textTertiary }}>
        {icons[name]}
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontSize: 9, color: focused ? theme.text : theme.textTertiary, fontWeight: focused ? '700' : '500' }}
      >
        {name}
      </Text>
    </View>
  );
}

// Persistent left sidebar for desktop/web — swapped in via the Tab.Navigator's
// `tabBar` prop only when isDesktopWeb, so mobile's `tabBar` prop stays
// `undefined` and falls back to the library's own default renderer (today's
// floating glass pill bar), completely untouched by anything below.
function DesktopSidebar({ state, descriptors, navigation, theme, headerProfile }) {
  return (
    <View style={{
      width: 232, height: '100%', backgroundColor: theme.cardBg,
      borderRightWidth: 1, borderColor: theme.border, paddingTop: 28, paddingHorizontal: 14,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26, paddingHorizontal: 6 }}>
        {headerProfile?.logoUrl ? (
          <Image source={{ uri: headerProfile.logoUrl }} style={{ width: 38, height: 38, borderRadius: 19 }} />
        ) : (
          <View style={{
            width: 38, height: 38, borderRadius: 19, backgroundColor: theme.accent,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
              {headerProfile?.name?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: 14, color: theme.text }}>
            {headerProfile?.name || 'Provider'}
          </Text>
          <Text style={{ fontSize: 11, color: theme.textSecondary }}>
            {headerProfile?.is_verified ? '✓ Verified' : 'Utsav Provider'}
          </Text>
        </View>
      </View>

      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, marginBottom: 3,
              backgroundColor: focused ? theme.tabBarActiveBg : 'transparent',
            }}
          >
            <TabIcon name={route.name} focused={focused} theme={theme} position="left" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ProviderERP({ navigation }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [headerProfile, setHeaderProfile] = useState(null);

  // Only needed for the desktop sidebar's header (avatar + name) — mobile's
  // default tab bar doesn't have one, so there's nothing to skip fetching
  // for there, but no harm running it unconditionally either (two small,
  // already-proven-fast queries, same fixed name-merge logic as elsewhere:
  // providers.name/business_name are null for every claimed listing today,
  // so users.name is the real fallback — see the bug-sweep pass comments
  // in OverviewScreen.fetchData() for the full story).
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const [{ data: userData }, { data: providerData }] = await Promise.all([
        supabase.from('users').select('name').eq('id', session.user.id).maybeSingle(),
        supabase.from('providers').select('name, business_name, is_verified, logo_url').eq('user_id', session.user.id).maybeSingle(),
      ]);
      setHeaderProfile({
        name: providerData?.name || providerData?.business_name || userData?.name,
        is_verified: providerData?.is_verified,
        logoUrl: providerData?.logo_url || null,
      });
    })();
  }, []);

  return (
    <Tab.Navigator
      tabBar={isDesktopWeb
        ? (props) => <DesktopSidebar {...props} theme={theme} headerProfile={headerProfile} />
        : undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarPosition: isDesktopWeb ? 'left' : 'bottom',
        // Matches CustomerTabs' flush bar exactly (App.js) — same style on
        // both sides of the app. Only affects the mobile bottom bar; the
        // desktop sidebar branch replaces the whole tabBar renderer above,
        // so none of this is read when isDesktopWeb.
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopWidth: 0.5,
          borderTopColor: theme.border,
          height: 60 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(4, insets.bottom),
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} theme={theme} />,
      })}
    >
      <Tab.Screen name="Overview" component={OverviewScreen} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
      <Tab.Screen name="Services" component={ServicesScreen} />
      <Tab.Screen name="Profile" component={ProviderProfileScreen} />
    </Tab.Navigator>
  );
}

function OverviewScreen({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState({ total: 0, thisMonth: 0, growth: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [setup, setSetup] = useState({ hasService: false, hasPortfolio: false, hasAvailability: false, hasBusinessProfile: false, verificationStatus: null });

  // Refetch on every focus, not just mount — otherwise returning from Add
  // Service/Portfolio/Availability/Verification leaves the setup checklist
  // (and earnings/bookings) showing stale pre-navigation data.
  useFocusEffect(
    useCallback(() => { fetchData(); }, [])
  );

  useFocusEffect(
    useCallback(() => { fetchUnreadCount(); }, [])
  );

  async function fetchUnreadCount() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false);
    setUnreadCount(count || 0);
  }

  async function fetchData() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const [{ data: userData }, { data: providerData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('providers').select('*').eq('user_id', session.user.id).maybeSingle(),
      ]);

      // providers.name/business_name are null for every claimed listing
      // (confirmed directly in the DB — claiming never backfills them, the
      // real name only ever lands in users.name at signup). Spreading
      // providerData last let that null silently blank out the real name
      // everywhere profile.name is used, including the customer-facing
      // booking confirm/decline notification text ("Provider confirmed
      // your booking" instead of the actual business name).
      setProfile({ ...userData, ...providerData, name: providerData?.name || providerData?.business_name || userData?.name });

      if (providerData?.id) {
        const [{ count: serviceCount }, { data: verificationRows }, { data: billingRow }] = await Promise.all([
          supabase.from('services').select('id', { count: 'exact', head: true }).eq('provider_id', providerData.id),
          supabase.from('verification_requests').select('status').eq('provider_id', providerData.id)
            .order('submitted_at', { ascending: false }).limit(1),
          supabase.from('provider_billing').select('business_name, state').eq('provider_user_id', session.user.id).maybeSingle(),
        ]);
        setSetup({
          hasService: (serviceCount || 0) > 0,
          hasPortfolio: (providerData.portfolio_photos?.length || 0) > 0,
          hasAvailability: (providerData.working_days?.length || 0) > 0,
          hasBusinessProfile: !!(billingRow?.business_name && billingRow?.state),
          verificationStatus: providerData.is_verified ? 'approved' : (verificationRows?.[0]?.status || null),
        });
      }

      // 'inquiry' rows excluded — a host who chose "Confirm with vendor
      // first" hasn't created a real, payment-committed booking yet, so it
      // has no place in the booking-management Kanban/tabs (the provider
      // sees and responds to it via chat instead, see PersonalVendorChat.js-
      // style confirmation cards).
      const { data: bookingsRaw } = await supabase
        .from('bookings')
        .select('*')
        .eq('provider_id', providerData?.id)
        .neq('status', 'inquiry')
        .order('created_at', { ascending: false });

      const bookingsList = bookingsRaw || [];

      let allBookings = bookingsList;
      if (bookingsList.length > 0) {
        const customerIds = bookingsList.map(b => b.customer_id).filter(Boolean);
        const { data: customersData } = await supabase
          .from('users')
          .select('id, name, phone')
          .in('id', customerIds);

        allBookings = bookingsList.map(b => ({
          ...b,
          users: customersData?.find(u => u.id === b.customer_id) || null,
        }));
      }
      setBookings(allBookings);

      const now = new Date();
      const thisMonth = allBookings.filter(b => {
        const d = new Date(b.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && b.status === 'confirmed';
      });
      const lastMonth = allBookings.filter(b => {
        const d = new Date(b.created_at);
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear() && b.status === 'confirmed';
      });

      const thisMonthTotal = thisMonth.reduce((s, b) => s + (b.total_amount - b.commission_amount), 0);
      const lastMonthTotal = lastMonth.reduce((s, b) => s + (b.total_amount - b.commission_amount), 0);
      const growth = lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : 0;
      const total = allBookings.filter(b => b.status === 'confirmed').reduce((s, b) => s + (b.total_amount - b.commission_amount), 0);

      setEarnings({ total, thisMonth: thisMonthTotal, growth });
    } catch (err) {
      console.log('Overview error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  const pending = bookings.filter(b => b.status === 'pending');
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const upcoming = confirmed.filter(b => new Date(b.event_date) >= new Date());

  if (loading) return <LoadingScreen theme={theme} />;

  return (
    <SafeAreaView style={s.container}>
      {isDesktopWeb ? (
        // The sidebar already shows avatar + name + verified status right
        // next to this — repeating all of that here just duplicated it.
        // Same lightweight pageHeader style every other ERP screen uses.
        <View style={s.pageHeader}>
          <Text style={s.pageTitle}>Overview</Text>
          <TouchableOpacity style={s.headerBellLight} onPress={() => navigation.navigate('Notifications')}>
            <Text style={{ fontSize: 16 }}>🔔</Text>
            {unreadCount > 0 ? <View style={s.headerBellDot} /> : null}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.darkHeader}>
          <View style={s.headerLeft}>
            {profile?.logo_url ? (
              <Image source={{ uri: profile.logo_url }} style={s.headerAvatar} />
            ) : (
            <View style={s.headerAvatar}>
              <Text style={s.headerAvatarText}>{profile?.name?.[0] || '?'}</Text>
            </View>
            )}
            <View>
              <Text style={s.headerGreeting}>Good morning</Text>
              <Text style={s.headerName}>{profile?.name}</Text>
              <Text style={s.headerMeta}>
                {profile?.category} · {profile?.city}
                {profile?.is_verified ? ' · ✓ Verified' : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={s.headerBell} onPress={() => navigation.navigate('Notifications')}>
            <Text style={{ fontSize: 16 }}>🔔</Text>
            {unreadCount > 0 ? <View style={s.headerBellDot} /> : null}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={isDesktopWeb ? { maxWidth: 1100, alignSelf: 'center', width: '100%' } : null}>

        {(() => {
          const stepsDone = SETUP_STEPS.map(step =>
            step.key === 'verified' ? setup.verificationStatus === 'approved' : setup[step.key]
          );
          const doneCount = stepsDone.filter(Boolean).length;
          if (doneCount === SETUP_STEPS.length) return null;

          return (
            <View style={s.setupCard}>
              <View style={s.setupHeaderRow}>
                <Text style={s.setupTitle}>Finish setting up</Text>
                <Text style={s.setupProgress}>{doneCount}/{SETUP_STEPS.length}</Text>
              </View>
              <View style={s.setupTrack}>
                <View style={[s.setupFill, { width: `${(doneCount / SETUP_STEPS.length) * 100}%` }]} />
              </View>
              {SETUP_STEPS.map((step, i) => {
                const done = stepsDone[i];
                const pending = step.key === 'verified' && setup.verificationStatus === 'pending';
                return (
                  <TouchableOpacity
                    key={step.key}
                    style={s.setupRow}
                    onPress={() => navigation.navigate(step.screen)}
                  >
                    <View style={[s.setupCheck, done && s.setupCheckDone]}>
                      {done ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text> : null}
                    </View>
                    <Text style={{ fontSize: 15 }}>{step.icon}</Text>
                    <Text style={[s.setupLabel, done && s.setupLabelDone]}>
                      {step.label}{pending ? ' — pending review' : ''}
                    </Text>
                    <Text style={s.setupChevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })()}

        <View style={s.metricsRow}>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>This month</Text>
            <Text style={s.metricValue}>₹{earnings.thisMonth.toLocaleString()}</Text>
            <Text style={[s.metricGrowth, { color: earnings.growth >= 0 ? theme.statusConfirmedText : theme.statusDeclinedText }]}>
              {earnings.growth >= 0 ? '↑' : '↓'} {Math.abs(earnings.growth)}% vs last month
            </Text>
          </View>
          <View style={[s.metricCard, pending.length > 0 && { borderColor: theme.accent }]}>
            <Text style={s.metricLabel}>Pending</Text>
            <Text style={[s.metricValue, pending.length > 0 && { color: theme.accent }]}>
              {pending.length} bookings
            </Text>
            <Text style={[s.metricGrowth, { color: theme.accent }]}>
              {pending.length > 0 ? 'Needs action !' : 'All clear ✓'}
            </Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statValue}>{confirmed.length}</Text>
            <Text style={s.statLabel}>Confirmed</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={s.statValue}>{upcoming.length}</Text>
            <Text style={s.statLabel}>Upcoming</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={s.statValue}>⭐ {profile?.rating?.toFixed(1) || 'New'}</Text>
            <Text style={s.statLabel}>Rating</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={s.statValue}>₹{(earnings.total / 100000).toFixed(1)}L</Text>
            <Text style={s.statLabel}>Total earned</Text>
          </View>
        </View>

        {pending.length > 0 && (
          <TouchableOpacity style={s.alertBanner} onPress={() => navigation.navigate('Bookings')}>
            <Text style={s.alertText}>
              ⚡ {pending.length} booking{pending.length > 1 ? 's' : ''} need your response
            </Text>
            <Text style={s.alertAction}>View →</Text>
          </TouchableOpacity>
        )}

        <Text style={s.sectionLabel}>QUICK LINKS</Text>
        <View style={s.quickLinksGrid}>
          <TouchableOpacity style={s.quickLink} onPress={() => navigation.navigate('AddService')}>
            <Text style={s.quickLinkIcon}>🛠️</Text>
            <Text style={s.quickLinkText}>Add service</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickLink} onPress={() => navigation.navigate('Portfolio')}>
            <Text style={s.quickLinkIcon}>📸</Text>
            <Text style={s.quickLinkText}>Portfolio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickLink} onPress={() => navigation.navigate('Availability')}>
            <Text style={s.quickLinkIcon}>📅</Text>
            <Text style={s.quickLinkText}>Availability</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickLink} onPress={() => navigation.navigate('EventWorkspace')}>
            <Text style={s.quickLinkIcon}>🎪</Text>
            <Text style={s.quickLinkText}>Event Planner</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickLink} onPress={() => navigation.navigate('Inbox')}>
            <Text style={s.quickLinkIcon}>💬</Text>
            <Text style={s.quickLinkText}>Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickLink} onPress={() => navigation.navigate('InvoiceGenerator')}>
            <Text style={s.quickLinkIcon}>🧾</Text>
            <Text style={s.quickLinkText}>New Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickLink} onPress={() => navigation.navigate('InvoicesList')}>
            <Text style={s.quickLinkIcon}>📋</Text>
            <Text style={s.quickLinkText}>Invoices</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickLink} onPress={() => navigation.navigate('Reports')}>
            <Text style={s.quickLinkIcon}>📊</Text>
            <Text style={s.quickLinkText}>Reports</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>UPCOMING EVENTS</Text>
        {upcoming.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>No upcoming confirmed events</Text>
          </View>
        ) : (
          upcoming.slice(0, 3).map(booking => (
            <View key={booking.id} style={s.eventCard}>
              <View style={s.eventDate}>
                <Text style={s.eventDateDay}>
                  {new Date(booking.event_date).toLocaleDateString('en-IN', { day: 'numeric' })}
                </Text>
                <Text style={s.eventDateMonth}>
                  {new Date(booking.event_date).toLocaleDateString('en-IN', { month: 'short' })}
                </Text>
              </View>
              <View style={s.eventInfo}>
                <Text style={s.eventTitle}>{booking.event_type} · {booking.users?.name}</Text>
                <Text style={s.eventMeta}>{booking.venue} · {booking.guest_count} guests</Text>
                <Text style={s.eventEarning}>
                  ✓ Confirmed · ₹{(booking.total_amount - booking.commission_amount).toLocaleString()}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BookingsScreen({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [viewMode, setViewMode] = useState('list');
  const [profile, setProfile] = useState(null);
  const [planningId, setPlanningId] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [disputeModalBooking, setDisputeModalBooking] = useState(null);
  const [disputeNotes, setDisputeNotes] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [disputing, setDisputing] = useState(false);

  useEffect(() => { fetchBookings(); fetchProviderProfile(); }, []);

  // Mirrors AvailabilityScreen's buildCalendarDays() — a real month grid
  // (correct weekday alignment via leading null padding, correct
  // days-in-month), not the previous fixed 1-30 loop that misaligned every
  // week and silently dropped day 31 in any 31-day month.
  function buildCalendarDays() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }
  function prevMonth() {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  // Jumps a confirmed booking straight into its event-planning workspace —
  // opens the existing one if this booking already has one, otherwise
  // creates it prefilled from the booking so nothing has to be re-typed.
  async function openOrCreateWorkspace(booking) {
    setPlanningId(booking.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: existing } = await supabase
        .from('event_workspace').select('*').eq('booking_id', booking.id).maybeSingle();
      if (existing) {
        navigation.navigate('EventDetail', { workspace: existing, userId: session.user.id });
        return;
      }

      const payload = {
        provider_id: session.user.id,
        booking_id: booking.id,
        event_name: `${booking.event_type || 'Event'} · ${booking.users?.name || 'Client'}`,
        client_name: booking.users?.name || '',
        client_phone: booking.users?.phone || '',
        venue: booking.venue || '',
        event_date: booking.event_date || null,
        guest_count: booking.guest_count || 0,
        stage: 1,
      };
      const { data: created, error } = await supabase
        .from('event_workspace').insert(payload).select().single();
      if (error) throw error;
      navigation.navigate('EventDetail', { workspace: created, userId: session.user.id });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setPlanningId(null);
    }
  }

  async function fetchProviderProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('users').select('name').eq('id', session.user.id).maybeSingle();
      setProfile(data);
    } catch (err) {
      console.log('fetchProviderProfile error:', err.message);
    }
  }

  async function fetchBookings() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: providerData } = await supabase
        .from('providers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (!providerData) { setBookings([]); return; }

      // Same 'inquiry' exclusion as the other bookings fetch in this file —
      // see that one's comment.
      const { data: bookingsRaw } = await supabase
        .from('bookings')
        .select('*')
        .eq('provider_id', providerData.id)
        .eq('archived_by_provider', false)
        .neq('status', 'inquiry')
        .order('event_date', { ascending: true });

      const bookingsList = bookingsRaw || [];

      let merged = bookingsList;
      if (bookingsList.length > 0) {
        const customerIds = bookingsList.map(b => b.customer_id).filter(Boolean);
        const { data: customersData } = await supabase
          .from('users')
          .select('id, name, phone')
          .in('id', customerIds);

        merged = bookingsList.map(b => ({
          ...b,
          users: customersData?.find(u => u.id === b.customer_id) || null,
        }));
      }

      setBookings(merged);
    } catch (err) {
      console.log(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Cancelled/declined/payment_failed bookings are closed with nothing left
  // to action — provider's own list-hide via archived_by_provider, same flag
  // ProviderInbox.js already uses to hide a booking's chat thread. Doesn't
  // touch the customer's copy (archived_by_customer) or the row itself.
  const DELETABLE_STATUSES = ['cancelled', 'declined', 'payment_failed'];

  function deleteBooking(booking) {
    confirmDestructive(
      'Delete this booking?',
      'This removes it from your bookings list. It stays on record for the customer, and this cannot be undone from here.',
      'Delete',
      async () => {
        const { error } = await supabase.from('bookings').update({ archived_by_provider: true }).eq('id', booking.id);
        if (!error) {
          setBookings(prev => prev.filter(b => b.id !== booking.id));
        } else {
          showAlert('Error', error.message);
        }
      }
    );
  }

  function updateStatus(id, status) {
    const label = status === 'confirmed' ? 'Accept' : 'Decline';

    const doUpdate = async () => {
      const { error } = await supabase
        .from('bookings').update({ status }).eq('id', id);
      if (!error) {
        setBookings(prev =>
          prev.map(b => b.id === id ? { ...b, status } : b)
        );
        const booking = bookings.find(b => b.id === id);
        if (booking) {
          if (status === 'confirmed') {
            await notifyBookingConfirmed(booking.customer_id, profile?.name || 'Provider', booking.event_type, booking.id);
          } else {
            await notifyBookingDeclined(booking.customer_id, profile?.name || 'Provider', booking.event_type, booking.id);
          }
        }
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${label} booking? The customer will be notified.`);
      if (confirmed) doUpdate();
    } else {
      Alert.alert(
        `${label} booking?`,
        'The customer will be notified.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: label, style: status === 'declined' ? 'destructive' : 'default', onPress: doUpdate }
        ]
      );
    }
  }

  // Provider-side half of the mutual-confirmation fast path — mirrors
  // BookingsScreen.js's confirmServiceDelivered() exactly, just swapping
  // which timestamp column it writes and who gets notified. This REPLACES
  // the old "Mark as completed" button, which used to call updateStatus(id,
  // 'completed') directly — a unilateral, unguarded status flip with no
  // host confirmation, no safety-net window, and no dispute check at all.
  async function confirmServiceDelivered(booking) {
    setConfirmingId(booking.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('bookings')
        .update({ provider_confirmed_at: now })
        .eq('id', booking.id);
      if (error) throw error;

      const patch = { provider_confirmed_at: now };

      if (canFastPathComplete({ ...booking, provider_confirmed_at: now })) {
        const { error: completeError } = await supabase
          .from('bookings')
          .update({ status: 'completed', completed_at: now })
          .eq('id', booking.id);
        if (completeError) throw completeError;
        patch.status = 'completed';
        patch.completed_at = now;
        await notifyBookingCompleted(booking.customer_id, booking.event_type, booking.id);
      } else {
        await notifyServiceConfirmed(booking.customer_id, profile?.name || 'The provider', booking.event_type, booking.id);
      }

      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, ...patch } : b));
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setConfirmingId(null);
    }
  }

  function openDisputeModal(booking) {
    setDisputeModalBooking(booking);
    setDisputeNotes('');
  }

  async function submitDispute() {
    if (!disputeNotes.trim()) {
      showAlert('Add a note', "Briefly describe what's wrong — this is what the admin team and the host will see.");
      return;
    }
    const booking = disputeModalBooking;
    setDisputing(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('bookings')
        .update({
          dispute_status: 'raised',
          dispute_raised_by: 'provider',
          dispute_raised_at: now,
          dispute_notes: disputeNotes.trim(),
        })
        .eq('id', booking.id);
      if (error) throw error;

      setBookings(prev => prev.map(b => b.id === booking.id
        ? { ...b, dispute_status: 'raised', dispute_raised_by: 'provider', dispute_raised_at: now, dispute_notes: disputeNotes.trim() }
        : b));

      await notifyDisputeRaised(booking.customer_id, profile?.name || 'The provider', booking.event_type, booking.id);

      setDisputeModalBooking(null);
      setDisputeNotes('');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setDisputing(false);
    }
  }

  const tabs = ['pending', 'confirmed', 'all'];
  const filtered = activeTab === 'all' ? bookings : bookings.filter(b => b.status === activeTab);

  const statusConfig = {
    pending: { bg: theme.statusPending, text: theme.statusPendingText, label: '⏳ Pending' },
    confirmed: { bg: theme.statusConfirmed, text: theme.statusConfirmedText, label: '✓ Confirmed' },
    declined: { bg: theme.statusDeclined, text: theme.statusDeclinedText, label: '✗ Declined' },
    completed: { bg: theme.statusConfirmed, text: theme.statusConfirmedText, label: '✓ Completed' },
    cancelled: { bg: theme.bgSecondary, text: theme.textSecondary, label: 'Cancelled' },
  };

  if (loading) return <LoadingScreen theme={theme} />;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Bookings</Text>
        <View style={s.viewToggle}>
          {['list', 'kanban', 'calendar'].map(mode => (
            <TouchableOpacity
              key={mode}
              style={[s.viewBtn, viewMode === mode && s.viewBtnActive]}
              onPress={() => setViewMode(mode)}
            >
              <Text style={[s.viewBtnText, viewMode === mode && s.viewBtnTextActive]}>
                {mode === 'list' ? '≡' : mode === 'kanban' ? '▦' : '📅'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.tabPills}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tabPill, activeTab === tab && s.tabPillActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabPillText, activeTab === tab && s.tabPillTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab !== 'all' && ` (${bookings.filter(b => b.status === tab).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === 'kanban' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
          {['pending', 'confirmed', 'completed'].map(col => (
            <View key={col} style={s.kanbanCol}>
              <Text style={s.kanbanHeader}>
                {col.charAt(0).toUpperCase() + col.slice(1)} ({bookings.filter(b => b.status === col).length})
              </Text>
              {bookings.filter(b => b.status === col).map(b => (
                <View key={b.id} style={s.kanbanCard}>
                  <Text style={s.kanbanName}>{b.users?.name}</Text>
                  <Text style={s.kanbanMeta}>{b.event_type}</Text>
                  <Text style={s.kanbanDate}>
                    {new Date(b.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={s.kanbanAmount}>
                    ₹{(b.total_amount - b.commission_amount).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : viewMode === 'calendar' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={isDesktopWeb ? { maxWidth: 600, alignSelf: 'center', width: '100%' } : null}>
          <View style={s.monthNavRow}>
            <TouchableOpacity style={s.monthNavBtn} onPress={prevMonth}>
              <Text style={s.monthNavBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={s.monthNavTitle}>{MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}</Text>
            <TouchableOpacity style={s.monthNavBtn} onPress={nextMonth}>
              <Text style={s.monthNavBtnText}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={s.calendarGrid}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <Text key={d} style={s.calendarDay}>{d}</Text>
            ))}
            {buildCalendarDays().map((day, i) => {
              if (day === null) return <View key={`empty-${i}`} style={s.calendarCell} />;
              const hasBooking = bookings.some(b => {
                const d = new Date(b.event_date);
                return d.getDate() === day && d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
              });
              return (
                <View key={day} style={[s.calendarCell, hasBooking && s.calendarCellActive]}>
                  <Text style={[s.calendarNum, hasBooking && s.calendarNumActive]}>{day}</Text>
                  {hasBooking && <View style={s.calendarDot} />}
                </View>
              );
            })}
          </View>
          <Text style={[s.sectionLabel, { marginTop: 8 }]}>BOOKINGS THIS MONTH</Text>
          {(() => {
            const monthBookings = bookings.filter(b => {
              const d = new Date(b.event_date);
              return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
            });
            if (monthBookings.length === 0) {
              return (
                <View style={s.emptyBox}>
                  <Text style={s.emptyIcon}>📭</Text>
                  <Text style={s.emptyText}>No bookings this month</Text>
                </View>
              );
            }
            return monthBookings.map(b => (
              <View key={b.id} style={s.listCard}>
                <View style={s.listCardLeft}>
                  <Text style={s.listName}>{b.users?.name}</Text>
                  <Text style={s.listMeta}>{b.event_type} · {new Date(b.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: statusConfig[b.status]?.bg }]}>
                  <Text style={[s.statusText, { color: statusConfig[b.status]?.text }]}>
                    {statusConfig[b.status]?.label}
                  </Text>
                </View>
              </View>
            ));
          })()}
        </View>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={isDesktopWeb ? { maxWidth: 1100, alignSelf: 'center', width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : null}>
          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>📭</Text>
              <Text style={s.emptyText}>No {activeTab} bookings</Text>
            </View>
          ) : (
            filtered.map(booking => {
              const cardBody = (
              <View style={[s.bookingCard, isDesktopWeb && { width: '48%' }]}>
                <View style={s.bookingTop}>
                  <View style={s.bookingAvatar}>
                    <Text style={s.bookingAvatarText}>{booking.users?.name?.[0] || '?'}</Text>
                  </View>
                  <View style={s.bookingInfo}>
                    <Text style={s.bookingName}>{booking.users?.name}</Text>
                    <Text style={s.bookingPhone}>{booking.users?.phone}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: statusConfig[booking.status]?.bg }]}>
                    <Text style={[s.statusText, { color: statusConfig[booking.status]?.text }]}>
                      {statusConfig[booking.status]?.label}
                    </Text>
                  </View>
                </View>

                <View style={s.bookingDetails}>
                  <View style={s.detailRow}>
                    <Text style={s.detailIcon}>🎉</Text>
                    <Text style={s.detailText}>{booking.event_type}</Text>
                  </View>
                  <View style={s.detailRow}>
                    <Text style={s.detailIcon}>📅</Text>
                    <Text style={s.detailText}>
                      {new Date(booking.event_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      {booking.event_time ? ` · ${formatTimeLabel(booking.event_time)}` : ''}
                    </Text>
                  </View>
                  <View style={s.detailRow}>
                    <Text style={s.detailIcon}>👥</Text>
                    <Text style={s.detailText}>{booking.guest_count} guests</Text>
                  </View>
                  <View style={s.detailRow}>
                    <Text style={s.detailIcon}>📍</Text>
                    <Text style={s.detailText}>{booking.venue}</Text>
                  </View>
                  {booking.notes ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailIcon}>📝</Text>
                      <Text style={s.detailText}>{booking.notes}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={s.bookingAmount}>
                  <View>
                    <Text style={s.amountLabel}>Your earning</Text>
                    <Text style={s.amountValue}>
                      ₹{(booking.total_amount - booking.commission_amount).toLocaleString()}
                    </Text>
                  </View>
                  <View>
                    <Text style={s.amountLabel}>Platform fee</Text>
                    <Text style={[s.amountValue, { color: theme.textSecondary, fontSize: 13 }]}>
                      ₹{booking.commission_amount?.toLocaleString()}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[s.chatBtn]}
                  onPress={() => navigation.navigate('Chat', {
                    booking,
                    receiverId: booking.customer_id,
                    receiverName: booking.users?.name,
                  })}
                >
                  <Text style={s.chatBtnText}>💬 Chat with {booking.users?.name}</Text>
                </TouchableOpacity>

                {booking.status === 'pending' && (
                  <View style={s.actionRow}>
                    <TouchableOpacity style={s.declineBtn} onPress={() => updateStatus(booking.id, 'declined')}>
                      <Text style={s.declineBtnText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.acceptBtn} onPress={() => updateStatus(booking.id, 'confirmed')}>
                      <Text style={s.acceptBtnText}>Accept ✓</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {booking.status === 'confirmed' && (
                  <>
                    <TouchableOpacity
                      style={s.planEventBtn}
                      onPress={() => openOrCreateWorkspace(booking)}
                      disabled={planningId === booking.id}
                    >
                      {planningId === booking.id
                        ? <ActivityIndicator size="small" color={theme.accent} />
                        : <Text style={s.planEventBtnText}>📋 Plan this event</Text>
                      }
                    </TouchableOpacity>

                    {/* Mutual-confirmation closure — same
                        event-date-has-passed trigger as BookingsScreen.js's
                        host-side equivalent. Disputed takes priority; a
                        provider who already confirmed sees a waiting note
                        instead of the button again. */}
                    {booking.dispute_status === 'raised' ? (
                      <View style={s.disputeBanner}>
                        <Text style={s.disputeBannerText}>
                          ⚠️ Dispute raised{booking.dispute_raised_by === 'provider' ? ' by you' : ' by the host'} — our team is reviewing it.
                        </Text>
                      </View>
                    ) : new Date(booking.event_date) < new Date() && (
                      booking.provider_confirmed_at ? (
                        <Text style={s.closureWaitingText}>✓ You confirmed — waiting for the host to confirm too.</Text>
                      ) : (
                        <View style={s.actionRow}>
                          <TouchableOpacity
                            style={s.completeBtn}
                            onPress={() => confirmServiceDelivered(booking)}
                            disabled={confirmingId === booking.id}
                          >
                            {confirmingId === booking.id
                              ? <ActivityIndicator size="small" color={theme.statusConfirmedText} />
                              : <Text style={s.completeBtnText}>✓ Confirm service delivered</Text>
                            }
                          </TouchableOpacity>
                          <TouchableOpacity style={s.disputeBtn} onPress={() => openDisputeModal(booking)}>
                            <Text style={s.disputeBtnText}>Something's wrong</Text>
                          </TouchableOpacity>
                        </View>
                      )
                    )}
                  </>
                )}
              </View>
              );
              if (DELETABLE_STATUSES.includes(booking.status)) {
                return (
                  <SwipeableRow
                    key={booking.id}
                    style={isDesktopWeb ? { width: '48%' } : undefined}
                    onDelete={() => deleteBooking(booking)}
                    deleteLabel="Delete"
                  >
                    {cardBody}
                  </SwipeableRow>
                );
              }
              return <View key={booking.id} style={isDesktopWeb ? { width: '48%' } : undefined}>{cardBody}</View>;
            })
          )}
        </View>
        </ScrollView>
      )}

      <Modal visible={!!disputeModalBooking} transparent animationType="fade" onRequestClose={() => setDisputeModalBooking(null)}>
        <KeyboardAvoidingView style={s.disputeOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.disputeModal}>
            <Text style={s.disputeModalTitle}>Raise a dispute</Text>
            <Text style={s.disputeModalHint}>
              This freezes the booking and notifies the host and our team — it won't auto-complete while a dispute is open.
            </Text>
            <TextInput
              style={s.disputeInput}
              placeholder="What went wrong?"
              placeholderTextColor={theme.textTertiary}
              value={disputeNotes}
              onChangeText={setDisputeNotes}
              multiline
              autoFocus
            />
            <View style={s.disputeModalActions}>
              <TouchableOpacity style={s.disputeCancelBtn} onPress={() => setDisputeModalBooking(null)}>
                <Text style={s.disputeCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.disputeSubmitBtn} onPress={submitDispute} disabled={disputing}>
                {disputing ? <ActivityIndicator color="#FFF" /> : <Text style={s.disputeSubmitText}>Submit dispute</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function EarningsScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  useEffect(() => { fetchEarnings(); }, []);

  async function fetchEarnings() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: providerData } = await supabase
        .from('providers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (!providerData) { setBookings([]); return; }

      const { data } = await supabase
        .from('bookings')
        .select('*')
        .eq('provider_id', providerData.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false });
      setBookings(data || []);
    } catch (err) {
      console.log(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Current/previous date range for whichever period is selected — this is
  // what actually makes the Week/Month/Year toggle do something, instead of
  // always comparing calendar months regardless of which one is active.
  function periodRange(p, offset) {
    const now = new Date();
    if (p === 'week') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay() - offset * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { start, end };
    }
    if (p === 'year') {
      const year = now.getFullYear() - offset;
      return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
    }
    const month = now.getMonth() - offset;
    return { start: new Date(now.getFullYear(), month, 1), end: new Date(now.getFullYear(), month + 1, 1) };
  }

  const currentRange = periodRange(period, 0);
  const previousRange = periodRange(period, 1);
  const thisMonth = bookings.filter(b => {
    const d = new Date(b.created_at);
    return d >= currentRange.start && d < currentRange.end;
  });
  const lastMonth = bookings.filter(b => {
    const d = new Date(b.created_at);
    return d >= previousRange.start && d < previousRange.end;
  });

  const thisMonthTotal = thisMonth.reduce((s, b) => s + (b.total_amount - b.commission_amount), 0);
  const lastMonthTotal = lastMonth.reduce((s, b) => s + (b.total_amount - b.commission_amount), 0);
  const totalAll = bookings.reduce((s, b) => s + (b.total_amount - b.commission_amount), 0);
  const growth = lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : 0;

  const byEventType = bookings.reduce((acc, b) => {
    const type = b.event_type || 'Other';
    acc[type] = (acc[type] || 0) + (b.total_amount - b.commission_amount);
    return acc;
  }, {});

  if (loading) return <LoadingScreen theme={theme} />;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Earnings</Text>
        <View style={s.periodToggle}>
          {['week', 'month', 'year'].map(p => (
            <TouchableOpacity
              key={p}
              style={[s.periodBtn, period === p && s.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[s.periodBtnText, period === p && s.periodBtnTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={isDesktopWeb ? { maxWidth: 1100, alignSelf: 'center', width: '100%' } : null}>

        <View style={s.earningsHero}>
          <Text style={s.earningsHeroLabel}>Total earnings</Text>
          <Text style={s.earningsHeroValue}>₹{totalAll.toLocaleString()}</Text>
          <Text style={[s.earningsGrowth, { color: growth >= 0 ? '#4CAF50' : '#EF5350' }]}>
            {growth >= 0 ? '↑' : '↓'} {Math.abs(growth)}% vs last {period}
          </Text>
        </View>

        <View style={s.earningsCards}>
          <View style={s.earningsCard}>
            <Text style={s.earningsCardLabel}>This {period}</Text>
            <Text style={s.earningsCardValue}>₹{thisMonthTotal.toLocaleString()}</Text>
          </View>
          <View style={s.earningsCard}>
            <Text style={s.earningsCardLabel}>Last {period}</Text>
            <Text style={s.earningsCardValue}>₹{lastMonthTotal.toLocaleString()}</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>BY EVENT TYPE</Text>
        <View style={s.breakdownCard}>
          {Object.entries(byEventType).length === 0 ? (
            <Text style={s.emptyText}>No confirmed bookings yet</Text>
          ) : (
            Object.entries(byEventType)
              .sort(([, a], [, b]) => b - a)
              .map(([type, amount]) => {
                const maxAmount = Math.max(...Object.values(byEventType));
                const barWidth = Math.round((amount / maxAmount) * 100);
                return (
                  <View key={type} style={s.breakdownRow}>
                    <Text style={s.breakdownType}>{type}</Text>
                    <View style={s.breakdownBarWrap}>
                      <View style={[s.breakdownBar, { width: `${barWidth}%` }]} />
                    </View>
                    <Text style={s.breakdownAmount}>₹{amount.toLocaleString()}</Text>
                  </View>
                );
              })
          )}
        </View>

        <Text style={s.sectionLabel}>PAYOUT HISTORY</Text>
        {[thisMonth, lastMonth].map((monthData, i) => {
          const monthTotal = monthData.reduce((s, b) => s + (b.total_amount - b.commission_amount), 0);
          const monthName = i === 0 ? `This ${period}` : `Last ${period}`;
          return monthTotal > 0 ? (
            <View key={i} style={s.payoutRow}>
              <View>
                <Text style={s.payoutMonth}>{monthName}</Text>
                <Text style={s.payoutDate}>{monthData.length} bookings</Text>
              </View>
              <Text style={s.payoutAmount}>₹{monthTotal.toLocaleString()}</Text>
            </View>
          ) : null;
        })}

        <Text style={s.sectionLabel}>RECENT TRANSACTIONS</Text>
        {bookings.slice(0, 5).map(b => (
          <View key={b.id} style={s.transactionRow}>
            <View style={s.transactionIcon}>
              <Text style={{ fontSize: 16 }}>🎉</Text>
            </View>
            <View style={s.transactionInfo}>
              <Text style={s.transactionTitle}>{b.event_type}</Text>
              <Text style={s.transactionDate}>
                {new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
            <Text style={s.transactionAmount}>
              + ₹{(b.total_amount - b.commission_amount).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ServicesScreen({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [services, setServices] = useState([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState(null);
  const [analyticsService, setAnalyticsService] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [providerCategory, setProviderCategory] = useState(null);
  const [providerVerified, setProviderVerified] = useState(false);
  const [completedBookingsCount, setCompletedBookingsCount] = useState(0);

  const providerCapabilities = useProviderCapabilities({
    category: providerCategory,
    isVerified: providerVerified,
    completedBookings: completedBookingsCount,
  });

  useEffect(() => { fetchServices(); }, []);

  // Real per-service numbers from bookings.service_id — was a dead button
  // with no onPress at all before this.
  async function openServiceAnalytics(service) {
    setAnalyticsService(service);
    setLoadingAnalytics(true);
    try {
      const { data } = await supabase
        .from('bookings').select('status, total_amount, commission_amount').eq('service_id', service.id);
      const rows = data || [];
      const byStatus = { pending: 0, confirmed: 0, completed: 0, declined: 0, cancelled: 0 };
      let revenue = 0;
      rows.forEach(b => {
        if (byStatus[b.status] !== undefined) byStatus[b.status]++;
        if (b.status === 'confirmed' || b.status === 'completed') revenue += (b.total_amount - b.commission_amount);
      });
      setAnalyticsData({ total: rows.length, byStatus, revenue });
    } catch (err) {
      console.log('Service analytics error:', err.message);
      setAnalyticsData({ total: 0, byStatus: {}, revenue: 0 });
    } finally {
      setLoadingAnalytics(false);
    }
  }

  async function fetchServices() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: providerData } = await supabase
        .from('providers').select('id, category, is_verified').eq('user_id', session.user.id).maybeSingle();
      if (!providerData) return;
      setProviderId(providerData.id);
      setProviderCategory(providerData.category || null);
      setProviderVerified(!!providerData.is_verified);
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerData.id)
        .eq('status', 'completed');
      setCompletedBookingsCount(count || 0);
      const { data } = await supabase
        .from('services').select('*').eq('provider_id', providerData.id);
      const allServices = data || [];

      // A specialist provider only manages services within their own
      // Category — mirrors the same restriction already applied when
      // adding a service (AddServiceScreen.js). Event Planners are the
      // deliberate exception, since spanning categories is the whole
      // point of that status.
      // resolveParentCategory (not getParentCategory) since providerData.category
      // may be the new parent-level value or an old subcategory-level one —
      // no bulk historical migration, so both formats exist in the DB today.
      const lockedParent = (providerData.category && providerData.category !== EVENT_PLANNER)
        ? resolveParentCategory(providerData.category)
        : null;

      if (lockedParent) {
        // A service with no category set can't be confirmed as "wrong" —
        // only hide ones we can actually verify belong to a different
        // Category, so incomplete legacy data doesn't just vanish.
        const visible = allServices.filter(sv => !sv.category || getParentCategory(sv.category) === lockedParent);
        setServices(visible);
        setHiddenCount(allServices.length - visible.length);
      } else {
        setServices(allServices);
        setHiddenCount(0);
      }
    } catch (err) {
      console.log(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleService(id, currentActive) {
    const { error } = await supabase
      .from('services')
      .update({ is_active: !currentActive })
      .eq('id', id);
    if (!error) {
      setServices(prev => prev.map(s => s.id === id ? { ...s, is_active: !currentActive } : s));
    }
  }

  function deleteService(id) {
    const doDelete = async () => {
      await supabase.from('services').delete().eq('id', id);
      setServices(prev => prev.filter(s => s.id !== id));
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Delete service? This cannot be undone.');
      if (confirmed) doDelete();
    } else {
      Alert.alert('Delete service?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete }
      ]);
    }
  }

  if (loading) return <LoadingScreen theme={theme} />;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>My services</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('AddService')}>
          <Text style={s.addBtnText}>+ Add new</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={isDesktopWeb ? { maxWidth: 1100, alignSelf: 'center', width: '100%' } : null}>
        {hiddenCount > 0 && (
          <View style={s.hiddenServicesNote}>
            <Text style={s.hiddenServicesNoteText}>
              {hiddenCount} service{hiddenCount > 1 ? 's' : ''} in a different category {hiddenCount > 1 ? "aren't" : "isn't"} shown here — only services in your registered category are manageable from this screen.
            </Text>
          </View>
        )}
        {services.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>🛠️</Text>
            <Text style={s.emptyTitle}>No services yet</Text>
            <Text style={s.emptyText}>Add your first service to start receiving bookings</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.navigate('AddService')}>
              <Text style={s.emptyBtnText}>+ Add your first service</Text>
            </TouchableOpacity>
          </View>
        ) : (
          services.map(service => (
            <SwipeableRow key={service.id} style={s.serviceCardWrap} onDelete={() => deleteService(service.id)}>
              <View style={s.serviceCard}>
                <View style={s.serviceTop}>
                  <View style={s.serviceIconBox}>
                    <Text style={{ fontSize: 22 }}>🎊</Text>
                  </View>
                  <View style={s.serviceInfo}>
                    <Text style={s.serviceTitle}>{service.title}</Text>
                    <Text style={s.servicePrice}>
                      ₹{service.price_from?.toLocaleString()}
                      {service.price_to ? ` – ₹${service.price_to?.toLocaleString()}` : '+'}
                    </Text>
                  </View>
                  <Switch
                    value={service.is_active !== false}
                    onValueChange={() => toggleService(service.id, service.is_active)}
                    trackColor={{ false: theme.border, true: theme.text }}
                    thumbColor={theme.bg}
                  />
                </View>
                {service.description ? (
                  <Text style={s.serviceDesc} numberOfLines={2}>{service.description}</Text>
                ) : null}
                <View style={s.serviceActions}>
                  <TouchableOpacity style={s.serviceActionBtn} onPress={() => navigation.navigate('AddService', { service })}>
                    <Text style={s.serviceActionText}>✏️ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.serviceActionBtn} onPress={() => openServiceAnalytics(service)}>
                    <Text style={s.serviceActionText}>📊 Analytics</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </SwipeableRow>
          ))
        )}
      </View>
      </ScrollView>

      <Modal
        visible={!!analyticsService}
        transparent
        animationType="fade"
        onRequestClose={() => setAnalyticsService(null)}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1}>{analyticsService?.title}</Text>
              <TouchableOpacity onPress={() => setAnalyticsService(null)}>
                <Text style={{ fontSize: 18, color: theme.text }}>✕</Text>
              </TouchableOpacity>
            </View>
            {loadingAnalytics ? (
              <ActivityIndicator size="large" color={theme.accent} style={{ marginVertical: 30 }} />
            ) : (
              <>
                <View style={s.analyticsStatRow}>
                  <View style={s.analyticsStat}>
                    <Text style={s.analyticsStatValue}>{analyticsData?.total || 0}</Text>
                    <Text style={s.analyticsStatLabel}>Total bookings</Text>
                  </View>
                  <View style={s.analyticsStat}>
                    <Text style={s.analyticsStatValue}>₹{(analyticsData?.revenue || 0).toLocaleString()}</Text>
                    <Text style={s.analyticsStatLabel}>Revenue earned</Text>
                  </View>
                </View>
                {isEnabled(providerCapabilities, 'analytics_dashboard') && analyticsData?.total > 0 && (
                  <View style={s.settingRow}>
                    <Text style={s.settingLabel}>📈 Average booking value</Text>
                    <Text style={s.settingValue}>₹{Math.round((analyticsData.revenue || 0) / analyticsData.total).toLocaleString()}</Text>
                  </View>
                )}
                <View style={s.settingDivider} />
                {[
                  { key: 'pending', label: '⏳ Pending' },
                  { key: 'confirmed', label: '✓ Confirmed' },
                  { key: 'completed', label: '✓ Completed' },
                  { key: 'declined', label: '✗ Declined' },
                  { key: 'cancelled', label: 'Cancelled' },
                ].map(row => (
                  <View key={row.key} style={s.settingRow}>
                    <Text style={s.settingLabel}>{row.label}</Text>
                    <Text style={s.settingValue}>{analyticsData?.byStatus?.[row.key] || 0}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProviderProfileScreen({ navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);
  const [logoUrl, setLogoUrl] = useState(null);
  const [completedBookingsCount, setCompletedBookingsCount] = useState(0);

  const providerCapabilities = useProviderCapabilities({
    category: profile?.category || null,
    isVerified: !!profile?.is_verified,
    completedBookings: completedBookingsCount,
  });

  useFocusEffect(useCallback(() => { fetchProfile(); }, []));

  async function fetchProfile() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const [{ data: userData }, { data: providerData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('providers').select('*').eq('user_id', session.user.id).maybeSingle(),
      ]);
      // See the matching comment in OverviewScreen.fetchData() — providers.name
      // is null for every claimed listing, so it can't just overwrite userData.name.
      setProfile({ ...userData, ...providerData, name: providerData?.name || providerData?.business_name || userData?.name });
      setIsAvailable(providerData?.is_active !== false);
      // logo_url lives on providers (publicly readable), already included in
      // providerData above — provider_billing is owner-only RLS, wrong table
      // for anything that needs to be customer-visible.
      setLogoUrl(providerData?.logo_url || null);

      // featured_listing/analytics_dashboard capability rules gate on
      // lifetime completed bookings, not bookings for any one service — a
      // provider-wide count, not the per-service one openServiceAnalytics()
      // computes on ServicesScreen.
      if (providerData?.id) {
        const { count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', providerData.id)
          .eq('status', 'completed');
        setCompletedBookingsCount(count || 0);
      }
    } catch (err) {
      console.log(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAvailability() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const newVal = !isAvailable;
    await supabase.from('providers').update({ is_active: newVal }).eq('user_id', session.user.id);
    setIsAvailable(newVal);
  }

  async function handleLogout() {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Log out? You will need to sign in again.');
      if (!confirmed) return;
      const { error } = await supabase.auth.signOut();
      if (error) {
        window.alert('Logout failed: ' + error.message);
        console.log('Logout error:', error.message);
      }
    } else {
      Alert.alert('Log out?', 'You will need to sign in again.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) console.log('Logout error:', error.message);
          }
        }
      ]);
    }
  }

  async function handleShareProfile() {
    try {
      const webLink = `${PUBLIC_WEB_URL}/provider/${profile?.id}`;
      await Share.share({
        message: `Book ${profile?.name} on Utsav!\n\n${profile?.category} · ${profile?.city}\n⭐ ${profile?.rating?.toFixed(1) || 'New'} rating\n\n${webLink}`,
        title: `${profile?.name} on Utsav`,
      });
    } catch (err) {
      console.log('Share error:', err.message);
    }
  }

  if (loading) return <LoadingScreen theme={theme} />;

  const initials = profile?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <SafeAreaView style={s.container}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Profile</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={isDesktopWeb ? { maxWidth: 700, alignSelf: 'center', width: '100%' } : null}>

        <View style={s.profileCard}>
          <TouchableOpacity style={{ position: 'relative' }} onPress={() => navigation.navigate('BillingProfile')}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={s.profileAvatar} />
            ) : (
              <View style={s.profileAvatar}>
                <Text style={s.profileAvatarText}>{initials}</Text>
              </View>
            )}
            <View style={s.profileAvatarEditBadge}>
              <Text style={{ fontSize: 10 }}>🏢</Text>
            </View>
          </TouchableOpacity>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{profile?.name}</Text>
            <Text style={s.profileMeta}>{profile?.category} · {profile?.city}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Verification')}>
              <Text style={[s.profileVerified, { color: profile?.is_verified ? theme.statusConfirmedText : theme.accent }]}>
                {profile?.is_verified ? '✓ Verified' : '⏳ Verification pending ›'}
              </Text>
            </TouchableOpacity>
            {isEnabled(providerCapabilities, 'featured_listing') && (
              <Text style={[s.profileVerified, { color: theme.accent }]}>⭐ Featured provider</Text>
            )}
            {profile?.google_maps_url ? (
              <TouchableOpacity onPress={() => Linking.openURL(profile.google_maps_url)}>
                <Text style={s.mapsLink}>📍 View on Google Maps</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={s.shareIconBtn} onPress={handleShareProfile}>
            <Text style={s.shareIconText}>↑</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>AVAILABILITY</Text>
        <View style={s.settingCard}>
          <View style={s.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>Accept new bookings</Text>
              <Text style={[s.settingSubLabel, { color: isAvailable ? theme.statusConfirmedText : theme.statusDeclinedText }]}>
                {isAvailable ? 'You are visible to customers' : 'You are hidden from search'}
              </Text>
            </View>
            <Switch
              value={isAvailable}
              onValueChange={toggleAvailability}
              trackColor={{ false: theme.border, true: theme.text }}
              thumbColor={theme.bg}
            />
          </View>
          <View style={s.settingDivider} />
          <TouchableOpacity style={s.settingRow} onPress={() => navigation.navigate('Availability')}>
            <Text style={s.settingLabel}>📅 Availability calendar</Text>
            <Text style={s.settingValue}>Manage ›</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>PREFERENCES</Text>
        <View style={s.settingCard}>
          <View style={s.settingRow}>
            <Text style={s.settingLabel}>🌙 Dark mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.border, true: theme.text }}
              thumbColor={theme.bg}
            />
          </View>
        </View>

        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.settingCard}>
          <TouchableOpacity style={s.settingRow} onPress={handleLogout}>
            <Text style={[s.settingLabel, { color: theme.statusDeclinedText }]}>Log out</Text>
          </TouchableOpacity>
        </View>

      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LoadingScreen({ theme }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={theme.accent} />
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },

    darkHeader: { backgroundColor: theme.text, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    headerAvatarText: { fontSize: 16, color: '#FFF', fontWeight: '700' },
    headerGreeting: { fontSize: 11, color: theme.textTertiary },
    headerName: { fontSize: 16, fontWeight: '700', color: theme.bg },
    headerMeta: { fontSize: 10.5, color: theme.textTertiary },
    headerBell: { width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
    headerBellLight: { width: 38, height: 38, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    headerBellDot: {
      position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4,
      backgroundColor: '#F44336', borderWidth: 1.5, borderColor: theme.text,
    },

    setupCard: {
      backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.accent + '55',
      marginHorizontal: 16, marginTop: 16, padding: 16, gap: 10,
    },
    setupHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    setupTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    setupProgress: { fontSize: 13, fontWeight: '700', color: theme.accent },
    setupTrack: { height: 5, borderRadius: 3, backgroundColor: theme.border, overflow: 'hidden' },
    setupFill: { height: '100%', backgroundColor: theme.accent, borderRadius: 3 },
    setupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    setupCheck: {
      width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: theme.border,
      alignItems: 'center', justifyContent: 'center',
    },
    setupCheckDone: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
    setupLabel: { flex: 1, fontSize: 13.5, fontWeight: '600', color: theme.text },
    setupLabelDone: { color: theme.textSecondary, textDecorationLine: 'line-through' },
    setupChevron: { fontSize: 18, color: theme.textTertiary },

    metricsRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8 },
    metricCard: { flex: 1, backgroundColor: theme.cardBg, borderRadius: 18, padding: 15, borderWidth: 0.5, borderColor: theme.border },
    metricLabel: { fontSize: 11, color: theme.textSecondary, marginBottom: 7 },
    metricValue: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 4 },
    metricGrowth: { fontSize: 10.5 },

    statsRow: { flexDirection: 'row', marginHorizontal: 16, padding: 15, backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, marginBottom: 14 },
    statBox: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 14, fontWeight: '700', color: theme.text },
    statLabel: { fontSize: 9.5, color: theme.textSecondary, marginTop: 2 },
    statDivider: { width: 0.5, backgroundColor: theme.border },

    alertBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 14, padding: 13, backgroundColor: '#FCEFD9', borderRadius: 14 },
    alertText: { fontSize: 12, color: '#8a5a00', flex: 1, fontWeight: '600' },
    alertAction: { fontSize: 12, color: '#8a5a00', fontWeight: '700' },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, paddingHorizontal: 16, marginBottom: 10, letterSpacing: 0.6 },

    eventCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 11, padding: 14, backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, gap: 12 },
    eventDate: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.statusConfirmed },
    eventDateDay: { fontSize: 16, fontWeight: '700', color: theme.statusConfirmedText },
    eventDateMonth: { fontSize: 9, fontWeight: '600', color: theme.statusConfirmedText },
    eventInfo: { flex: 1 },
    eventTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 2 },
    eventMeta: { fontSize: 11, color: theme.textSecondary, marginBottom: 2 },
    eventEarning: { fontSize: 11, fontWeight: '700', color: theme.statusConfirmedText },

    hiddenServicesNote: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 12, borderRadius: 12, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    hiddenServicesNoteText: { fontSize: 11.5, color: theme.textSecondary, lineHeight: 16 },
    emptyBox: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 32 },
    emptyIcon: { fontSize: 40, marginBottom: 12, opacity: 0.5 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
    emptyBtn: { marginTop: 18, backgroundColor: theme.btnPrimary, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 13 },
    emptyBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
    pageTitle: { fontSize: 26, fontWeight: '700', color: theme.text, letterSpacing: -0.3 },
    viewToggle: { flexDirection: 'row', gap: 4 },
    viewBtn: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    viewBtnActive: { backgroundColor: theme.text },
    viewBtnText: { fontSize: 14, color: theme.textSecondary },
    viewBtnTextActive: { color: theme.bg },

    tabPills: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 14 },
    tabPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    tabPillActive: { backgroundColor: theme.text, borderColor: theme.text },
    tabPillText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
    tabPillTextActive: { color: theme.bg },

    bookingCard: { marginHorizontal: 16, marginBottom: 11, padding: 15, backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
    bookingTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 13, gap: 10 },
    bookingAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    bookingAvatarText: { fontSize: 16, color: '#FFF', fontWeight: '700' },
    bookingInfo: { flex: 1 },
    bookingName: { fontSize: 14, fontWeight: '700', color: theme.text },
    bookingPhone: { fontSize: 12, color: theme.textSecondary },
    statusBadge: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 },
    statusText: { fontSize: 11, fontWeight: '700' },
    bookingDetails: { backgroundColor: theme.bgSecondary, borderRadius: 12, padding: 11, marginBottom: 13, gap: 6 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailIcon: { fontSize: 13, width: 18 },
    detailText: { fontSize: 12, color: theme.textSecondary, flex: 1 },
    bookingAmount: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderTopWidth: 0.5, borderTopColor: theme.border, marginBottom: 11 },
    amountLabel: { fontSize: 11, color: theme.textSecondary, marginBottom: 2 },
    amountValue: { fontSize: 15, fontWeight: '700', color: theme.text },
    chatBtn: { backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginBottom: 10 },
    chatBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },
    actionRow: { flexDirection: 'row', gap: 8 },
    declineBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
    declineBtnText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    acceptBtn: { flex: 2, paddingVertical: 11, borderRadius: 12, backgroundColor: theme.btnPrimary, alignItems: 'center' },
    acceptBtnText: { fontSize: 13, color: theme.btnPrimaryText, fontWeight: '700' },
    completeBtn: { flex: 2, paddingVertical: 11, borderRadius: 12, backgroundColor: theme.statusConfirmed, alignItems: 'center' },
    completeBtnText: { fontSize: 13, color: theme.statusConfirmedText, fontWeight: '700' },
    disputeBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 0.5, borderColor: theme.statusDeclinedText, alignItems: 'center' },
    disputeBtnText: { fontSize: 12, color: theme.statusDeclinedText, fontWeight: '700' },
    closureWaitingText: { fontSize: 12.5, color: theme.textSecondary, fontStyle: 'italic', marginTop: 4 },
    disputeBanner: { padding: 12, borderRadius: 12, backgroundColor: theme.statusDeclined },
    disputeBannerText: { fontSize: 12.5, color: theme.statusDeclinedText, fontWeight: '600' },
    disputeOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 24 },
    disputeModal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 20 },
    disputeModalTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 8 },
    disputeModalHint: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18, marginBottom: 14 },
    disputeInput: { backgroundColor: theme.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, padding: 13, fontSize: 14, color: theme.text, minHeight: 90, textAlignVertical: 'top' },
    disputeModalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    disputeCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center' },
    disputeCancelText: { fontSize: 14, fontWeight: '700', color: theme.text },
    disputeSubmitBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.statusDeclinedText, alignItems: 'center' },
    disputeSubmitText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
    planEventBtn: {
      paddingVertical: 11, borderRadius: 12, alignItems: 'center', marginBottom: 10,
      borderWidth: 1, borderColor: theme.accent,
    },
    planEventBtnText: { fontSize: 13, color: theme.accent, fontWeight: '700' },

    kanbanCol: { width: 200, marginLeft: 16, marginBottom: 16 },
    kanbanHeader: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 9, letterSpacing: 0.5 },
    kanbanCard: { backgroundColor: theme.cardBg, borderRadius: 14, padding: 13, marginBottom: 9, borderWidth: 0.5, borderColor: theme.border },
    kanbanName: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 3 },
    kanbanMeta: { fontSize: 11, color: theme.textSecondary, marginBottom: 2 },
    kanbanDate: { fontSize: 11, color: theme.textSecondary, marginBottom: 4 },
    kanbanAmount: { fontSize: 13, fontWeight: '700', color: theme.text },

    monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
    monthNavBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    monthNavBtnText: { fontSize: 18, color: theme.text, fontWeight: '700' },
    monthNavTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 16 },
    calendarDay: { width: '14.2%', textAlign: 'center', fontSize: 11, color: theme.textSecondary, paddingVertical: 7, fontWeight: '700' },
    calendarCell: { width: '14.2%', alignItems: 'center', paddingVertical: 7 },
    calendarCellActive: { backgroundColor: theme.bgSecondary, borderRadius: 10 },
    calendarNum: { fontSize: 13, color: theme.textSecondary },
    calendarNumActive: { color: theme.text, fontWeight: '700' },
    calendarDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.accent, marginTop: 2 },

    listCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 9, padding: 13, backgroundColor: theme.cardBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border },
    listName: { fontSize: 13, fontWeight: '700', color: theme.text },
    listMeta: { fontSize: 11, color: theme.textSecondary },

    earningsHero: { backgroundColor: theme.text, margin: 16, borderRadius: 20, padding: 22 },
    earningsHeroLabel: { fontSize: 12, color: theme.textTertiary, marginBottom: 7 },
    earningsHeroValue: { fontSize: 30, fontWeight: '700', color: theme.bg, marginBottom: 4, letterSpacing: -0.5 },
    earningsGrowth: { fontSize: 12, fontWeight: '600' },
    earningsCards: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 22 },
    earningsCard: { flex: 1, backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, borderWidth: 0.5, borderColor: theme.border },
    earningsCardLabel: { fontSize: 11, color: theme.textSecondary, marginBottom: 5 },
    earningsCardValue: { fontSize: 16, fontWeight: '700', color: theme.text },

    breakdownCard: { marginHorizontal: 16, backgroundColor: theme.cardBg, borderRadius: 18, padding: 16, marginBottom: 22, borderWidth: 0.5, borderColor: theme.border },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 11, gap: 8 },
    breakdownType: { fontSize: 12, color: theme.text, width: 80 },
    breakdownBarWrap: { flex: 1, height: 6, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' },
    breakdownBar: { height: 6, backgroundColor: theme.text, borderRadius: 3 },
    breakdownAmount: { fontSize: 11, color: theme.textSecondary, width: 60, textAlign: 'right' },

    payoutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 9, padding: 15, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border },
    payoutMonth: { fontSize: 13, fontWeight: '700', color: theme.text },
    payoutDate: { fontSize: 11, color: theme.textSecondary },
    payoutAmount: { fontSize: 16, fontWeight: '700', color: theme.statusConfirmedText },

    transactionRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 9, padding: 13, backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, gap: 10 },
    transactionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center' },
    transactionInfo: { flex: 1 },
    transactionTitle: { fontSize: 13, fontWeight: '700', color: theme.text },
    transactionDate: { fontSize: 11, color: theme.textSecondary },
    transactionAmount: { fontSize: 13, fontWeight: '700', color: theme.statusConfirmedText },

    serviceCardWrap: { marginHorizontal: 16, marginBottom: 11, borderRadius: 18 },
    serviceCard: { padding: 15, backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border },
    serviceTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 },
    serviceIconBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center' },
    serviceInfo: { flex: 1 },
    serviceTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
    servicePrice: { fontSize: 12, color: theme.textSecondary },
    serviceDesc: { fontSize: 12, color: theme.textSecondary, lineHeight: 18, marginBottom: 11 },
    serviceActions: { flexDirection: 'row', gap: 8, borderTopWidth: 0.5, borderTopColor: theme.border, paddingTop: 11 },
    serviceActionBtn: { flex: 1, alignItems: 'center', paddingVertical: 7 },
    serviceActionText: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },

    addBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 9 },
    addBtnText: { color: theme.btnPrimaryText, fontSize: 12, fontWeight: '700' },

    periodToggle: { flexDirection: 'row', backgroundColor: theme.cardBg, borderRadius: 12, padding: 3, gap: 2, borderWidth: 0.5, borderColor: theme.border },
    periodBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
    periodBtnActive: { backgroundColor: theme.text },
    periodBtnText: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },
    periodBtnTextActive: { color: theme.bg },

    profileCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 22, padding: 17, backgroundColor: theme.cardBg, borderRadius: 20, borderWidth: 0.5, borderColor: theme.border, gap: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    profileAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    profileAvatarText: { fontSize: 20, color: '#FFF', fontWeight: '700' },
    profileAvatarEditBadge: {
      position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10,
      backgroundColor: theme.cardBg, borderWidth: 2, borderColor: theme.cardBg,
      alignItems: 'center', justifyContent: 'center',
    },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 3 },
    profileMeta: { fontSize: 12, color: theme.textSecondary, marginBottom: 2 },
    profileVerified: { fontSize: 12, fontWeight: '700' },
    mapsLink: { fontSize: 12, fontWeight: '600', color: theme.accent, marginTop: 3 },
    shareIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center' },
    shareIconText: { fontSize: 16, color: theme.textSecondary },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    modal: { backgroundColor: theme.bg, borderRadius: 20, padding: 20, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1, marginRight: 12 },
    analyticsStatRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    analyticsStat: { flex: 1, backgroundColor: theme.bgSecondary, borderRadius: 14, padding: 14, alignItems: 'center' },
    analyticsStatValue: { fontSize: 20, fontWeight: '700', color: theme.text },
    analyticsStatLabel: { fontSize: 11.5, color: theme.textSecondary, marginTop: 4, textAlign: 'center' },
    settingCard: { marginHorizontal: 16, marginBottom: 18, backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden' },
    settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingVertical: 15 },
    settingLabel: { fontSize: 14, color: theme.text, flex: 1, fontWeight: '500' },
    settingSubLabel: { fontSize: 11, marginTop: 2 },
    settingValue: { fontSize: 13, color: theme.textSecondary },
    settingDivider: { height: 0.5, backgroundColor: theme.border, marginLeft: 17 },

    quickLinksGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 10,
      paddingHorizontal: 16, marginBottom: 18,
    },
    quickLink: {
      width: '30.5%', backgroundColor: theme.cardBg, borderRadius: 16,
      paddingVertical: 16, paddingHorizontal: 6, alignItems: 'center',
      borderWidth: 0.5, borderColor: theme.border, gap: 6,
    },
    quickLinkIcon: { fontSize: 24 },
    quickLinkText: { fontSize: 11.5, color: theme.textSecondary, fontWeight: '600', textAlign: 'center' },
  });
}