import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, useWindowDimensions
} from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { supabase } from './supabase';
import { ThemeProvider, useTheme } from './ThemeContext';
import { registerTourTarget } from './lib/tourTargets';

import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import RSVPScreen from './screens/RSVPScreen';
import GuestPassScreen from './screens/GuestPassScreen';
import GuestSignup from './screens/GuestSignup';
import DelegateRedeem from './screens/DelegateRedeem';
import { linkGuestAccountByPhone } from './helpers';

// Crash/error + basic performance reporting. Reads the DSN from app.json's
// extra.sentryDsn (a Sentry DSN is meant to be embedded in client bundles —
// not a secret the way an API key is — so keeping it in app.json rather
// than a server-side env var is correct here, not a shortcut). Deliberately
// a no-op until a real DSN is set: app.json ships with "" today, so this
// runs and does nothing rather than erroring or sending events to nobody.
// __DEV__ is also excluded — local Metro errors shouldn't show up as
// production crashes.
const SENTRY_DSN = Constants.expoConfig?.extra?.sentryDsn || '';
if (SENTRY_DSN && !__DEV__) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
  });
}

// Held visible (see App() below) until Toran's invite-card fonts resolve —
// a flash of fallback font on an invite card is the exact failure this
// exists to prevent. Called at module scope, per expo-splash-screen's own
// requirement.
SplashScreen.preventAutoHideAsync().catch(() => {});

const navigationRef = createNavigationContainerRef();
const PENDING_DELEGATE_CODE_KEY = 'pending_delegate_code';

// A delegate invite tapped while logged out (see DelegateRedeem.js) stashes
// its code in AsyncStorage since the whole navigator tree remounts into a
// different branch the instant session flips (NOT LOGGED IN and CUSTOMER
// are separate Stack.Navigator subtrees here, not just different screens on
// one stack) — so route params alone can't survive a Login/Signup round
// trip. Called from fetchUserRole() below, right after a role is resolved,
// same "runs on every fresh login/signup/session-restore" point
// linkGuestAccountByPhone() already uses for its own idempotent catch-up.
async function resumePendingDelegateInvite() {
  const code = await AsyncStorage.getItem(PENDING_DELEGATE_CODE_KEY).catch(() => null);
  if (!code) return;
  await AsyncStorage.removeItem(PENDING_DELEGATE_CODE_KEY).catch(() => {});
  const tryNavigate = (attemptsLeft) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('DelegateRedeem', { inviteCode: code });
    } else if (attemptsLeft > 0) {
      setTimeout(() => tryNavigate(attemptsLeft - 1), 200);
    }
  };
  tryNavigate(15); // up to ~3s for the freshly-remounted navigator to mount
}

// Registers the background geofence task (see lib/geofenceTask.js) once at
// startup — TaskManager.defineTask() has to run at module scope, not inside
// a component, same constraint GuestList.js already works around for other
// native-only requires. Background geofencing has no real web equivalent
// (expo-task-manager's web stub can never actually fire a task), so this is
// native-only, matching every other native-only require in this codebase.
if (Platform.OS !== 'web') {
  require('./lib/geofenceTask');
}
import DiscoverScreen from './screens/customer/DiscoverScreen';
import PlanScreen from './screens/customer/PlanScreen';
import BookingsScreen from './screens/customer/BookingsScreen';
import ProfileScreen from './screens/customer/ProfileScreen';
import ProviderProfile from './screens/customer/ProviderProfile';
import CreateBookingScreen from './screens/customer/CreateBookingScreen';
import GuestAccess from './screens/customer/GuestAccess';
import FaceScan from './screens/customer/FaceScan';
import EventPlanner from './screens/customer/EventPlanner';
import SlotPrompt from './screens/customer/SlotPrompt';
import PlanView from './screens/customer/PlanView';
import ItemDetail from './screens/customer/ItemDetail';
import VenuePicker from './screens/customer/VenuePicker';
import GuestList from './screens/customer/GuestList';
import SeatingChart from './screens/customer/SeatingChart';
import GatePass from './screens/customer/GatePass';
import PassIssue from './screens/customer/PassIssue';
import ToranInvites from './screens/customer/ToranInvites';
import RsvpDashboard from './screens/customer/RsvpDashboard';
import PassCard from './screens/customer/PassCard';
import PassScanner from './screens/customer/PassScanner';
import GiftStickers from './screens/customer/GiftStickers';
import VisitorList from './screens/customer/VisitorList';
import ReturnGifts from './screens/customer/ReturnGifts';
import ReciprocityLedger from './screens/customer/ReciprocityLedger';
import EventTodo from './screens/customer/EventTodo';
import WriteReview from './screens/customer/WriteReview';
import ProviderReviews from './screens/customer/ProviderReviews';
import PaymentReceipt from './screens/customer/PaymentReceipt';
import ShareEventPhotos from './screens/customer/ShareEventPhotos';
import ChatScreen from './screens/customer/ChatScreen';
import InboxScreen from './screens/customer/InboxScreen';
import NotificationsScreen from './screens/customer/NotificationsScreen';
import ProviderERP from './screens/provider/ProviderERP';
import AddServiceScreen from './screens/provider/AddServiceScreen';
import BulkImportServices from './screens/provider/BulkImportServices';
import PortfolioScreen from './screens/provider/PortfolioScreen';
import AvailabilityScreen from './screens/provider/AvailabilityScreen';
import VerificationScreen from './screens/provider/VerificationScreen';
import AdminPanel from './screens/admin/AdminPanel';
import SavedProviders from './screens/customer/SavedProviders';
import BlockedProviders from './screens/customer/BlockedProviders';
import * as Linking from 'expo-linking';
import { Sparkle, Compass, CalendarCheck, User } from 'phosphor-react-native';
import linking from './linking';
import SearchScreen from './screens/customer/SearchScreen';
import ComparePlans from './screens/customer/ComparePlans';
import PersonalVendors from './screens/customer/PersonalVendors';
import PersonalVendorChat from './screens/customer/PersonalVendorChat';
import AlbumsScreen from './screens/customer/AlbumsScreen';
import AlbumDetailScreen from './screens/customer/AlbumDetailScreen';
import CameraCapture from './screens/customer/CameraCapture';
import AlbumModeration from './screens/customer/AlbumModeration';
import { Images } from 'phosphor-react-native';
import EventWorkspace from './screens/provider/EventWorkspace';
import EventDetail from './screens/provider/EventDetail';
import BudgetTracker from './screens/provider/modules/BudgetTracker';
import VendorManager from './screens/provider/modules/VendorManager';
import GuestManager from './screens/provider/modules/GuestManager';
import EventTimeline from './screens/provider/modules/EventTimeline';
import TeamManager from './screens/provider/modules/TeamManager';
import Inventory from './screens/provider/modules/Inventory';
import CommLog from './screens/provider/modules/CommLog';
import Documents from './screens/provider/modules/Documents';
import ProviderInbox from './screens/provider/ProviderInbox';
import ClaimBusiness from './screens/customer/ClaimBusiness';
import ClaimVendorFlow from './screens/ClaimVendorFlow';
import ClaimRequests from './screens/admin/ClaimRequests';
import CategoryUpgradeRequests from './screens/admin/CategoryUpgradeRequests';
import CategoryRequests from './screens/admin/CategoryRequests';
import ManageUsers from './screens/admin/ManageUsers';
import CapabilitiesAdmin from './screens/admin/CapabilitiesAdmin';
import BillingProfile from './screens/provider/BillingProfile';
import InvoiceGenerator from './screens/provider/InvoiceGenerator';
import InvoicesList from './screens/provider/InvoicesList';
import ReportsScreen from './screens/provider/ReportsScreen';
import CategoryList from './screens/customer/CategoryList';
import CustomerDesktopSidebar from './components/desktop/CustomerDesktopSidebar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ─── Tab icon — NO hooks allowed in here ───
function TabIcon({ name, focused, theme }) {
  const ICON_MAP = {
    Plan: Sparkle,
    Discover: Compass,
    Bookings: CalendarCheck,
    Albums: Images,
    Profile: User,
  };
  const IconComponent = ICON_MAP[name];
  const color = focused ? theme.accent : theme.navInactiveText;
  // Registers this tab's real on-screen position into lib/tourTargets.js's
  // shared registry, under 'tab-{name}' — CoachMarkTour.js reads from there
  // to spotlight a tab icon, since tabBarIcon is rendered internally by
  // React Navigation and isn't otherwise reachable via a normal prop-drilled
  // ref from a screen. All 5 tabs mount together regardless of which is
  // focused, so this registers once per tab on first render.
  const tourRef = useRef(null);
  useEffect(() => { registerTourTarget(`tab-${name}`, tourRef); }, [name]);
  return (
    <View ref={tourRef} style={{ alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 4, width: '100%' }}>
      <IconComponent size={23} color={color} weight={focused ? 'fill' : 'regular'} />
      <Text
        numberOfLines={1}
        // "Discover"/"Bookings" are the longest labels (8 chars) — at a
        // fixed 9px they were clipping on narrower phones and on any device
        // with a larger system font-size setting (fontSize doesn't scale
        // with the tab's actual width, only the container does). Letting
        // the text shrink to fit instead of a fixed size guarantees every
        // label stays fully visible regardless of screen width or the
        // user's accessibility text-size setting.
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{
          fontSize: 9,
          color,
          fontWeight: focused ? '700' : '500',
          textAlign: 'center',
        }}
      >
        {name}
      </Text>
    </View>
  );
}

// ─── Coming soon placeholder — NO hooks ───
function ComingSoon({ route, navigation }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F8F6' }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>🚧</Text>
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 6 }}>{route.name}</Text>
      <Text style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>Coming soon!</Text>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ backgroundColor: '#1A1A1A', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
      >
        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>← Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

// Providers already get a desktop sidebar (ProviderERP.js) above this width
// on the web build — customers/hosts get the exact same treatment here,
// via the exact same Tab.Navigator tabBar-swap mechanism, just restyled
// with the maroon/gold identity (CustomerDesktopSidebar.js) instead of
// ProviderERP's neutral one. Native (phone/tablet app) always keeps the
// mobile bar regardless of width — this is specifically a web-desktop thing.
const CUSTOMER_DESKTOP_BREAKPOINT = 768;

// ─── Customer bottom tabs — standard flush bar (mobile/narrow-web) or
//     desktop sidebar (wide web) ───
function CustomerTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= CUSTOMER_DESKTOP_BREAKPOINT;
  const [headerProfile, setHeaderProfile] = useState(null);

  // Only needed for the desktop sidebar's footer (name) — mobile's default
  // tab bar has no such footer, so nothing is lost skipping this on native;
  // fetching unconditionally is harmless either way (one small, already-
  // proven-fast query).
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from('users').select('name').eq('id', session.user.id).maybeSingle();
      setHeaderProfile({ name: data?.name || null });
    })();
  }, []);

  return (
    <Tab.Navigator
      tabBar={isDesktopWeb
        ? (props) => <CustomerDesktopSidebar {...props} headerProfile={headerProfile} />
        : undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarPosition: isDesktopWeb ? 'left' : 'bottom',
        // Only read on the mobile/narrow-web branch — the desktop branch
        // replaces the whole tabBar renderer above, so none of this
        // applies there.
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
        // React Navigation's default per-tab horizontal padding was eating
        // into the already-tight width 5 tabs leaves for "Discover"/
        // "Bookings" — reclaiming it so the custom icon+label in
        // tabBarIcon gets the full tab width to work with.
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} theme={theme} />
        ),
      })}
    >
      <Tab.Screen name="Plan" component={PlanScreen} />
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      <Tab.Screen name="Albums" component={AlbumsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
// ─── Main app logic ───
function MainApp() {
  const { theme } = useTheme();
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [checking, setChecking] = useState(true);
  const [suspendedInfo, setSuspendedInfo] = useState(null);

  useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    setSession(session);
    if (session) await fetchUserRole(session.user);
    setChecking(false);
  });

  const { data: listener } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      setSession(session);
      if (session && _event === 'SIGNED_IN') {
        await fetchUserRole(session.user);
      } else if (!session) {
        setUserRole(null);
      }
    }
  );

  return () => listener.subscription.unsubscribe();
}, []);

  // Checks for a published EAS Update on launch and applies it immediately
  // (a brief reload) rather than waiting for the user's next natural cold
  // start. Updates.isEnabled is false in Expo Go, dev-client builds, and on
  // web, so this is a genuine no-op everywhere except a real
  // preview/production build that shipped with expo-updates configured —
  // safe to run unconditionally. Independent of auth state on purpose: an
  // update should apply whether or not anyone's logged in yet.
  useEffect(() => {
    async function applyUpdateIfAvailable() {
      if (!Updates.isEnabled) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (err) {
        // Offline, or the update server's briefly unreachable — never
        // block the app on this; it just checks again next launch.
        console.log('Update check error:', err.message);
      }
    }
    applyUpdateIfAvailable();
  }, []);

  // Admin-approved categories (custom_categories, publicly readable — no
  // session needed) merged into the static taxonomy once at startup, so a
  // newly-approved category shows up in every category picker across the
  // app on the next load, with no code change/deploy required. Fire-and-forget
  // rather than gating the loading screen on it — worst case a picker opened
  // in the first instant after launch is momentarily missing a brand-new
  // category, which resolves itself as soon as this resolves.
  useEffect(() => {
    supabase.from('custom_categories').select('name, icon, subcategories')
      .then(({ data, error }) => {
        if (error) { console.log('custom_categories fetch error:', error.message); return; }
        import('./vendorTaxonomy').then(({ registerCustomCategories }) => registerCustomCategories(data));
      });
  }, []);

  useEffect(() => {
    if (!session) return;
    // Respect the user's Profile > Notifications toggle — don't silently
    // re-register (and re-save a push token) for someone who turned it off.
    supabase.from('users').select('notifications_enabled').eq('id', session.user.id).single()
      .then(({ data }) => {
        if (data?.notifications_enabled === false) return;
        import('./notifications').then(({ registerForPushNotifications, savePushToken }) => {
          registerForPushNotifications().then(token => {
            if (token) savePushToken(token);
          });
        }).catch(err => console.log('Notifications import error:', err.message));
      });
  }, [session]);

  async function fetchUserRole(user, attempt = 0) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role, is_admin, is_suspended, suspended_reason, deletion_requested_at, phone')
        .eq('id', user.id)
        .single();

      if (error) {
        setUserRole('customer');
        return;
      }

      // Right after signup, SignupScreen's role-refining upsert (which sets
      // the real role on the users row) can still be in flight when this
      // fetch runs — the SIGNED_IN event fires as soon as auth.signUp()
      // resolves, racing that follow-up write. signup metadata.role is set
      // atomically at signUp() time, so a mismatch against it means the
      // upsert hasn't landed yet, not that the user really is a customer.
      const intendedRole = user.user_metadata?.role;
      if (attempt < 4 && intendedRole === 'provider' && data?.role !== 'provider') {
        await new Promise(resolve => setTimeout(resolve, 400));
        return fetchUserRole(user, attempt + 1);
      }

      // Admin-suspended accounts are blocked here, before a role is ever
      // set — sign out immediately so a stale session can't keep making
      // API calls that RLS would still technically allow.
      if (data?.is_suspended === true) {
        setSuspendedInfo({
          reason: data.suspended_reason || 'Contact support for details.',
          isDeletion: !!data.deletion_requested_at,
        });
        await supabase.auth.signOut();
        setUserRole(null);
        return;
      }
      setSuspendedInfo(null);

      if (data?.is_admin === true) {
        setUserRole('admin');
      } else if (data?.role === 'provider') {
        setUserRole('provider');
      } else {
        setUserRole('customer');
      }

      // Fire-and-forget, on every session (fresh login, signup, and every
      // app-reopen session restore — this function runs on all three) — a
      // guest may get invited to a new event any time after their account
      // already exists, so this has to stay current, not just run once at
      // signup. Idempotent (only fills still-null user_id rows), so calling
      // it this often is harmless, not wasteful in any way that matters.
      if (data?.phone) linkGuestAccountByPhone(data.phone);
      resumePendingDelegateInvite();
    } catch (err) {
      console.log('fetchUserRole exception:', err.message);
      setUserRole('customer');
    }
  }

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (suspendedInfo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: theme.bg }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>{suspendedInfo.isDeletion ? '🗑' : '🚫'}</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 8, textAlign: 'center' }}>
          {suspendedInfo.isDeletion ? 'Account deletion scheduled' : 'Account suspended'}
        </Text>
        <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
          {suspendedInfo.reason}
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: theme.btnPrimary, borderRadius: 14, paddingHorizontal: 26, paddingVertical: 13 }}
          onPress={() => setSuspendedInfo(null)}
        >
          <Text style={{ color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' }}>Back to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {/* ── NOT LOGGED IN ── */}
        {!session ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="GuestSignup" component={GuestSignup} />
            <Stack.Screen name="ClaimVendorFlow" component={ClaimVendorFlow} />
            <Stack.Screen name="RSVP" component={RSVPScreen} />
            <Stack.Screen name="DelegateRedeem" component={DelegateRedeem} />
            <Stack.Screen name="GuestPass" component={GuestPassScreen} />
          </>

        /* ── ADMIN ── */
        ) : userRole === 'admin' ? (
          <>
            <Stack.Screen name="AdminPanel" component={AdminPanel} />
            <Stack.Screen name="ProviderDashboard" component={ProviderERP} />
            <Stack.Screen name="ClaimRequests" component={ClaimRequests} />
            <Stack.Screen name="CategoryUpgradeRequests" component={CategoryUpgradeRequests} />
            <Stack.Screen name="CategoryRequests" component={CategoryRequests} />
            <Stack.Screen name="ManageUsers" component={ManageUsers} />
            <Stack.Screen name="CapabilitiesAdmin" component={CapabilitiesAdmin} />
            <Stack.Screen name="ClaimVendorFlow" component={ClaimVendorFlow} />
            <Stack.Screen name="RSVP" component={RSVPScreen} />
            <Stack.Screen name="DelegateRedeem" component={DelegateRedeem} />
            <Stack.Screen name="GuestPass" component={GuestPassScreen} />
          </>

        /* ── PROVIDER ── */
        ) : userRole === 'provider' ? (
          <>
            <Stack.Screen name="ProviderDashboard" component={ProviderERP} />
            <Stack.Screen name="ClaimVendorFlow" component={ClaimVendorFlow} />
            <Stack.Screen name="RSVP" component={RSVPScreen} />
            <Stack.Screen name="DelegateRedeem" component={DelegateRedeem} />
            <Stack.Screen name="GuestPass" component={GuestPassScreen} />
            <Stack.Screen name="AddService" component={AddServiceScreen} />
            <Stack.Screen name="BulkImportServices" component={BulkImportServices} />
            <Stack.Screen name="Portfolio" component={PortfolioScreen} />
            <Stack.Screen name="Availability" component={AvailabilityScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} />
            <Stack.Screen name="AdminPanel" component={AdminPanel} />
            <Stack.Screen name="EventWorkspace" component={EventWorkspace} />
            <Stack.Screen name="EventDetail" component={EventDetail} />
            <Stack.Screen name="BudgetTracker" component={BudgetTracker} />
            <Stack.Screen name="VendorManager" component={VendorManager} />
            <Stack.Screen name="GuestManager" component={GuestManager} />
            <Stack.Screen name="EventTimeline" component={EventTimeline} />
            <Stack.Screen name="TeamManager" component={TeamManager} />
            <Stack.Screen name="Inventory" component={Inventory} />
            <Stack.Screen name="CommLog" component={CommLog} />
            <Stack.Screen name="Documents" component={Documents} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Inbox" component={ProviderInbox} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="BillingProfile" component={BillingProfile} />
            <Stack.Screen name="InvoiceGenerator" component={InvoiceGenerator} />
            <Stack.Screen name="InvoicesList" component={InvoicesList} />
            <Stack.Screen name="Reports" component={ReportsScreen} />
          </>

        /* ── CUSTOMER ── */
        ) : (
          <>
            <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
            <Stack.Screen name="RSVP" component={RSVPScreen} />
            <Stack.Screen name="DelegateRedeem" component={DelegateRedeem} />
            <Stack.Screen name="GuestPass" component={GuestPassScreen} />
            <Stack.Screen name="ProviderProfile" component={ProviderProfile} />
            <Stack.Screen name="Booking" component={CreateBookingScreen} />
            <Stack.Screen name="GuestAccess" component={GuestAccess} />
            <Stack.Screen name="FaceScan" component={FaceScan} />
            <Stack.Screen name="EventPlanner" component={EventPlanner} />
            <Stack.Screen name="SlotPrompt" component={SlotPrompt} />
            <Stack.Screen name="PlanView" component={PlanView} />
            <Stack.Screen name="ItemDetail" component={ItemDetail} />
            <Stack.Screen name="VenuePicker" component={VenuePicker} />
            <Stack.Screen name="ComparePlans" component={ComparePlans} />
            <Stack.Screen name="GuestList" component={GuestList} />
            <Stack.Screen name="SeatingChart" component={SeatingChart} />
            <Stack.Screen name="GatePass" component={GatePass} />
            <Stack.Screen name="PassIssue" component={PassIssue} />
            <Stack.Screen name="ToranInvites" component={ToranInvites} />
            <Stack.Screen name="RsvpDashboard" component={RsvpDashboard} />
            <Stack.Screen name="PassCard" component={PassCard} />
            <Stack.Screen name="PassScanner" component={PassScanner} />
            <Stack.Screen name="GiftStickers" component={GiftStickers} />
            <Stack.Screen name="VisitorList" component={VisitorList} />
            <Stack.Screen name="ReturnGifts" component={ReturnGifts} />
            <Stack.Screen name="ReciprocityLedger" component={ReciprocityLedger} />
            <Stack.Screen name="EventTodo" component={EventTodo} />
            <Stack.Screen name="WriteReview" component={WriteReview} />
            <Stack.Screen name="ProviderReviews" component={ProviderReviews} />
            <Stack.Screen name="PaymentReceipt" component={PaymentReceipt} />
            <Stack.Screen name="ShareEventPhotos" component={ShareEventPhotos} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Inbox" component={InboxScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="MyBookings" component={ComingSoon} />
            <Stack.Screen name="CategoryList" component={CategoryList} />
            <Stack.Screen name="SavedProviders" component={SavedProviders} />
            <Stack.Screen name="BlockedProviders" component={BlockedProviders} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="PersonalVendors" component={PersonalVendors} />
            <Stack.Screen name="PersonalVendorChat" component={PersonalVendorChat} />
            <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
            <Stack.Screen name="CameraCapture" component={CameraCapture} />
            <Stack.Screen name="AlbumModeration" component={AlbumModeration} />
            <Stack.Screen name="ClaimBusiness" component={ClaimBusiness} />
            <Stack.Screen name="ClaimVendorFlow" component={ClaimVendorFlow} />
          </>
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ─── Root export — ThemeProvider wraps everything ───
function App() {
  const [fontsLoaded, fontError] = useFonts({
    'CormorantGaramond-SemiBold': require('./assets/fonts/CormorantGaramond-SemiBold.ttf'),
    'CormorantGaramond-Italic': require('./assets/fonts/CormorantGaramond-Italic.ttf'),
    'CormorantGaramond-Regular': require('./assets/fonts/CormorantGaramond-Regular.ttf'),
    'Manrope-Regular': require('./assets/fonts/Manrope-Regular.ttf'),
    'Manrope-SemiBold': require('./assets/fonts/Manrope-SemiBold.ttf'),
    'TiroDevanagariHindi-Regular': require('./assets/fonts/TiroDevanagariHindi-Regular.ttf'),
    'Fraunces-SemiBold': require('./assets/fonts/Fraunces-SemiBold.ttf'),
    'Fraunces-LightItalic': require('./assets/fonts/Fraunces-LightItalic.ttf'),
    'Fraunces-Bold': require('./assets/fonts/Fraunces-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Splash stays up (nothing rendered) until fonts settle either way — a
  // font load failure shouldn't hard-block the app forever, just fall
  // through to system fonts once fontError is set.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Sentry.wrap is a no-op passthrough when Sentry.init() above was never
// called (no DSN configured yet, or __DEV__) — safe to apply unconditionally
// rather than branching the export itself.
export default Sentry.wrap(App);