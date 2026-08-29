import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkle, Compass, CalendarCheck, Images, User } from 'phosphor-react-native';
import TornArch from '../invite/motifs/TornArch';
import { MAROON, MAROON_DEEP, GOLD, GOLD_SOFT } from '../../lib/desktopTheme';

// Desktop counterpart to App.js's CustomerTabs bottom bar -- same
// isDesktopWeb tabBar-swap mechanism ProviderERP.js's DesktopSidebar
// established first (Tab.Navigator's own `tabBar` prop, swapped above
// DESKTOP_BREAKPOINT), but restyled with the maroon/gold/cream identity
// every other desktop screen in this arc uses (DesktopEventShell.js /
// lib/desktopTheme.js) instead of ProviderERP's neutral theme-object
// styling -- these are both host-facing screens in the same celebratory
// visual system; a host moving from here into an event's workspace
// shouldn't see the chrome suddenly change character, which is the exact
// inconsistency this wave exists to close.
const NAV_ICONS = { Plan: Sparkle, Discover: Compass, Bookings: CalendarCheck, Albums: Images, Profile: User };

export default function CustomerDesktopSidebar({ state, navigation, headerProfile }) {
  return (
    <LinearGradient colors={[MAROON, MAROON_DEEP]} style={s.sidebar}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        <View style={s.garlandWrap}>
          <TornArch width={220} height={32} color={GOLD_SOFT} />
        </View>
        <View style={s.brand}>
          <View style={s.mark}><Text style={s.markText}>U</Text></View>
          <Text style={s.brandName}>Utsav</Text>
        </View>

        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const Icon = NAV_ICONS[route.name];
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <TouchableOpacity key={route.key} onPress={onPress} style={[s.navItem, focused && s.navItemActive]}>
              {Icon ? <Icon size={17} color={focused ? GOLD_SOFT : 'rgba(246,233,220,0.75)'} weight={focused ? 'fill' : 'regular'} /> : null}
              <Text style={[s.navItemText, focused && s.navItemTextActive]}>{route.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={s.sidefoot}>
        <View style={s.avatar}><Text style={s.avatarText}>{(headerProfile?.name || '?')[0].toUpperCase()}</Text></View>
        <View>
          <Text style={s.footName} numberOfLines={1}>{headerProfile?.name || 'Host'}</Text>
          <Text style={s.footRole}>Host</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  sidebar: { width: 250, paddingHorizontal: 14, paddingTop: 8, justifyContent: 'space-between', height: '100%' },
  garlandWrap: { marginTop: 8, alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 14 },
  mark: { width: 34, height: 34, borderRadius: 11, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: 'CormorantGaramond-SemiBold', fontWeight: '700', fontSize: 17, color: MAROON },
  brandName: { fontFamily: 'Fraunces-SemiBold', fontSize: 19, color: '#fff' },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 11, marginBottom: 2 },
  navItemActive: { backgroundColor: 'rgba(232,160,32,0.16)' },
  navItemText: { fontSize: 13.5, fontWeight: '600', color: 'rgba(246,233,220,0.82)' },
  navItemTextActive: { color: '#fff', fontWeight: '700' },
  sidefoot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11.5, fontWeight: '800', color: MAROON },
  footName: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  footRole: { fontSize: 10.5, color: 'rgba(246,233,220,0.55)' },
});
