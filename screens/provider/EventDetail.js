import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import {
  ArrowLeft, Wallet, Storefront, Users, Clock,
  UserGear, Package, ChatCircle, FileText,
  CaretRight, Lock, CheckCircle
} from 'phosphor-react-native';
import AppHeader from '../../components/AppHeader';

const STAGES = [
  { id: 1, label: 'Plan', emoji: '📋', color: '#4CAF50' },
  { id: 2, label: 'Prepare', emoji: '⚙️', color: '#FF9800' },
  { id: 3, label: 'Execute', emoji: '🚀', color: '#E8A020' },
];

const MODULES = [
  { id: 'budget', label: 'Budget Tracker', icon: Wallet, stage: 1, screen: 'BudgetTracker', unlockAfter: null, built: true },
  { id: 'vendors', label: 'Vendor Management', icon: Storefront, stage: 1, screen: 'VendorManager', unlockAfter: 'budget', built: true },
  { id: 'guests', label: 'Guest & RSVP', icon: Users, stage: 1, screen: 'GuestManager', unlockAfter: 'vendors', built: true },
  { id: 'timeline', label: 'Event Timeline', icon: Clock, stage: 2, screen: 'EventTimeline', unlockAfter: 'guests', built: true },
  { id: 'team', label: 'Team & Staff', icon: UserGear, stage: 2, screen: 'TeamManager', unlockAfter: 'timeline', built: true },
  { id: 'inventory', label: 'Inventory & Logistics', icon: Package, stage: 2, screen: 'Inventory', unlockAfter: 'team', built: true },
  { id: 'comms', label: 'Client Communication', icon: ChatCircle, stage: 3, screen: 'CommLog', unlockAfter: 'inventory', built: true },
  { id: 'docs', label: 'Documents & Contracts', icon: FileText, stage: 3, screen: 'Documents', unlockAfter: 'comms', built: true },
];

const HINTS = {
  budget: null,
  vendors: 'Set your budget first',
  guests: 'Add at least one vendor first',
  timeline: 'Complete Stage 1 first',
  team: 'Create your timeline first',
  inventory: 'Set up your team first',
  comms: 'Complete Stage 2 first',
  docs: 'Add communication log first',
};

export default function EventDetail({ route, navigation }) {
  const { workspace, userId } = route.params;
  const { theme } = useTheme();
  const s = styles(theme);
  const [completed, setCompleted] = useState(new Set());
  const [ws, setWs] = useState(workspace);

  useEffect(() => {
    checkCompletedModules();
    const unsubscribe = navigation.addListener('focus', checkCompletedModules);
    return unsubscribe;
  }, [navigation]);

  async function checkCompletedModules() {
    const [budget, vendors, guests, timeline, team, inventory, comms, docsData] = await Promise.all([
      supabase.from('event_budget').select('id').eq('workspace_id', workspace.id).single(),
      supabase.from('event_vendors').select('id').eq('workspace_id', workspace.id).limit(1),
      supabase.from('event_guest_list').select('id').eq('workspace_id', workspace.id).limit(1),
      supabase.from('event_timeline').select('id').eq('workspace_id', workspace.id).limit(1),
      supabase.from('event_team').select('id').eq('workspace_id', workspace.id).limit(1),
      supabase.from('event_inventory').select('id').eq('workspace_id', workspace.id).limit(1),
      supabase.from('event_comm_log').select('id').eq('workspace_id', workspace.id).limit(1),
      supabase.from('event_documents').select('id').eq('workspace_id', workspace.id).limit(1),
    ]);

    const done = new Set();
    if (budget.data) done.add('budget');
    if (vendors.data?.length > 0) done.add('vendors');
    if (guests.data?.length > 0) done.add('guests');
    if (timeline.data?.length > 0) done.add('timeline');
    if (team.data?.length > 0) done.add('team');
    if (inventory.data?.length > 0) done.add('inventory');
    if (comms.data?.length > 0) done.add('comms');
    if (docsData.data?.length > 0) done.add('docs');

    setCompleted(done);
  }

  function isUnlocked(module) {
    if (!module.unlockAfter) return true;
    return completed.has(module.unlockAfter);
  }

  function getStageColor(stageId) {
    return STAGES.find(s => s.id === stageId)?.color || theme.accent;
  }

  function handleModulePress(module) {
    if (!module.built) return; // not built yet
    if (!isUnlocked(module)) {
      return; // locked
    }
    navigation.navigate(module.screen, { workspace: ws, userId });
  }

  const stageColor = getStageColor(ws.stage);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader title={ws.event_name} onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      {ws.client_name ? (
        <Text style={[s.headerSub, { paddingHorizontal: 20, marginTop: -10, marginBottom: 10 }]}>{ws.client_name}</Text>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }} showsVerticalScrollIndicator={false}>

        {/* Event Info Card */}
        <View style={s.infoCard}>
          <View style={s.infoRow}>
            {ws.event_date && <Text style={s.infoText}>📅 {ws.event_date}</Text>}
            {ws.venue && <Text style={s.infoText}>📍 {ws.venue}</Text>}
            {ws.guest_count > 0 && <Text style={s.infoText}>👥 {ws.guest_count} guests</Text>}
            {ws.client_phone && <Text style={s.infoText}>📞 {ws.client_phone}</Text>}
          </View>
        </View>

        {/* Stage Stepper */}
        <View style={s.stepper}>
          {STAGES.map((stage, i) => {
            const isActive = ws.stage === stage.id;
            const isDone = ws.stage > stage.id;
            const color = getStageColor(stage.id);
            return (
              <View key={stage.id} style={s.stepperItem}>
                <View style={[
                  s.stepCircle,
                  isDone && { backgroundColor: color, borderColor: color },
                  isActive && { borderColor: color, borderWidth: 2 },
                ]}>
                  {isDone
                    ? <CheckCircle size={18} color="#fff" />
                    : <Text style={[s.stepEmoji]}>{stage.emoji}</Text>
                  }
                </View>
                <Text style={[s.stepLabel, (isActive || isDone) && { color, fontWeight: '700' }]}>
                  {stage.label}
                </Text>
                {i < STAGES.length - 1 && (
                  <View style={[s.stepLine, { backgroundColor: ws.stage > stage.id ? color : theme.border }]} />
                )}
              </View>
            );
          })}
        </View>

        {/* Modules by Stage */}
        {STAGES.map(stage => (
          <View key={stage.id} style={s.stageSection}>
            <View style={s.stageTitleRow}>
              <View style={[s.stageDot, { backgroundColor: getStageColor(stage.id) }]} />
              <Text style={s.stageTitle}>Stage {stage.id}: {stage.label}</Text>
            </View>
            <View style={s.moduleList}>
              {MODULES.filter(m => m.stage === stage.id).map(module => {
                const unlocked = isUnlocked(module) && module.built;
                const done = completed.has(module.id);
                const IconComp = module.icon;
                const color = getStageColor(stage.id);
                const hint = !module.built
                  ? 'Coming soon'
                  : !isUnlocked(module)
                    ? HINTS[module.id]
                    : null;
                return (
                  <TouchableOpacity
                    key={module.id}
                    style={[s.moduleCard, !unlocked && s.moduleCardLocked]}
                    onPress={() => handleModulePress(module)}
                    activeOpacity={unlocked ? 0.8 : 1}
                    disabled={!unlocked}
                  >
                    <View style={[s.moduleIcon, { backgroundColor: unlocked ? color + '22' : theme.border + '33' }]}>
                      <IconComp size={20} color={unlocked ? color : theme.subtext} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.moduleLabel, !unlocked && { color: theme.subtext }]}>
                        {module.label}
                      </Text>
                      {hint && (
                        <Text style={s.moduleHint}>{hint}</Text>
                      )}
                    </View>
                    {done
                      ? <CheckCircle size={18} color={color} />
                      : unlocked
                        ? <CaretRight size={18} color={theme.subtext} />
                        : <Lock size={16} color={theme.border} />
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: theme.border, gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  headerSub: { fontSize: 13, color: theme.subtext, marginTop: 2 },
  infoCard: {
    backgroundColor: theme.card, borderRadius: 14,
    padding: 14, borderWidth: 0.5, borderColor: theme.border,
  },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoText: { fontSize: 13, color: theme.subtext },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', position: 'relative', gap: 0,
  },
  stepperItem: { flex: 1, alignItems: 'center', gap: 6, position: 'relative' },
  stepCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.inputBg, borderWidth: 1.5,
    borderColor: theme.border, alignItems: 'center', justifyContent: 'center',
  },
  stepEmoji: { fontSize: 18 },
  stepLabel: { fontSize: 11, color: theme.subtext, fontWeight: '500' },
  stepLine: {
    position: 'absolute', top: 19, left: '60%', right: '-40%',
    height: 2, zIndex: -1,
  },
  stageSection: { gap: 10 },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  stageTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  moduleList: { gap: 8 },
  moduleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.card, borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: theme.border, gap: 12,
  },
  moduleCardLocked: { opacity: 0.5 },
  moduleIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  moduleLabel: { fontSize: 14, fontWeight: '600', color: theme.text },
  moduleHint: { fontSize: 11, color: theme.subtext, marginTop: 2 },
});