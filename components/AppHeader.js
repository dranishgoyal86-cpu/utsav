import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowLeft, MagnifyingGlass, PencilSimple } from 'phosphor-react-native';
import GlobalSearch from './GlobalSearch';

// Generic shared header — first-wave rollout to 7 screens (GuestList,
// EventTodo, PlanView's top row, GatePass, ProfileScreen, NotificationsScreen,
// BookingsScreen, DiscoverScreen), not all 69 screens with an inline header
// (see lib/searchRegistry.js's own comment on scope). Deliberately separate
// from components/EventHeader.js (PlanView's richer title/meta/venue block
// — that stays exactly as it is; this only replaces the simple top
// back+title+actions row every screen already has its own copy of).
//
// Real variation found across existing inline headers before writing this:
// tab roots (Profile/Discover) have no back button and a larger left-aligned
// title; sub-screens (GatePass/EventTodo/...) have a back arrow + smaller
// title; some screens' title is tappable (GuestList/PlanView open a rename
// modal); NotificationsScreen's "right action" is a plain text link, not an
// icon button. rightActions is deliberately just "React nodes to render
// as-is" rather than a fixed icon-button shape, to cover all of that.
//
// One deliberate visual change, expected and accepted per the task: this
// component doesn't try to preserve the old "empty spacer view sized to
// match the back button, so a space-between row LOOKS centered" trick some
// screens used — the search icon is always real content on the right now,
// so titles render left-aligned next to the back button instead of visually
// centered. Functionally identical, not pixel-identical.
export default function AppHeader({ title, onBack, onTitlePress, rightActions = [], large, theme, navigation, eventId }) {
  const s = styles(theme);
  const [searchVisible, setSearchVisible] = useState(false);

  const titleText = title ? (
    <Text style={[s.title, large && s.titleLarge]} numberOfLines={1}>{title}</Text>
  ) : null;

  return (
    <>
      <View style={s.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
        ) : null}

        <View style={s.titleWrap}>
          {title && onTitlePress ? (
            <TouchableOpacity style={s.titleRow} onPress={onTitlePress}>
              {titleText}
              <PencilSimple size={14} color={theme.textTertiary} />
            </TouchableOpacity>
          ) : titleText}
        </View>

        <View style={s.rightRow}>
          {rightActions.map((node, i) => (
            <View key={i}>{node}</View>
          ))}
          <TouchableOpacity
            style={s.searchBtn}
            onPress={() => setSearchVisible(true)}
            accessibilityLabel="Search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MagnifyingGlass size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <GlobalSearch
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        navigation={navigation}
        eventId={eventId}
        theme={theme}
      />
    </>
  );
}

function styles(theme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    backBtn: { padding: 4 },
    titleWrap: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    title: { fontSize: 17, fontWeight: '700', color: theme.text },
    titleLarge: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
    rightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    searchBtn: {
      width: 38, height: 38, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border,
    },
  });
}
