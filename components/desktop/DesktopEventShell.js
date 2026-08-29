import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Users, PaperPlaneTilt, ChartBar, CheckSquare, Gift, QrCode, CalendarCheck, GearSix,
} from 'phosphor-react-native';
import TornArch from '../invite/motifs/TornArch';
import { MAROON, MAROON_DEEP, GOLD, GOLD_SOFT } from '../../lib/desktopTheme';

// Wave 12 — desktop event-workspace shell. Same isDesktopWeb-gated
// tabBar-swap idea ProviderERP.js's DesktopSidebar established (the only
// other desktop shell in this app), adapted for a Stack-of-screens
// workspace rather than a Tab.Navigator: each event-workspace screen
// wraps ITSELF in this component when isDesktopWeb, instead of a
// Tab.Navigator prop swap (there's no shared tab navigator here to hook
// into — GuestList/ToranInvites/RsvpDashboard/etc. are sibling
// Stack.Screen pushes, confirmed in Wave 12's own investigation).
//
// Wave 13 — chrome colours now come from lib/desktopTheme.js (shared
// across every desktop screen this wave adds), which itself sources
// MAROON/GOLD from inviteThemes.toran — see that file for the full
// reasoning on why MAROON_DEEP/GOLD_SOFT are the two literal exceptions.

const NAV_ITEMS = [
  { section: 'Manage', key: 'guests', label: 'Guests', icon: Users, screen: 'GuestList' },
  { section: 'Manage', key: 'invites', label: 'Invites', icon: PaperPlaneTilt, screen: 'ToranInvites' },
  { section: 'Manage', key: 'rsvp', label: 'RSVP dashboard', icon: ChartBar, screen: 'RsvpDashboard' },
  { section: 'Manage', key: 'checklist', label: 'Checklist', icon: CheckSquare, screen: 'EventTodo' },
  { section: 'Manage', key: 'gifts', label: 'Gifts', icon: Gift, screen: 'GiftStickers' },
  { section: 'Manage', key: 'gatepasses', label: 'Gate passes', icon: QrCode, screen: 'GatePass' },
  { section: 'Event', key: 'functions', label: 'Functions', icon: CalendarCheck, screen: null },
  { section: 'Event', key: 'settings', label: 'Settings', icon: GearSix, screen: null },
];

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function DesktopEventShell({ activeItem, event, guestCount, guestCountLabel = 'invited', currentUserName, navigation, onOpenFunctions, children }) {
  function navigateTo(item) {
    if (item.key === activeItem) return;
    if (item.key === 'functions') {
      if (onOpenFunctions) onOpenFunctions();
      else Alert.alert('Functions', 'Open this from the Guests screen for now.');
      return;
    }
    if (!item.screen) {
      // Settings — no real event-settings screen exists yet anywhere in
      // this app (confirmed live, not assumed) — an honest placeholder
      // rather than a silent dead link.
      Alert.alert('Coming soon', "Event settings aren't built yet.");
      return;
    }
    navigation.navigate(item.screen, { event, eventId: event?.id });
  }

  const sections = ['Manage', 'Event'];

  return (
    <View style={s.shell}>
      <LinearGradient colors={[MAROON, MAROON_DEEP]} style={s.sidebar}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
          <View style={s.garlandWrap}>
            <TornArch width={220} height={32} color={GOLD_SOFT} />
          </View>
          <View style={s.brand}>
            <View style={s.mark}><Text style={s.markText}>U</Text></View>
            <Text style={s.brandName}>Utsav</Text>
          </View>

          {event ? (
            <View style={s.evtCard}>
              <Text style={s.evtK}>CURRENT EVENT</Text>
              <Text style={s.evtV} numberOfLines={2}>{event.name}</Text>
              {/* guestCountLabel defaults to "invited" (the real total,
                  what GuestList/Checklist/RSVP all show) — the invite
                  designer passes "receiving" instead, since its own count
                  genuinely excludes declines (a different, real number,
                  not the same one mislabeled). Never just "guests" —
                  that's exactly the ambiguity two different real counts
                  can't share. */}
              <Text style={s.evtD}>
                {[event.event_date && formatEventDate(event.event_date), `${guestCount ?? 0} ${guestCountLabel}`].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}

          {sections.map(section => (
            <View key={section}>
              <Text style={s.navLabel}>{section}</Text>
              {NAV_ITEMS.filter(i => i.section === section).map(item => {
                const focused = item.key === activeItem;
                const Icon = item.icon;
                return (
                  <TouchableOpacity key={item.key} style={[s.navItem, focused && s.navItemActive]} onPress={() => navigateTo(item)}>
                    <Icon size={17} color={focused ? GOLD_SOFT : 'rgba(246,233,220,0.75)'} weight={focused ? 'fill' : 'regular'} />
                    <Text style={[s.navItemText, focused && s.navItemTextActive]}>{item.label}</Text>
                    {item.key === 'guests' && guestCount != null && (
                      <View style={s.badge}><Text style={s.badgeText}>{guestCount}</Text></View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={s.sidefoot}>
          <View style={s.avatar}><Text style={s.avatarText}>{(currentUserName || '?')[0].toUpperCase()}</Text></View>
          <View>
            <Text style={s.footName} numberOfLines={1}>{currentUserName || 'Host'}</Text>
            <Text style={s.footRole}>Host</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={s.content} contentContainerStyle={s.contentInner}>
        {children}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: '#FBF6EC' },
  sidebar: {
    width: 250, backgroundColor: MAROON, paddingHorizontal: 14, paddingTop: 8,
    justifyContent: 'space-between',
  },
  garlandWrap: { marginTop: 8, alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 14 },
  mark: { width: 34, height: 34, borderRadius: 11, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: 'CormorantGaramond-SemiBold', fontWeight: '700', fontSize: 17, color: MAROON },
  brandName: { fontFamily: 'Fraunces-SemiBold', fontSize: 19, color: '#fff' },
  evtCard: {
    marginHorizontal: 4, marginBottom: 18, padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(244,197,99,0.22)',
  },
  evtK: { fontSize: 9.5, letterSpacing: 1.4, color: GOLD_SOFT, fontWeight: '700' },
  evtV: { fontFamily: 'CormorantGaramond-Italic', fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 4, lineHeight: 23 },
  evtD: { fontSize: 11, color: 'rgba(246,233,220,0.65)', marginTop: 5 },
  navLabel: { fontSize: 10, letterSpacing: 1.4, color: 'rgba(246,233,220,0.4)', fontWeight: '700', marginHorizontal: 10, marginTop: 14, marginBottom: 6 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 11, marginBottom: 2 },
  navItemActive: { backgroundColor: 'rgba(232,160,32,0.16)' },
  navItemText: { fontSize: 13.5, fontWeight: '600', color: 'rgba(246,233,220,0.82)' },
  navItemTextActive: { color: '#fff', fontWeight: '700' },
  badge: { marginLeft: 'auto', backgroundColor: GOLD_SOFT, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10.5, fontWeight: '800', color: MAROON },
  sidefoot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11.5, fontWeight: '800', color: MAROON },
  footName: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  footRole: { fontSize: 10.5, color: 'rgba(246,233,220,0.55)' },
  content: { flex: 1 },
  contentInner: { padding: 32, maxWidth: 1260, width: '100%', alignSelf: 'center' },
});
