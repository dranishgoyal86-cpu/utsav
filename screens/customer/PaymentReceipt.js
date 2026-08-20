import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildReceiptHtml } from '../../invoiceTemplate';
import { showAlert } from '../../helpers';
import { formatTimeLabel } from '../../lib/eventContext';
import AppHeader from '../../components/AppHeader';

// expo-print's web implementation ignores whatever html/uri you pass it and
// just calls window.print() on the CURRENT page (confirmed by reading
// node_modules/expo-print/build/ExponentPrint.web.js — print()/
// printToFileAsync() are both literally `window.print()` on web, no html
// param used at all). Print.printToFileAsync/Sharing.shareAsync only do the
// real thing on native. On web, open the receipt's actual HTML in its own
// tab instead — the browser's native print dialog from THAT tab has a real
// "Save as PDF" destination, which is the closest thing to a real PDF
// download/view web can do here without a PDF-generation library.
function openHtmlPreviewWeb(html, autoPrint) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  if (autoPrint) {
    win.onload = () => win.print();
    // onload can miss on some browsers if the doc was written synchronously
    // and already "loaded" by the time the handler attaches — a short delay
    // covers that without needing a more elaborate ready-check.
    setTimeout(() => win.print(), 400);
  }
  return true;
}

export default function PaymentReceipt({ route, navigation }) {
  const { booking } = route.params;
  const { theme } = useTheme();
  const [order, setOrder] = useState(null);
  const [billing, setBilling] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [serviceTitle, setServiceTitle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null); // 'view' | 'download' | 'share' | null
  const s = makeStyles(theme);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    try {
      const [{ data: orderData }, { data: { session } }] = await Promise.all([
        supabase.from('orders').select('*').eq('booking_id', booking.id).maybeSingle(),
        supabase.auth.getSession(),
      ]);
      setOrder(orderData);

      // Provider's business/GST details — read via a SECURITY DEFINER RPC
      // (get_booking_invoice_billing) rather than querying provider_billing
      // directly, since that table's RLS is intentionally owner+admin only
      // (it holds the provider's bank account/IFSC). The RPC checks the
      // caller is actually this booking's customer before returning anything.
      const [{ data: billingRows }, { data: customerRow }, { data: serviceRow }] = await Promise.all([
        supabase.rpc('get_booking_invoice_billing', { p_booking_id: booking.id }),
        session ? supabase.from('users').select('name, phone, email').eq('id', session.user.id).maybeSingle() : { data: null },
        booking.service_id ? supabase.from('services').select('title').eq('id', booking.service_id).maybeSingle() : { data: null },
      ]);
      setBilling(billingRows?.[0] || null);
      setCustomer(customerRow || null);
      setServiceTitle(serviceRow?.title || null);
    } catch (err) {
      console.log('PaymentReceipt fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  const amount = order?.total_amount ?? booking.total_amount;
  const paymentId = order?.payment_id ?? booking.payment_id;
  const paidAt = order?.created_at;
  const paidAtLabel = paidAt
    ? new Date(paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  function buildHtml() {
    return buildReceiptHtml({
      billing,
      customer,
      provider: { businessName: booking.providerName, name: booking.providerName },
      booking: {
        id: booking.id,
        serviceTitle,
        eventType: booking.event_type,
        eventDate: booking.event_date
          ? new Date(booking.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
          : null,
        eventTime: formatTimeLabel(booking.event_time),
        venue: booking.venue,
        guestCount: booking.guest_count,
      },
      paymentId,
      paidAt: paidAtLabel,
      amount,
      receiptNumber: `RCT-${booking.id.slice(0, 8).toUpperCase()}`,
    });
  }

  async function handleView() {
    setBusyAction('view');
    try {
      const html = buildHtml();
      if (Platform.OS === 'web') {
        if (!openHtmlPreviewWeb(html, false)) {
          showAlert('Pop-up blocked', 'Allow pop-ups for this site to preview the receipt.');
        }
        return;
      }
      // Native: printAsync opens the OS print/preview sheet with the actual
      // receipt content — a real preview, not just a file write.
      await Print.printAsync({ html });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDownload() {
    setBusyAction('download');
    try {
      const html = buildHtml();
      if (Platform.OS === 'web') {
        if (openHtmlPreviewWeb(html, true)) {
          showAlert('Opening print dialog', 'Choose "Save as PDF" as the destination to download the receipt.');
        } else {
          showAlert('Pop-up blocked', 'Allow pop-ups for this site to download the receipt.');
        }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save receipt',
          UTI: 'com.adobe.pdf',
        });
      } else {
        showAlert('Ready', 'Receipt generated.');
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleShare() {
    setBusyAction('share');
    try {
      if (Platform.OS === 'web') {
        // No real PDF bytes available on web (see openHtmlPreviewWeb's
        // comment) — share the plain-text summary instead, same fallback
        // shape GuestList.js's own web share paths already use.
        const summary = `Utsav payment receipt\n\n${booking.providerName} · ${booking.event_type}\nAmount paid: ₹${amount?.toLocaleString()}\nPayment ID: ${paymentId}\nPaid on: ${paidAtLabel}`;
        try {
          await Share.share({ message: summary });
        } catch {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(summary);
            window.alert("Your browser can't open a share sheet, so the receipt details were copied to your clipboard instead.");
          } else {
            window.alert(summary);
          }
        }
        return;
      }
      const html = buildHtml();
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share receipt',
          UTI: 'com.adobe.pdf',
        });
      } else {
        showAlert('Ready', 'Receipt generated.');
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Receipt" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={s.card}>
            <View style={s.statusRow}>
              <View style={s.statusDot} />
              <Text style={s.statusText}>✓ Paid</Text>
            </View>

            <Text style={s.amount}>₹{amount?.toLocaleString()}</Text>
            <Text style={s.amountSub}>Paid to {billing?.business_name || booking.providerName}</Text>

            <View style={s.divider} />

            {billing?.gstin || billing?.address ? (
              <>
                <View style={s.row}>
                  <Text style={s.rowLabel}>Business</Text>
                  <Text style={s.rowValue}>{billing?.business_name || booking.providerName}</Text>
                </View>
                {billing?.gstin ? (
                  <View style={s.row}>
                    <Text style={s.rowLabel}>GSTIN</Text>
                    <Text style={s.rowValueMono}>{billing.gstin}</Text>
                  </View>
                ) : null}
                {billing?.address ? (
                  <View style={s.row}>
                    <Text style={s.rowLabel}>Address</Text>
                    <Text style={s.rowValue}>
                      {[billing.address, billing.city, billing.state].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                ) : null}
                <View style={s.divider} />
              </>
            ) : null}

            <View style={s.row}>
              <Text style={s.rowLabel}>Service</Text>
              <Text style={s.rowValue}>{serviceTitle || booking.event_type}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowLabel}>Event date</Text>
              <Text style={s.rowValue}>
                {booking.event_date ? new Date(booking.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                {booking.event_time ? ` · ${formatTimeLabel(booking.event_time)}` : ''}
              </Text>
            </View>
            {booking.venue ? (
              <View style={s.row}>
                <Text style={s.rowLabel}>Venue</Text>
                <Text style={s.rowValue}>{booking.venue}</Text>
              </View>
            ) : null}
            <View style={s.row}>
              <Text style={s.rowLabel}>Provider category</Text>
              <Text style={s.rowValue}>{booking.providers?.category || '—'}</Text>
            </View>

            <View style={s.divider} />

            <View style={s.row}>
              <Text style={s.rowLabel}>Payment ID</Text>
              <Text style={s.rowValueMono}>{paymentId}</Text>
            </View>
            {paidAt ? (
              <View style={s.row}>
                <Text style={s.rowLabel}>Paid on</Text>
                <Text style={s.rowValue}>{paidAtLabel}</Text>
              </View>
            ) : null}

            <Text style={s.secureNote}>🔒 Verified by Razorpay</Text>
          </View>

          {!billing?.gstin && !billing?.address ? (
            <Text style={s.noBillingNote}>
              This provider hasn't added their business/GST details yet, so this receipt shows payment details only.
            </Text>
          ) : null}

          <View style={s.actionRow}>
            <TouchableOpacity style={s.actionBtn} onPress={handleView} disabled={!!busyAction}>
              {busyAction === 'view' ? <ActivityIndicator color={theme.text} /> : <Text style={s.actionBtnText}>👁 View</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={handleDownload} disabled={!!busyAction}>
              {busyAction === 'download' ? <ActivityIndicator color={theme.text} /> : <Text style={s.actionBtnText}>⬇ Download</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={handleShare} disabled={!!busyAction}>
              {busyAction === 'share' ? <ActivityIndicator color={theme.text} /> : <Text style={s.actionBtnText}>↗ Share</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    card: {
      backgroundColor: theme.cardBg, borderRadius: 22, padding: 22,
      borderWidth: 0.5, borderColor: theme.border, alignItems: 'center',
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 14 },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2E7D32' },
    statusText: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },

    amount: { fontSize: 38, fontWeight: '700', color: theme.text, letterSpacing: -0.5 },
    amountSub: { fontSize: 13, color: theme.textSecondary, marginTop: 4, marginBottom: 18 },

    divider: { height: 0.5, backgroundColor: theme.border, width: '100%', marginVertical: 14 },

    row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 12 },
    rowLabel: { fontSize: 13, color: theme.textSecondary },
    rowValue: { fontSize: 13, fontWeight: '600', color: theme.text, maxWidth: '60%', textAlign: 'right' },
    rowValueMono: { fontSize: 12, fontWeight: '600', color: theme.text, maxWidth: '60%', textAlign: 'right' },

    secureNote: { fontSize: 11, color: theme.textTertiary, marginTop: 10 },

    noBillingNote: { fontSize: 12, color: theme.textTertiary, textAlign: 'center', marginTop: 14, lineHeight: 17, paddingHorizontal: 10 },

    actionRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    actionBtnText: { fontSize: 13, fontWeight: '700', color: theme.text },
  });
}
