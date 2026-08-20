import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, TextInput, ActivityIndicator, ScrollView, RefreshControl, Dimensions, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import {
  ArrowLeft, Plus, CaretRight, CheckCircle,
  Lock, Wallet, Users, Storefront, Clock, UserGear,
  Package, ChatCircle, FileText, X
} from 'phosphor-react-native';
import { showAlert, confirmDestructive } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import SwipeableRow from '../../components/SwipeableRow';

// Every workspace module (Team/Vendors/Inventory/Guests/Timeline/Comms/
// Documents/Budget) stores its rows keyed by workspace_id in its own table —
// deleting a workspace needs to clear all of them first or they'd become
// orphaned rows an RLS-scoped query can never surface again.
const WORKSPACE_CHILD_TABLES = [
  'event_team', 'event_vendors', 'event_inventory', 'event_guest_list',
  'event_timeline', 'event_comm_log', 'event_documents',
  'budget_categories', 'event_budget',
];

const { width } = Dimensions.get('window');

const STAGES = [
  { id: 1, label: 'Plan', color: '#4CAF50' },
  { id: 2, label: 'Prepare', color: '#FF9800' },
  { id: 3, label: 'Execute', color: '#E8A020' },
];

const MODULES = [
  // Stage 1
  { id: 'budget', label: 'Budget Tracker', icon: Wallet, stage: 1, unlockAfter: null, hint: null },
  { id: 'vendors', label: 'Vendor Management', icon: Storefront, stage: 1, unlockAfter: 'budget', hint: 'Set your budget first' },
  { id: 'guests', label: 'Guest & RSVP', icon: Users, stage: 1, unlockAfter: 'vendors', hint: 'Add at least one vendor first' },
  // Stage 2
  { id: 'timeline', label: 'Event Timeline', icon: Clock, stage: 2, unlockAfter: 'guests', hint: 'Complete Stage 1 first' },
  { id: 'team', label: 'Team & Staff', icon: UserGear, stage: 2, unlockAfter: 'timeline', hint: 'Create your timeline first' },
  { id: 'inventory', label: 'Inventory & Logistics', icon: Package, stage: 2, unlockAfter: 'team', hint: 'Set up your team first' },
  // Stage 3
  { id: 'comms', label: 'Client Communication', icon: ChatCircle, stage: 3, unlockAfter: 'inventory', hint: 'Complete Stage 2 first' },
  { id: 'docs', label: 'Documents & Contracts', icon: FileText, stage: 3, unlockAfter: 'comms', hint: 'Add communication log first' },
];

export default function EventWorkspace({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState(null);
  const [form, setForm] = useState({
    event_name: '', client_name: '', client_phone: '',
    venue: '', event_date: '', guest_count: ''
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        fetchWorkspaces(data.user.id);
      }
    });
  }, []);

  async function fetchWorkspaces(uid) {
    try {
      const { data, error } = await supabase
        .from('event_workspace')
        .select('*')
        .eq('provider_id', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setWorkspaces(data || []);
    } catch (err) {
      console.log('fetchWorkspaces error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (userId) fetchWorkspaces(userId);
  }, [userId]);

  async function createWorkspace() {
    if (!form.event_name.trim()) {
      showAlert('Required', 'Please enter an event name.');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        provider_id: userId,
        event_name: form.event_name.trim(),
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim(),
        venue: form.venue.trim(),
        event_date: form.event_date.trim() || null,
        guest_count: parseInt(form.guest_count) || 0,
        stage: 1,
      };
      const { data, error } = await supabase
        .from('event_workspace')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      setWorkspaces(prev => [data, ...prev]);
      setModalVisible(false);
      setForm({ event_name: '', client_name: '', client_phone: '', venue: '', event_date: '', guest_count: '' });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setCreating(false);
    }
  }

  function deleteWorkspace(workspace) {
    confirmDestructive(
      'Delete this event?',
      `"${workspace.event_name}" and everything in it — team, vendors, inventory, guest list, timeline, comms, documents, and budget — will be permanently deleted. This can't be undone.`,
      'Delete',
      async () => {
        try {
          await Promise.all(
            WORKSPACE_CHILD_TABLES.map(table =>
              supabase.from(table).delete().eq('workspace_id', workspace.id)
            )
          );
          const { error } = await supabase.from('event_workspace').delete().eq('id', workspace.id);
          if (error) throw error;
          setWorkspaces(prev => prev.filter(w => w.id !== workspace.id));
        } catch (err) {
          showAlert('Error', err.message);
        }
      }
    );
  }

  function getStageColor(stage) {
    return STAGES.find(s => s.id === stage)?.color || theme.accent;
  }

  function renderWorkspace({ item }) {
    const stageColor = getStageColor(item.stage);
    const stageLabel = STAGES.find(s => s.id === item.stage)?.label;
    return (
      <SwipeableRow
        style={s.cardWrap}
        onPress={() => navigation.navigate('EventDetail', { workspace: item, userId })}
        onDelete={() => deleteWorkspace(item)}
      >
        <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{item.event_name}</Text>
            {item.client_name ? <Text style={s.cardSub}>{item.client_name}</Text> : null}
          </View>
          <View style={[s.stageBadge, { backgroundColor: stageColor + '22' }]}>
            <Text style={[s.stageText, { color: stageColor }]}>{stageLabel}</Text>
          </View>
        </View>
        {item.booking_id ? (
          <View style={s.linkedBadge}>
            <Text style={s.linkedBadgeText}>🔗 Linked to a booking</Text>
          </View>
        ) : null}
        <View style={s.cardMeta}>
          {item.event_date ? <Text style={s.metaText}>📅 {item.event_date}</Text> : null}
          {item.venue ? <Text style={s.metaText}>📍 {item.venue}</Text> : null}
          {item.guest_count ? <Text style={s.metaText}>👥 {item.guest_count} guests</Text> : null}
        </View>
        {/* Stage progress bar */}
        <View style={s.progressRow}>
          {STAGES.map((st, i) => (
            <View key={st.id} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={[
                s.progressDot,
                item.stage >= st.id
                  ? { backgroundColor: getStageColor(st.id) }
                  : { backgroundColor: theme.border }
              ]} />
              <Text style={[s.progressLabel, { color: item.stage >= st.id ? getStageColor(st.id) : theme.subtext }]}>
                {st.label}
              </Text>
              {i < STAGES.length - 1 && (
                <View style={[s.progressLine, { backgroundColor: item.stage > st.id ? getStageColor(st.id) : theme.border }]} />
              )}
            </View>
          ))}
        </View>
        </View>
      </SwipeableRow>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title="Event Workspaces"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="add" style={s.addBtn} onPress={() => setModalVisible(true)}>
            <Plus size={20} color={theme.bg} />
          </TouchableOpacity>,
        ]}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : workspaces.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 48 }}>🎪</Text>
          <Text style={s.emptyTitle}>No events yet</Text>
          <Text style={s.emptySubtitle}>Tap + to create your first event workspace</Text>
        </View>
      ) : (
        <FlatList
          data={workspaces}
          keyExtractor={item => item.id}
          renderItem={renderWorkspace}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        />
      )}

      {/* Create Workspace Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Event</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {[
                { key: 'event_name', placeholder: 'Event name *', keyboard: 'default' },
                { key: 'client_name', placeholder: 'Client name', keyboard: 'default' },
                { key: 'client_phone', placeholder: 'Client phone', keyboard: 'phone-pad' },
                { key: 'venue', placeholder: 'Venue', keyboard: 'default' },
                { key: 'event_date', placeholder: 'Event date (YYYY-MM-DD)', keyboard: 'default' },
                { key: 'guest_count', placeholder: 'Expected guests', keyboard: 'numeric' },
              ].map(field => (
                <TextInput
                  key={field.key}
                  style={[s.input, { marginBottom: 10 }]}
                  placeholder={field.placeholder}
                  placeholderTextColor={theme.subtext}
                  value={form[field.key]}
                  onChangeText={v => setForm(prev => ({ ...prev, [field.key]: v }))}
                  keyboardType={field.keyboard}
                />
              ))}
            </ScrollView>
            <TouchableOpacity style={s.createBtn} onPress={createWorkspace} disabled={creating}>
              {creating
                ? <ActivityIndicator size="small" color={theme.bg} />
                : <Text style={s.createBtnText}>Create Event Workspace</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
  backBtn: { padding: 4 },
  addBtn: {
    backgroundColor: theme.accent, borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  cardWrap: { borderRadius: 16 },
  card: {
    backgroundColor: theme.card, borderRadius: 16,
    padding: 16, borderWidth: 0.5, borderColor: theme.border, gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  cardSub: { fontSize: 13, color: theme.subtext, marginTop: 2 },
  stageBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  stageText: { fontSize: 11, fontWeight: '700' },
  linkedBadge: { alignSelf: 'flex-start', backgroundColor: theme.accent + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  linkedBadgeText: { fontSize: 10.5, fontWeight: '700', color: theme.accent },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaText: { fontSize: 12, color: theme.subtext },
  progressRow: { flexDirection: 'row', alignItems: 'center', position: 'relative', marginTop: 4 },
  progressDot: { width: 10, height: 10, borderRadius: 5 },
  progressLabel: { fontSize: 10, fontWeight: '600' },
  progressLine: {
    position: 'absolute', top: 4, left: '33%', right: '33%',
    height: 2, zIndex: -1,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: theme.subtext },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: theme.card, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24, gap: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  input: {
    backgroundColor: theme.inputBg, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  createBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  createBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
});