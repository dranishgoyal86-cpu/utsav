import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, Plus, ShareNetwork, CheckCircle, FileText } from 'phosphor-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildInvoiceHtml } from '../../invoiceTemplate';
import { showAlert, confirmDestructive } from '../../helpers';
import AppHeader from '../../components/AppHeader';

const STATUS_STYLES = {
  sent: { label: 'Sent', color: '#FF9800', bg: '#FF980022' },
  paid: { label: 'Paid', color: '#4CAF50', bg: '#4CAF5022' },
  draft: { label: 'Draft', color: '#9E9E9E', bg: '#9E9E9E22' },
};

export default function InvoicesList({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [invoices, setInvoices] = useState([]);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sharing, setSharing] = useState(null); // invoice id being re-shared

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: inv }, { data: bill }] = await Promise.all([
        supabase.from('invoices').select('*')
          .eq('provider_user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('provider_billing').select('*')
          .eq('provider_user_id', user.id)
          .maybeSingle(),
      ]);
      setInvoices(inv || []);
      setBilling(bill || null);
    } catch (err) {
      console.log('load invoices error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, []);

  async function reShare(invoice) {
    if (!billing) {
      showAlert('Missing billing profile', 'Set up billing details to re-generate this PDF.');
      return;
    }
    setSharing(invoice.id);
    try {
      const html = buildInvoiceHtml({
        billing,
        client: {
          name: invoice.client_name,
          address: invoice.client_address || '',
          state: invoice.client_state || '',
          gstin: invoice.client_gstin || '',
        },
        items: invoice.line_items || [],
        invoiceNumber: invoice.invoice_number,
        invoiceDate: new Date(invoice.invoice_date || invoice.created_at)
          .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
        isGst: invoice.is_gst,
        sameState: (invoice.cgst || 0) > 0,
        gstRate: invoice.subtotal > 0
          ? Math.round(((invoice.cgst + invoice.sgst + invoice.igst) / invoice.subtotal) * 100)
          : 18,
        subtotal: invoice.subtotal,
        cgst: invoice.cgst, sgst: invoice.sgst, igst: invoice.igst,
        total: invoice.total,
        notes: invoice.notes || '',
      });

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice ${invoice.invoice_number}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSharing(null);
    }
  }

  async function markPaid(invoice) {
    confirmDestructive(
      'Mark as paid?',
      `Invoice ${invoice.invoice_number} · ₹${invoice.total?.toLocaleString('en-IN')}`,
      'Mark paid',
      async () => {
        const { error } = await supabase
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', invoice.id);
        if (!error) {
          setInvoices(prev => prev.map(i => i.id === invoice.id ? { ...i, status: 'paid' } : i));
        }
      }
    );
  }

  function fmt(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  const filters = ['all', 'sent', 'paid'];
  const filtered = activeFilter === 'all'
    ? invoices
    : invoices.filter(i => i.status === activeFilter);

  const totalBilled = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0);
  const totalPending = totalBilled - totalPaid;

  function renderInvoice({ item: inv }) {
    const st = STATUS_STYLES[inv.status] || STATUS_STYLES.sent;
    const isSharing = sharing === inv.id;
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={s.iconBox}>
            <FileText size={18} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.invNumber}>{inv.invoice_number}</Text>
            <Text style={s.clientName}>{inv.client_name}</Text>
            <Text style={s.invDate}>
              {new Date(inv.invoice_date || inv.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
              {inv.is_gst ? ' · GST' : ' · Bill of Supply'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={s.amount}>{fmt(inv.total)}</Text>
            <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
              <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>
        </View>
        <View style={s.actionRow}>
          <TouchableOpacity style={s.shareBtn} onPress={() => reShare(inv)} disabled={isSharing}>
            {isSharing
              ? <ActivityIndicator size="small" color={theme.text} />
              : (<><ShareNetwork size={14} color={theme.text} /><Text style={s.shareBtnText}>Share PDF</Text></>)}
          </TouchableOpacity>
          {inv.status !== 'paid' && (
            <TouchableOpacity style={s.paidBtn} onPress={() => markPaid(inv)}>
              <CheckCircle size={14} color="#4CAF50" />
              <Text style={s.paidBtnText}>Mark paid</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <AppHeader
        title="Invoices"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="add" style={s.addBtn} onPress={() => navigation.navigate('InvoiceGenerator')}>
            <Plus size={20} color={theme.bg} />
          </TouchableOpacity>,
        ]}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Summary */}
          <View style={s.summaryCard}>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Billed</Text>
              <Text style={s.summaryValue}>{fmt(totalBilled)}</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Received</Text>
              <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{fmt(totalPaid)}</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Pending</Text>
              <Text style={[s.summaryValue, { color: '#F44336' }]}>{fmt(totalPending)}</Text>
            </View>
          </View>

          {/* Filters */}
          <View style={s.filterRow}>
            {filters.map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, activeFilter === f && s.filterPillActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[s.filterPillText, activeFilter === f && s.filterPillTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && ` (${invoices.filter(i => i.status === f).length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>🧾</Text>
              <Text style={s.emptyTitle}>No invoices yet</Text>
              <Text style={s.emptySubtitle}>Tap + to create your first invoice</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              renderItem={renderInvoice}
              contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
  backBtn: { padding: 4 },
  addBtn: {
    backgroundColor: theme.accent, borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  summaryCard: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 14,
    backgroundColor: theme.cardBg, borderRadius: 16, paddingVertical: 14,
    borderWidth: 0.5, borderColor: theme.border,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: 11, color: theme.textSecondary },
  summaryValue: { fontSize: 15, fontWeight: '800', color: theme.text },
  summaryDivider: { width: 0.5, backgroundColor: theme.border },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  filterPillActive: { backgroundColor: theme.text, borderColor: theme.text },
  filterPillText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  filterPillTextActive: { color: theme.bg },
  card: {
    backgroundColor: theme.cardBg, borderRadius: 16, padding: 14,
    borderWidth: 0.5, borderColor: theme.border, gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.accent + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  invNumber: { fontSize: 14, fontWeight: '800', color: theme.text },
  clientName: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  invDate: { fontSize: 11, color: theme.textTertiary || theme.textSecondary, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '800', color: theme.text },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 10.5, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10 },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border,
  },
  shareBtnText: { fontSize: 13, fontWeight: '600', color: theme.text },
  paidBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#4CAF5011', borderWidth: 0.5, borderColor: '#4CAF5044',
  },
  paidBtnText: { fontSize: 13, fontWeight: '600', color: '#4CAF50' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.textSecondary },
});