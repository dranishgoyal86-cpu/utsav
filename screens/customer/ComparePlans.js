import { useTheme } from '../../ThemeContext';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from '../../components/AppHeader';

const EVENT_ICONS = {
  wedding: '💍', birthday: '🎂', corporate: '💼', engagement: '💑',
  diwali: '🪔', babyshower: '🍼', anniversary: '❤️', other: '🎉',
};

export default function ComparePlans({ navigation, route }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const plans = route?.params?.plans || [];

  function openPlan(savedPlan) {
    navigation.navigate('EventPlanner', { savedPlan });
  }

  // Build a unified list of all budget categories across all plans being compared
  const allCategories = [...new Set(
    plans.flatMap(p => (p.plan_data?.breakdown || []).map(b => b.category))
  )];

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Compare plans" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16 }}>
        <View>

          {/* Plan header cards */}
          <View style={s.row}>
            <View style={s.labelCol} />
            {plans.map(p => (
              <TouchableOpacity key={p.id} style={s.planHeaderCard} onPress={() => openPlan(p)}>
                <Text style={s.planHeaderIcon}>{EVENT_ICONS[p.event_type] || '🎉'}</Text>
                <Text style={s.planHeaderTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={s.planHeaderTap}>Tap to open →</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date row */}
          <View style={s.row}>
            <View style={s.labelCol}><Text style={s.labelText}>Date</Text></View>
            {plans.map(p => (
              <View key={p.id} style={s.cell}>
                <Text style={s.cellText}>
                  {p.event_date ? new Date(p.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </Text>
              </View>
            ))}
          </View>

          {/* City row */}
          <View style={s.row}>
            <View style={s.labelCol}><Text style={s.labelText}>City</Text></View>
            {plans.map(p => (
              <View key={p.id} style={s.cell}>
                <Text style={s.cellText}>{p.city || '—'}</Text>
              </View>
            ))}
          </View>

          {/* Guests row */}
          <View style={s.row}>
            <View style={s.labelCol}><Text style={s.labelText}>Guests</Text></View>
            {plans.map(p => (
              <View key={p.id} style={s.cell}>
                <Text style={s.cellText}>{p.plan_data?.summary?.guests || '—'}</Text>
              </View>
            ))}
          </View>

          {/* Total budget row — highlighted */}
          <View style={[s.row, s.highlightRow]}>
            <View style={s.labelCol}><Text style={s.labelTextBold}>Total budget</Text></View>
            {plans.map(p => (
              <View key={p.id} style={s.cell}>
                <Text style={s.cellTextBold}>
                  {p.total_budget ? `₹${p.total_budget.toLocaleString()}` : '—'}
                </Text>
              </View>
            ))}
          </View>

          {/* Per-category budget rows */}
          {allCategories.map(cat => (
            <View key={cat} style={s.row}>
              <View style={s.labelCol}><Text style={s.labelText}>{cat}</Text></View>
              {plans.map(p => {
                const item = (p.plan_data?.breakdown || []).find(b => b.category === cat);
                return (
                  <View key={p.id} style={s.cell}>
                    <Text style={s.cellText}>
                      {item ? `₹${item.budget.toLocaleString()}` : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}

          {/* Status row */}
          <View style={s.row}>
            <View style={s.labelCol}><Text style={s.labelText}>Status</Text></View>
            {plans.map(p => (
              <View key={p.id} style={s.cell}>
                <Text style={s.cellText}>{(p.status || 'planning').toUpperCase()}</Text>
              </View>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 16, fontWeight: '600', color: theme.text },

    row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: theme.border },
    highlightRow: { backgroundColor: theme.bgSecondary },
    labelCol: { width: 110, paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center' },
    labelText: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },
    labelTextBold: { fontSize: 12, color: theme.text, fontWeight: '700' },
    cell: { width: 150, paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center', borderLeftWidth: 0.5, borderLeftColor: theme.border },
    cellText: { fontSize: 13, color: theme.text },
    cellTextBold: { fontSize: 14, color: theme.accent, fontWeight: '700' },

    planHeaderCard: { width: 150, padding: 14, borderLeftWidth: 0.5, borderLeftColor: theme.border, backgroundColor: theme.cardBg },
    planHeaderIcon: { fontSize: 22, marginBottom: 6 },
    planHeaderTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 4 },
    planHeaderTap: { fontSize: 10, color: theme.accent, fontWeight: '600' },
  });
}