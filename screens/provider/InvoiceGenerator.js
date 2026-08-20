import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, Plus, Trash, ShareNetwork } from 'phosphor-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildInvoiceHtml } from '../../invoiceTemplate';
import { notifyInvoiceGenerated } from '../../notifications';
import { showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';

const EMPTY_ITEM = { description: '', qty: '1', rate: '' };

export default function InvoiceGenerator({ navigation, route }) {
  const { theme } = useTheme();
  const s = styles(theme);
  const prefill = route?.params?.prefill; // { client_name, client_state, amount, booking_id, workspace_id }

  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [generating, setGenerating] = useState(false);

  const [client, setClient] = useState({
    name: prefill?.client_name || '',
    address: '',
    state: prefill?.client_state || '',
    gstin: '',
  });
  const [items, setItems] = useState([
    prefill?.amount
      ? { description: prefill?.description || 'Event services', qty: '1', rate: String(prefill.amount) }
      : { ...EMPTY_ITEM }
  ]);
  const [gstRate, setGstRate] = useState('18');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        loadBilling(data.user.id);
      }
    });
  }, []);

  async function loadBilling(uid) {
    try {
      const { data } = await supabase
        .from('provider_billing')
        .select('*')
        .eq('provider_user_id', uid)
        .maybeSingle();

      if (!data) {
        // No billing profile yet — force setup first
        if (Platform.OS === 'web') {
          // RN-Web renders nothing for Alert.alert, including its onPress —
          // show the message and still perform the navigation manually.
          window.alert('Set up billing first\n\nAdd your business details once before generating invoices.');
          navigation.replace('BillingProfile', { returnTo: 'InvoiceGenerator' });
        } else {
          Alert.alert(
            'Set up billing first',
            'Add your business details once before generating invoices.',
            [{ text: 'Set up now', onPress: () => navigation.replace('BillingProfile', { returnTo: 'InvoiceGenerator' }) }]
          );
        }
        return;
      }
      setBilling(data);
    } catch (err) {
      console.log('loadBilling error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  const isGst = !!(billing?.gstin && billing.gstin.trim());

  // ── Tax math ──
  const subtotal = items.reduce((sum, it) => {
    const q = parseFloat(it.qty) || 0;
    const r = parseFloat(it.rate) || 0;
    return sum + q * r;
  }, 0);

  const rate = parseFloat(gstRate) || 0;
  const sameState = isGst && billing?.state && client.state &&
    billing.state.trim().toLowerCase() === client.state.trim().toLowerCase();

  let cgst = 0, sgst = 0, igst = 0;
  if (isGst) {
    if (sameState) {
      cgst = subtotal * (rate / 2) / 100;
      sgst = subtotal * (rate / 2) / 100;
    } else {
      igst = subtotal * rate / 100;
    }
  }
  const total = subtotal + cgst + sgst + igst;

  function fmt(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function updateItem(i, key, val) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it));
  }
  function addItem() {
    setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  }
  function removeItem(i) {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));
  }

  async function generate() {
    if (!client.name.trim()) {
      showAlert('Required', 'Enter client name.');
      return;
    }
    if (subtotal <= 0) {
      showAlert('Required', 'Add at least one line item with an amount.');
      return;
    }
    if (isGst && !client.state.trim()) {
      showAlert('Client state needed', 'For a GST invoice, enter the client state so we apply CGST/SGST or IGST correctly.');
      return;
    }

    setGenerating(true);
    try {
      // 1. Reserve invoice number atomically via a DB function — two
      // invoices generated in quick succession (double-tap, two tabs) used
      // to both read the same client-side `billing.next_invoice_number`
      // before either write landed, risking duplicate invoice numbers.
      // reserve_invoice_number() does the read+increment as a single
      // UPDATE...RETURNING, which Postgres serializes on the row lock.
      const { data: nextNum, error: reserveError } = await supabase.rpc('reserve_invoice_number', { p_user_id: userId });
      if (reserveError) throw reserveError;
      const invoiceNumber = `${billing.invoice_prefix || 'INV'}-${String(nextNum).padStart(4, '0')}`;

      const cleanItems = items
        .filter(it => it.description.trim() && (parseFloat(it.rate) || 0) > 0)
        .map(it => ({
          description: it.description.trim(),
          qty: parseFloat(it.qty) || 1,
          rate: parseFloat(it.rate) || 0,
          amount: (parseFloat(it.qty) || 1) * (parseFloat(it.rate) || 0),
        }));

      // This invoice's client is a customer's booking, and bookings now carry
      // which event plan they were made under (saved_plan_id) — thread that
      // same link onto the invoice so it shows up under the customer's plan
      // too, not just the provider's own billing history. workspace_id alone
      // (no direct booking_id) still resolves via the workspace's own
      // booking_id, since a workspace is usually opened from a booking.
      let savedPlanId = null;
      const bookingIdForLookup = prefill?.booking_id || (
        prefill?.workspace_id
          ? (await supabase.from('event_workspace').select('booking_id').eq('id', prefill.workspace_id).maybeSingle()).data?.booking_id
          : null
      );
      if (bookingIdForLookup) {
        const { data: bookingRow } = await supabase.from('bookings').select('saved_plan_id').eq('id', bookingIdForLookup).maybeSingle();
        savedPlanId = bookingRow?.saved_plan_id || null;
      }

      // 2. Save invoice row
      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert({
          provider_user_id: userId,
          booking_id: prefill?.booking_id || null,
          workspace_id: prefill?.workspace_id || null,
          saved_plan_id: savedPlanId,
          invoice_number: invoiceNumber,
          client_name: client.name.trim(),
          client_address: client.address.trim(),
          client_state: client.state.trim(),
          client_gstin: client.gstin.trim().toUpperCase(),
          line_items: cleanItems,
          subtotal, cgst, sgst, igst, total,
          is_gst: isGst,
          notes: notes.trim(),
          status: 'sent',
        })
        .select()
        .single();
      if (error) throw error;

      // Counter already incremented atomically by reserve_invoice_number() above.

      // Only bookings make through a real customer_id — an ad-hoc invoice
      // for a walk-in client has nothing to notify.
      if (prefill?.booking_id) {
        notifyInvoiceGenerated(prefill.booking_id, invoiceNumber, total);
      }

      // 4. Build HTML → PDF
      const html = buildInvoiceHtml({
        billing, client, items: cleanItems,
        invoiceNumber,
        invoiceDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
        isGst, sameState, gstRate: rate,
        subtotal, cgst, sgst, igst, total, notes: notes.trim(),
      });

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      // 5. Share to WhatsApp / anywhere
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice ${invoiceNumber}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        showAlert('Saved', `Invoice ${invoiceNumber} created.`);
      }

      // Update local billing counter so next invoice number is correct without refetch
      setBilling(b => ({ ...b, next_invoice_number: nextNum + 1 }));

      if (Platform.OS === 'web') {
        // RN-Web renders nothing for multi-button Alert.alert. There's no
        // real Cancel/destructive shape here (both options are legitimate
        // next steps), so default to the simpler, less disruptive choice —
        // "Back" — rather than silently discarding the confirmation.
        window.alert(`Done\n\nInvoice ${invoiceNumber} generated and ready to share.`);
        navigation.goBack();
      } else {
        Alert.alert('Done', `Invoice ${invoiceNumber} generated and ready to share.`, [
          { text: 'New invoice', onPress: () => resetForm() },
          { text: 'Back', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setGenerating(false);
    }
  }

  function resetForm() {
    setClient({ name: '', address: '', state: '', gstin: '' });
    setItems([{ ...EMPTY_ITEM }]);
    setNotes('');
  }

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </SafeAreaView>
    );
  }
  if (!billing) return <SafeAreaView style={s.container} />; // alert already redirected

  return (
    <SafeAreaView style={s.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title="New Invoice" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        <View style={[s.badge, { backgroundColor: isGst ? '#4CAF5022' : '#FF980022' }]}>
          <Text style={[s.badgeText, { color: isGst ? '#2E7D32' : '#B36B00' }]}>
            {isGst ? `Tax Invoice · GST ${gstRate}%` : 'Bill of Supply · No GST'}
          </Text>
        </View>

        {/* Client */}
        <Text style={s.sectionTitle}>Bill To</Text>
        <TextInput style={s.input} placeholder="Client name *" placeholderTextColor={theme.textSecondary}
          value={client.name} onChangeText={v => setClient(c => ({ ...c, name: v }))} />
        <TextInput style={[s.input, { minHeight: 56, textAlignVertical: 'top', paddingTop: 12 }]}
          placeholder="Client address" placeholderTextColor={theme.textSecondary}
          value={client.address} onChangeText={v => setClient(c => ({ ...c, address: v }))} multiline />
        {isGst && (
          <>
            <TextInput style={s.input} placeholder="Client state * (for CGST/SGST vs IGST)" placeholderTextColor={theme.textSecondary}
              value={client.state} onChangeText={v => setClient(c => ({ ...c, state: v }))} />
            <TextInput style={s.input} placeholder="Client GSTIN (if B2B)" placeholderTextColor={theme.textSecondary}
              value={client.gstin} onChangeText={v => setClient(c => ({ ...c, gstin: v }))} autoCapitalize="characters" />
          </>
        )}

        {/* Line items */}
        <Text style={s.sectionTitle}>Items</Text>
        {items.map((it, i) => (
          <View key={i} style={s.itemCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.itemNum}>Item {i + 1}</Text>
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItem(i)}>
                  <Trash size={15} color="#F44336" />
                </TouchableOpacity>
              )}
            </View>
            <TextInput style={s.input} placeholder="Description" placeholderTextColor={theme.textSecondary}
              value={it.description} onChangeText={v => updateItem(i, 'description', v)} />
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.miniLabel}>Qty</Text>
                <TextInput style={s.input} placeholder="1" placeholderTextColor={theme.textSecondary}
                  value={it.qty} onChangeText={v => updateItem(i, 'qty', v)} keyboardType="numeric" />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={s.miniLabel}>Rate (₹)</Text>
                <TextInput style={s.input} placeholder="0" placeholderTextColor={theme.textSecondary}
                  value={it.rate} onChangeText={v => updateItem(i, 'rate', v)} keyboardType="numeric" />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={s.miniLabel}>Amount</Text>
                <View style={[s.input, { justifyContent: 'center' }]}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
                    {fmt((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0))}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={s.addItemBtn} onPress={addItem}>
          <Plus size={16} color={theme.accent} />
          <Text style={s.addItemText}>Add item</Text>
        </TouchableOpacity>

        {/* GST rate selector (only if registered) */}
        {isGst && (
          <>
            <Text style={s.sectionTitle}>GST Rate</Text>
            <View style={s.rateRow}>
              {['5', '12', '18', '28'].map(r => (
                <TouchableOpacity key={r}
                  style={[s.rateChip, gstRate === r && s.rateChipActive]}
                  onPress={() => setGstRate(r)}>
                  <Text style={[s.rateChipText, gstRate === r && { color: theme.bg }]}>{r}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Totals */}
        <View style={s.totalsCard}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmt(subtotal)}</Text>
          </View>
          {isGst && sameState && (
            <>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>CGST ({rate / 2}%)</Text>
                <Text style={s.totalValue}>{fmt(cgst)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>SGST ({rate / 2}%)</Text>
                <Text style={s.totalValue}>{fmt(sgst)}</Text>
              </View>
            </>
          )}
          {isGst && !sameState && client.state ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>IGST ({rate}%)</Text>
              <Text style={s.totalValue}>{fmt(igst)}</Text>
            </View>
          ) : null}
          <View style={[s.totalRow, s.grandTotalRow]}>
            <Text style={s.grandTotalLabel}>Total</Text>
            <Text style={s.grandTotalValue}>{fmt(total)}</Text>
          </View>
        </View>

        <TextInput style={[s.input, { minHeight: 56, textAlignVertical: 'top', paddingTop: 12 }]}
          placeholder="Notes (optional) — payment terms, thank you message…" placeholderTextColor={theme.textSecondary}
          value={notes} onChangeText={setNotes} multiline />

        <TouchableOpacity style={s.generateBtn} onPress={generate} disabled={generating}>
          {generating ? <ActivityIndicator size="small" color={theme.bg} /> : (
            <>
              <ShareNetwork size={18} color={theme.bg} />
              <Text style={s.generateBtnText}>Generate & Share PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  backBtn: { padding: 4 },
  badge: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginTop: 6 },
  input: {
    backgroundColor: theme.bgSecondary, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  row: { flexDirection: 'row', gap: 10 },
  miniLabel: { fontSize: 11, color: theme.textSecondary, marginBottom: 4 },
  itemCard: {
    backgroundColor: theme.cardBg, borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: theme.border, gap: 10,
  },
  itemNum: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: theme.accent, borderStyle: 'dashed',
  },
  addItemText: { fontSize: 14, fontWeight: '600', color: theme.accent },
  rateRow: { flexDirection: 'row', gap: 8 },
  rateChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border,
  },
  rateChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  rateChipText: { fontSize: 14, fontWeight: '700', color: theme.text },
  totalsCard: {
    backgroundColor: theme.cardBg, borderRadius: 14, padding: 16,
    borderWidth: 0.5, borderColor: theme.border, gap: 10,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 13, color: theme.textSecondary },
  totalValue: { fontSize: 13, fontWeight: '600', color: theme.text },
  grandTotalRow: { borderTopWidth: 0.5, borderTopColor: theme.border, paddingTop: 10, marginTop: 2 },
  grandTotalLabel: { fontSize: 15, fontWeight: '800', color: theme.text },
  grandTotalValue: { fontSize: 18, fontWeight: '800', color: theme.accent },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 15, marginTop: 4,
  },
  generateBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
});