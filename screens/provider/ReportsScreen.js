import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { ArrowLeft, DownloadSimple } from 'phosphor-react-native';
import { showAlert } from '../../helpers';
import AppHeader from '../../components/AppHeader';

// Native-only — file writing, PDF generation, and sharing have no meaningful
// web equivalent. Every screen file is statically imported by App.js at
// startup, so an unconditional top-level import here would try to load
// these native modules as soon as the app launches, not just when this
// screen opens.
let FileSystem, Print, Sharing;
if (Platform.OS !== 'web') {
  FileSystem = require('expo-file-system/legacy');
  Print = require('expo-print');
  Sharing = require('expo-sharing');
}

const PERIODS = [
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'Last 3 months' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

function periodStart(period) {
  const now = new Date();
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'quarter') return new Date(now.getFullYear(), now.getMonth() - 3, 1);
  if (period === 'year') return new Date(now.getFullYear(), 0, 1);
  return new Date(2000, 0, 1); // 'all'
}

function csvEscape(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(row => lines.push(row.map(csvEscape).join(',')));
  return lines.join('\r\n');
}

function xmlEscape(val) {
  return String(val ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[c]));
}

export default function ReportsScreen({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(null); // which report is currently exporting
  const [providerId, setProviderId] = useState(null);
  const [billing, setBilling] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => { fetchData(); }, [period]);

  async function fetchData() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: provider } = await supabase
        .from('providers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (!provider) return;
      setProviderId(provider.id);

      const { data: billingData } = await supabase
        .from('provider_billing').select('*').eq('provider_user_id', session.user.id).maybeSingle();
      setBilling(billingData);

      const since = periodStart(period).toISOString();

      const { data: bookingsRaw } = await supabase
        .from('bookings').select('*')
        .eq('provider_id', provider.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      let bookingsList = bookingsRaw || [];
      if (bookingsList.length > 0) {
        const customerIds = bookingsList.map(b => b.customer_id).filter(Boolean);
        const { data: customersData } = await supabase
          .from('users').select('id, name, phone').in('id', customerIds);
        bookingsList = bookingsList.map(b => ({
          ...b, users: customersData?.find(u => u.id === b.customer_id) || null,
        }));
      }
      setBookings(bookingsList);

      const { data: invoicesRaw } = await supabase
        .from('invoices').select('*')
        .eq('provider_user_id', session.user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      setInvoices(invoicesRaw || []);
    } catch (err) {
      console.log('Reports fetchData error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function shareFile(fileName, content, mimeType) {
    if (Platform.OS === 'web') {
      window.alert('Exporting files works in the Utsav mobile app — not available on web.');
      return;
    }
    const fileUri = FileSystem.cacheDirectory + fileName;
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: 'utf8' });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: fileName });
    } else {
      Alert.alert('Saved', `${fileName} created but sharing isn't available on this device.`);
    }
  }

  async function exportBookingsCsv() {
    if (bookings.length === 0) { showAlert('Nothing to export', 'No bookings in this period.'); return; }
    setGenerating('bookings');
    try {
      const headers = ['Date', 'Customer', 'Phone', 'Event type', 'Venue', 'Guests', 'Amount', 'Commission', 'Net earning', 'Status'];
      const rows = bookings.map(b => [
        b.event_date || '', b.users?.name || '', b.users?.phone || '', b.event_type || '',
        b.venue || '', b.guest_count || '', b.total_amount || 0, b.commission_amount || 0,
        (b.total_amount || 0) - (b.commission_amount || 0), b.status || '',
      ]);
      await shareFile(`bookings-${period}.csv`, toCsv(headers, rows), 'text/csv');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setGenerating(null);
    }
  }

  async function exportInvoicesCsv() {
    if (invoices.length === 0) { showAlert('Nothing to export', 'No invoices in this period.'); return; }
    setGenerating('invoices-csv');
    try {
      const headers = ['Invoice #', 'Date', 'Client', 'GSTIN', 'Subtotal', 'CGST', 'SGST', 'IGST', 'Total', 'Status'];
      const rows = invoices.map(inv => [
        inv.invoice_number || '', inv.invoice_date || '', inv.client_name || '', inv.client_gstin || '',
        inv.subtotal || 0, inv.cgst || 0, inv.sgst || 0, inv.igst || 0, inv.total || 0, inv.status || '',
      ]);
      await shareFile(`invoices-${period}.csv`, toCsv(headers, rows), 'text/csv');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setGenerating(null);
    }
  }

  // Tally's XML import format for Sales Vouchers — a solid-effort, standard
  // shape (PARTYLEDGERNAME + Sales/CGST/SGST/IGST ledger entries). Ledger
  // names may need to be mapped to match whatever the provider's actual
  // Tally company uses; Tally itself will prompt to create any that don't
  // already exist rather than failing the import outright.
  async function exportTallyXml() {
    if (invoices.length === 0) { showAlert('Nothing to export', 'No invoices in this period.'); return; }
    setGenerating('tally');
    try {
      const companyName = billing?.business_name || 'Utsav Provider';
      const vouchers = invoices.map(inv => {
        const dateStr = (inv.invoice_date || inv.created_at || '').slice(0, 10).replace(/-/g, '');
        const entries = [
          `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(inv.client_name)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${inv.total}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
          `<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales Account</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${inv.subtotal}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
        ];
        if (inv.cgst > 0) entries.push(`<ALLLEDGERENTRIES.LIST><LEDGERNAME>CGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${inv.cgst}</AMOUNT></ALLLEDGERENTRIES.LIST>`);
        if (inv.sgst > 0) entries.push(`<ALLLEDGERENTRIES.LIST><LEDGERNAME>SGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${inv.sgst}</AMOUNT></ALLLEDGERENTRIES.LIST>`);
        if (inv.igst > 0) entries.push(`<ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${inv.igst}</AMOUNT></ALLLEDGERENTRIES.LIST>`);

        return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <VOUCHER VCHTYPE="Sales" ACTION="Create">
    <DATE>${dateStr}</DATE>
    <NARRATION>${xmlEscape(`Invoice ${inv.invoice_number}`)}</NARRATION>
    <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
    <VOUCHERNUMBER>${xmlEscape(inv.invoice_number)}</VOUCHERNUMBER>
    <PARTYLEDGERNAME>${xmlEscape(inv.client_name)}</PARTYLEDGERNAME>
    ${entries.join('\n    ')}
  </VOUCHER>
</TALLYMESSAGE>`;
      }).join('\n');

      const xml = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

      await shareFile(`tally-import-${period}.xml`, xml, 'text/xml');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setGenerating(null);
    }
  }

  async function exportEarningsPdf() {
    if (bookings.length === 0) { showAlert('Nothing to export', 'No bookings in this period.'); return; }
    setGenerating('earnings-pdf');
    try {
      const confirmed = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed');
      const total = confirmed.reduce((s, b) => s + (b.total_amount - b.commission_amount), 0);
      const byType = confirmed.reduce((acc, b) => {
        const t = b.event_type || 'Other';
        acc[t] = (acc[t] || 0) + (b.total_amount - b.commission_amount);
        return acc;
      }, {});
      const periodLabel = PERIODS.find(p => p.id === period)?.label || period;

      const rowsHtml = confirmed.map(b => `
        <tr>
          <td>${b.event_date || ''}</td>
          <td>${b.users?.name || ''}</td>
          <td>${b.event_type || ''}</td>
          <td style="text-align:right;">₹${(b.total_amount - b.commission_amount).toLocaleString()}</td>
        </tr>`).join('');

      const breakdownHtml = Object.entries(byType).map(([type, amount]) => `
        <tr><td>${type}</td><td style="text-align:right;">₹${amount.toLocaleString()}</td></tr>`).join('');

      const html = `
        <html><head><meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Roboto, sans-serif; padding: 32px; color: #1C2126; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
          .total { font-size: 28px; font-weight: 800; color: #E8A020; margin-bottom: 24px; }
          h2 { font-size: 15px; margin-top: 28px; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
          th { text-align: left; border-bottom: 1.5px solid #ddd; padding: 6px 4px; color: #666; }
          td { border-bottom: 0.5px solid #eee; padding: 6px 4px; }
        </style></head>
        <body>
          <h1>Earnings Report</h1>
          <div class="sub">${xmlEscape(billing?.business_name || '')} · ${periodLabel}</div>
          <div class="total">₹${total.toLocaleString()}</div>

          <h2>By event type</h2>
          <table>${breakdownHtml}</table>

          <h2>Transactions (${confirmed.length})</h2>
          <table>
            <tr><th>Date</th><th>Customer</th><th>Event</th><th style="text-align:right;">Net earning</th></tr>
            ${rowsHtml}
          </table>
        </body></html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Earnings report', UTI: 'com.adobe.pdf' });
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setGenerating(null);
    }
  }

  const REPORTS = [
    {
      key: 'bookings', icon: '📊', title: 'Bookings report', format: 'CSV',
      desc: 'Every booking in this period — customer, event, amount, status.',
      action: exportBookingsCsv,
    },
    {
      key: 'earnings-pdf', icon: '💰', title: 'Earnings summary', format: 'PDF',
      desc: 'Total earnings, breakdown by event type, and full transaction list.',
      action: exportEarningsPdf,
    },
    {
      key: 'invoices-csv', icon: '🧾', title: 'Invoices report', format: 'CSV',
      desc: 'All invoices issued in this period with GST breakdown.',
      action: exportInvoicesCsv,
    },
    {
      key: 'tally', icon: '📗', title: 'Invoices for Tally', format: 'XML',
      desc: 'Sales voucher import file — ledger names may need mapping on first import.',
      action: exportTallyXml,
    },
  ];

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Reports & Exports" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[s.periodChip, period === p.id && s.periodChipActive]}
              onPress={() => setPeriod(p.id)}
            >
              <Text style={[s.periodChipText, period === p.id && s.periodChipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={s.summaryText}>
              {bookings.length} booking{bookings.length === 1 ? '' : 's'} · {invoices.length} invoice{invoices.length === 1 ? '' : 's'} in this period
            </Text>

            <View style={{ gap: 12, marginTop: 12 }}>
              {REPORTS.map(r => (
                <TouchableOpacity
                  key={r.key}
                  style={s.reportCard}
                  onPress={r.action}
                  disabled={generating === r.key}
                >
                  <Text style={{ fontSize: 26 }}>{r.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.reportTitle}>{r.title}</Text>
                      <View style={s.formatBadge}><Text style={s.formatBadgeText}>{r.format}</Text></View>
                    </View>
                    <Text style={s.reportDesc}>{r.desc}</Text>
                  </View>
                  {generating === r.key
                    ? <ActivityIndicator color={theme.accent} />
                    : <DownloadSimple size={20} color={theme.accent} />
                  }
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text, flex: 1, textAlign: 'center' },
  backBtn: { width: 36 },

  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  periodChipActive: { backgroundColor: theme.text, borderColor: theme.text },
  periodChipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
  periodChipTextActive: { color: theme.bg },

  summaryText: { fontSize: 12.5, color: theme.textSecondary, marginTop: 16 },

  reportCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border,
    padding: 16,
  },
  reportTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text },
  reportDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 3, lineHeight: 17 },
  formatBadge: { backgroundColor: theme.accent + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  formatBadgeText: { fontSize: 10, fontWeight: '700', color: theme.accent },
});
