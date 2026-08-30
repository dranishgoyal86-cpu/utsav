import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Platform, Alert, KeyboardAvoidingView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ArrowLeft, X, Gift } from 'phosphor-react-native';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert } from '../../helpers';
import { buildGiftStickerSheetHtml } from '../../giftStickerSheetTemplate';
import { useEventCapabilities } from '../../hooks/useEventCapabilities';
import { isEnabled } from '../../lib/capabilities';
import CapabilityBlocked from '../../components/CapabilityBlocked';
import AppHeader from '../../components/AppHeader';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import GiftTable from '../../components/desktop/GiftTable';
import { CARD, LINE, TEXT } from '../../lib/desktopTheme';

// Wave 13 — same shared breakpoint every desktop screen in this app uses
// (ProviderERP.js / GuestList.js).
const DESKTOP_BREAKPOINT = 768;

// Barcode scanning uses expo-camera's built-in CameraView/barcodeScannerSettings
// API — already installed (~57.0.3), already in app.json's plugins, and
// already proven working in this app without an EAS dev-client build
// (FaceScan.js, CheckInScanner.js use the identical API). expo-camera ships
// inside Expo Go itself, unlike third-party native modules like
// react-native-razorpay, so this runs today, not after a native rebuild.
//
// A single stable stand-in is assigned on web instead of leaving these
// undefined, so useCameraPermissions() below is always the same real hook
// call on every render on every platform — never a conditionally-present
// hook — while the actual CameraView only ever renders on native (see the
// Platform.OS check in the 'scan' mode render branch).
let CameraView, useCameraPermissions;
if (Platform.OS !== 'web') {
  CameraView = require('expo-camera').CameraView;
  useCameraPermissions = require('expo-camera').useCameraPermissions;
} else {
  CameraView = View;
  useCameraPermissions = () => [{ granted: false }, () => {}];
}

const GIFT_TYPES = [
  { key: 'cash', label: '💵 Cash' },
  { key: 'upi', label: '📱 UPI' },
  { key: 'item', label: '🎁 Item' },
  { key: 'unopened', label: '📦 Not opened' },
];

function formatCash(amount) {
  if (!amount) return '₹0';
  if (amount >= 1000) return `₹${Math.round(amount / 1000)}k`;
  return `₹${amount}`;
}

export default function GiftStickers({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && windowWidth >= DESKTOP_BREAKPOINT;
  const [event, setEvent] = useState(null);
  const [currentUserName, setCurrentUserName] = useState(null);

  const [mode, setMode] = useState('list'); // list | scan | bind | reveal
  const [stickers, setStickers] = useState([]);
  const [guests, setGuests] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markingOpened, setMarkingOpened] = useState(false);
  const [addingGuest, setAddingGuest] = useState(false);

  const [activeSticker, setActiveSticker] = useState(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [giftType, setGiftType] = useState(null);
  const [amount, setAmount] = useState('');
  const [itemDescription, setItemDescription] = useState('');

  const [permission, requestPermission] = useCameraPermissions();
  // Synchronous guard — CameraView can fire onBarcodeScanned several times
  // for the same frame before a React state update flushes (same reasoning
  // as CheckInScanner.js).
  const scanLockRef = useRef(false);

  useEffect(() => { fetchStickers(); fetchGuests(); fetchHostId(); }, []);

  // Wave 13 — the desktop shell's sidebar header needs the event's real
  // name/date; this screen never fetched the full row before (only
  // host_id, above). Unconditional, matching this app's own convention.
  useEffect(() => {
    supabase.from('events').select('*').eq('id', eventId).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.log('event fetch skipped:', error.message); return; }
        setEvent(data || null);
      });
  }, [eventId]);

  // Wave 13 follow-up — the desktop sidebar's footer needs the CURRENT
  // session's own name (not the event's host — a delegate viewing this
  // screen should see their own name), same role GuestList.js's own
  // currentUserName fetch already fills there.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('users').select('name').eq('id', user.id).maybeSingle()
        .then(({ data, error }) => {
          if (error) { console.log('user name fetch skipped:', error.message); return; }
          setCurrentUserName(data?.name || null);
        });
    });
  }, []);

  // owner_user_id on a NEW event_invitees row must be the event's HOST, not
  // whoever's session created it — the current session could be a delegate
  // (event_invitees/gift_stickers RLS now covers host OR accepted delegate,
  // see supabase/migrations/gift_stickers_delegates.sql), and a row owned
  // by the delegate instead would drop out from under the host's own
  // "Owner manages invitees" policy. Fetched fresh rather than trusting a
  // route param, matching openEventTool()'s own "eventId only, fetch your
  // own data" comment in PlanScreen.js.
  async function fetchHostId() {
    const { data, error } = await supabase.from('events').select('host_id').eq('id', eventId).maybeSingle();
    if (error) { console.log('fetchHostId error:', error.message); return; }
    setHostId(data?.host_id || null);
  }

  async function fetchStickers() {
    try {
      setLoadingList(true);
      const { data, error } = await supabase
        .from('gift_stickers').select('*').eq('event_id', eventId)
        .order('sticker_code', { ascending: true });
      if (error) throw error;
      setStickers(data || []);
    } catch (err) {
      console.log('fetchStickers error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setLoadingList(false);
    }
  }

  async function fetchGuests() {
    try {
      // Wave 13 — widened to include the desktop Gift table's "noted on
      // profile" source + reciprocation flag; the bind/reveal flows below
      // only ever needed id/name/phone, so those three stay untouched.
      const { data, error } = await supabase
        .from('event_invitees')
        .select('id, name, phone, gift_type, gift_amount, gift_note, return_gift_given')
        .eq('event_id', eventId);
      if (error) throw error;
      setGuests(data || []);
    } catch (err) {
      console.log('fetchGuests error:', err.message);
    }
  }

  const recordedCount = stickers.filter(st => st.guest_id).length;
  const blankCount = stickers.filter(st => !st.guest_id).length;
  const cashTotal = stickers
    .filter(st => st.guest_id && (st.gift_type === 'cash' || st.gift_type === 'upi'))
    .reduce((sum, st) => sum + (st.amount || 0), 0);
  const boundStickers = stickers.filter(st => st.guest_id);

  // Wave 13 — grouped by guest for the desktop GiftTable (a guest can
  // have more than one bound sticker).
  const giftStickersByGuest = {};
  boundStickers.forEach(st => {
    if (!giftStickersByGuest[st.guest_id]) giftStickersByGuest[st.guest_id] = [];
    giftStickersByGuest[st.guest_id].push(st);
  });

  async function toggleReciprocation(guest) {
    const next = !guest.return_gift_given;
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, return_gift_given: next } : g));
    const { error } = await supabase.from('event_invitees').update({ return_gift_given: next }).eq('id', guest.id);
    if (error) {
      console.log('toggleReciprocation error:', error.message);
      setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, return_gift_given: !next } : g));
    }
  }

  // ── Print a new sheet of 65 numbered stickers ──
  function confirmPrintSheet() {
    if (Platform.OS === 'web') {
      if (window.confirm('This creates 65 new gift sticker codes and opens a printable sheet. Continue?')) printSheet();
    } else {
      Alert.alert(
        'Print gift stickers',
        'This creates 65 new gift sticker codes and opens a printable sheet you can print onto sticker paper.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Generate', onPress: printSheet }]
      );
    }
  }

  async function printSheet() {
    setPrinting(true);
    try {
      const existingCount = stickers.length;
      const newCodes = Array.from({ length: 65 }, (_, i) => `G${String(existingCount + i + 1).padStart(4, '0')}`);
      const rows = newCodes.map(code => ({ event_id: eventId, sticker_code: code }));
      const { data: inserted, error } = await supabase.from('gift_stickers').insert(rows).select();
      if (error) throw error;
      setStickers(prev => [...prev, ...(inserted || [])]);

      const html = buildGiftStickerSheetHtml({ eventId: eventId, codes: newCodes });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Gift stickers', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Saved', 'Gift sticker sheet PDF created.');
      }
    } catch (err) {
      console.log('printSheet error:', err.message);
      showAlert('Error', err.message || 'Could not generate the sticker sheet.');
    } finally {
      setPrinting(false);
    }
  }

  // ── Scan ──
  function openScan() {
    scanLockRef.current = false;
    setMode('scan');
  }

  function handleBarcodeScanned({ data }) {
    if (scanLockRef.current) return;
    scanLockRef.current = true;

    const parts = String(data || '').split('-');
    const code = parts[parts.length - 1];
    const found = stickers.find(st => st.sticker_code === code);

    if (!found) {
      showAlert('Unknown sticker', "This code doesn't match a sticker from this event.");
      scanLockRef.current = false;
      return;
    }

    if (found.guest_id) {
      setActiveSticker(found);
      setMode('reveal');
    } else {
      setActiveSticker(found);
      setGuestSearch('');
      setSelectedGuest(null);
      setGiftType(null);
      setAmount('');
      setItemDescription('');
      setMode('bind');
    }
  }

  function backToScan() {
    scanLockRef.current = false;
    setActiveSticker(null);
    setMode('scan');
  }

  // ── Bind ──
  const filteredGuests = guestSearch.trim()
    ? guests.filter(g => g.name.toLowerCase().includes(guestSearch.trim().toLowerCase())).slice(0, 8)
    : [];

  async function addNewGuestAndSelect() {
    const name = guestSearch.trim();
    if (!name) return;
    setAddingGuest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');
      const { data, error } = await supabase.from('event_invitees')
        .insert({ event_id: eventId, owner_user_id: hostId || user.id, name })
        .select().single();
      if (error) throw error;
      setGuests(prev => [...prev, data]);
      setSelectedGuest(data);
      setGuestSearch(data.name);
    } catch (err) {
      console.log('addNewGuestAndSelect error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setAddingGuest(false);
    }
  }

  async function saveBinding() {
    if (!selectedGuest || !activeSticker) return;
    setSaving(true);
    try {
      const patch = {
        guest_id: selectedGuest.id,
        gift_type: giftType,
        amount: (giftType === 'cash' || giftType === 'upi') ? (parseInt(amount, 10) || null) : null,
        item_description: giftType === 'item' ? (itemDescription.trim() || null) : null,
        bound_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('gift_stickers')
        .update(patch).eq('id', activeSticker.id).select().single();
      if (error) throw error;
      setStickers(prev => prev.map(st => st.id === data.id ? data : st));
      backToScan();
    } catch (err) {
      console.log('saveBinding error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Reveal ──
  async function markOpened() {
    if (!activeSticker) return;
    setMarkingOpened(true);
    try {
      const { data, error } = await supabase.from('gift_stickers')
        .update({ is_opened: true }).eq('id', activeSticker.id).select().single();
      if (error) throw error;
      setStickers(prev => prev.map(st => st.id === data.id ? data : st));
      setActiveSticker(data);
    } catch (err) {
      console.log('markOpened error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setMarkingOpened(false);
    }
  }

  const revealGuest = activeSticker ? guests.find(g => g.id === activeSticker.guest_id) : null;

  const capabilities = useEventCapabilities(eventId);
  if (!capabilities.loading && !isEnabled(capabilities, 'gift_qr_stickers')) {
    return <CapabilityBlocked navigation={navigation} />;
  }

  // ─── scan mode ───
  if (mode === 'scan') {
    return (
      <SafeAreaView style={s.scanContainer}>
        <View style={s.scanHeader}>
          <TouchableOpacity onPress={() => setMode('list')}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.scanHeaderTitle}>Scan a sticker</Text>
          <View style={{ width: 22 }} />
        </View>

        {Platform.OS === 'web' ? (
          <View style={s.webFallback}>
            <Text style={s.webFallbackIcon}>📱</Text>
            <Text style={s.webFallbackTitle}>Open the Utsav app to scan</Text>
            <Text style={s.webFallbackSub}>Gift sticker scanning uses your device's camera and isn't available on web.</Text>
          </View>
        ) : !permission ? (
          <View style={s.centerBox}><ActivityIndicator size="large" color={theme.accent} /></View>
        ) : !permission.granted ? (
          <View style={s.centerBoxLight}>
            <Text style={s.permIcon}>📷</Text>
            <Text style={s.permTitle}>Camera permission needed</Text>
            <Text style={s.permSub}>We need camera access to scan gift stickers.</Text>
            <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
              <Text style={s.permBtnText}>Allow camera access</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={s.scanOverlay} pointerEvents="none">
              <View style={s.scanFrame} />
            </View>
          </View>
        )}

        <View style={s.scanFooter}>
          <Text style={s.scanFooterText}>{recordedCount} recorded · {blankCount} stickers left</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── bind mode ───
  if (mode === 'bind') {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title={activeSticker?.sticker_code} onBack={backToScan} theme={theme} navigation={navigation} />

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.bindBody}>
          <TextInput
            style={s.searchInput}
            placeholder="Search guest by name..."
            placeholderTextColor={theme.textSecondary}
            value={guestSearch}
            onChangeText={t => { setGuestSearch(t); setSelectedGuest(null); }}
            autoFocus
          />

          {selectedGuest ? (
            <View style={s.selectedGuestRow}>
              <View style={s.guestAvatar}><Text style={s.guestAvatarText}>{selectedGuest.name[0]}</Text></View>
              <Text style={s.selectedGuestName}>{selectedGuest.name}</Text>
              <Text style={s.selectedGuestCheck}>✓</Text>
              <TouchableOpacity onPress={() => { setSelectedGuest(null); setGuestSearch(''); }}>
                <Text style={s.changeGuestLink}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredGuests}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.guestRow} onPress={() => { setSelectedGuest(item); setGuestSearch(item.name); }}>
                  <View style={s.guestAvatar}><Text style={s.guestAvatarText}>{item.name[0]}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.guestRowName}>{item.name}</Text>
                    {item.phone ? <Text style={s.guestRowPhone}>{item.phone}</Text> : null}
                  </View>
                </TouchableOpacity>
              )}
              ListFooterComponent={guestSearch.trim() ? (
                <TouchableOpacity style={s.addGuestRow} onPress={addNewGuestAndSelect} disabled={addingGuest}>
                  {addingGuest ? <ActivityIndicator size="small" color={theme.accent} /> : (
                    <Text style={s.addGuestRowText}>+ Add "{guestSearch.trim()}" as a new guest</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            />
          )}

          {selectedGuest && (
            <>
              <Text style={s.sectionLabel}>Gift type (optional)</Text>
              <View style={s.chipsWrap}>
                {GIFT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[s.chip, giftType === t.key && s.chipActive]}
                    onPress={() => setGiftType(t.key === giftType ? null : t.key)}
                  >
                    <Text style={[s.chipText, giftType === t.key && s.chipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(giftType === 'cash' || giftType === 'upi') && (
                <View style={s.amountRow}>
                  <Text style={s.amountPrefix}>₹</Text>
                  <TextInput
                    style={s.amountInput}
                    placeholder="Amount"
                    placeholderTextColor={theme.textSecondary}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                  />
                </View>
              )}
              {giftType === 'item' && (
                <TextInput
                  style={s.searchInput}
                  placeholder="What did they bring?"
                  placeholderTextColor={theme.textSecondary}
                  value={itemDescription}
                  onChangeText={setItemDescription}
                />
              )}
            </>
          )}
        </View>

        <View style={s.bottomBar}>
          <TouchableOpacity
            style={[s.primaryBtn, !selectedGuest && s.primaryBtnDisabled]}
            onPress={saveBinding}
            disabled={!selectedGuest || saving}
          >
            {saving ? <ActivityIndicator color={theme.btnPrimaryText} /> : (
              <Text style={s.primaryBtnText}>Save and scan next →</Text>
            )}
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── reveal mode ───
  if (mode === 'reveal') {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title={activeSticker?.sticker_code} onBack={backToScan} theme={theme} navigation={navigation} />
        <View style={s.revealBody}>
          <Text style={s.revealLabel}>This gift is from</Text>
          <View style={s.revealAvatar}>
            <Text style={s.revealAvatarText}>{revealGuest?.name?.[0] || '?'}</Text>
          </View>
          <Text style={s.revealName}>{revealGuest?.name || 'Unknown guest'}</Text>
          {revealGuest?.phone ? <Text style={s.revealPhone}>{revealGuest.phone}</Text> : null}

          {activeSticker?.gift_type ? (
            <View style={s.revealPill}>
              <Text style={s.revealPillText}>
                {GIFT_TYPES.find(t => t.key === activeSticker.gift_type)?.label || activeSticker.gift_type}
                {(activeSticker.gift_type === 'cash' || activeSticker.gift_type === 'upi') && activeSticker.amount
                  ? ` · ₹${activeSticker.amount}` : ''}
                {activeSticker.gift_type === 'item' && activeSticker.item_description
                  ? ` · ${activeSticker.item_description}` : ''}
              </Text>
            </View>
          ) : null}

          <View style={s.revealActions}>
            {!activeSticker?.is_opened && (
              <TouchableOpacity style={s.secondaryBtn} onPress={markOpened} disabled={markingOpened}>
                {markingOpened ? <ActivityIndicator color={theme.text} /> : <Text style={s.secondaryBtnText}>Mark as opened</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.primaryBtn} onPress={backToScan}>
              <Text style={s.primaryBtnText}>Scan next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Wave 13 — desktop shell, list mode only (scan/bind/reveal are native-
  // camera flows, meaningless on desktop web — CameraView is already
  // stubbed to a plain View there, per this file's own top-of-file note).
  if (isDesktopWeb && mode === 'list') {
    return (
      <DesktopEventShell activeItem="gifts" event={event} guestCount={guests.length} currentUserName={currentUserName} navigation={navigation}>
        {/* Restores the mobile actionsRow's "Return gifts" link, dropped
            when this desktop branch was first built — ReturnGifts has no
            DesktopEventShell sidebar entry of its own, so without this it
            was unreachable from desktop entirely. Real gap, found via live
            click-through verification, fixed here rather than routed
            around. Scan sticker/Print sheet stay mobile-only on purpose
            (camera + native PDF share, per this file's own top-of-file
            note) — only Return gifts is a genuine cross-platform gap. */}
        <View style={ds.toolsRow}>
          <TouchableOpacity style={ds.toolBtn} onPress={() => navigation.navigate('ReturnGifts', { eventId })}>
            <Text style={{ fontSize: 14 }}>🎀</Text>
            <Text style={ds.toolBtnText}>Return gifts</Text>
          </TouchableOpacity>
        </View>
        <GiftTable guests={guests} giftStickersByGuest={giftStickersByGuest} onToggleReciprocation={toggleReciprocation} />
      </DesktopEventShell>
    );
  }

  // ─── list mode (default) ───
  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Gift register" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loadingList ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : stickers.length === 0 ? (
        <View style={s.empty}>
          <Gift size={44} color={theme.border} />
          <Text style={s.emptyTitle}>No gift stickers yet</Text>
          <Text style={s.emptySubtitle}>
            Print a sheet of numbered stickers, peel one onto each gift as it arrives, then scan it to link it to the guest — and scan it again days later to remember who it's from.
          </Text>
          <TouchableOpacity style={s.emptyCta} onPress={confirmPrintSheet} disabled={printing}>
            {printing ? <ActivityIndicator color={theme.bg} /> : <Text style={s.emptyCtaText}>🖨️ Print sticker sheet</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{recordedCount}</Text>
              <Text style={s.statLabel}>Recorded</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{blankCount}</Text>
              <Text style={s.statLabel}>Blank left</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{formatCash(cashTotal)}</Text>
              <Text style={s.statLabel}>Cash total</Text>
            </View>
          </View>

          <View style={s.actionsRow}>
            <TouchableOpacity style={s.scanBtn} onPress={openScan}>
              <Text style={s.scanBtnText}>📷 Scan sticker</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.printBtnSmall} onPress={confirmPrintSheet} disabled={printing}>
              {printing ? <ActivityIndicator size="small" color={theme.text} /> : <Text style={s.printBtnSmallText}>🖨️ Print sheet</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.printBtnSmall} onPress={() => navigation.navigate('ReturnGifts', { eventId })}>
              <Text style={s.printBtnSmallText}>🎀 Return gifts</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={boundStickers}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
            ListEmptyComponent={
              <Text style={s.noBoundText}>No gifts recorded yet — tap Scan sticker to bind your first one.</Text>
            }
            renderItem={({ item }) => {
              const g = guests.find(x => x.id === item.guest_id);
              return (
                <View style={s.giftRow}>
                  <View style={s.codeChip}><Text style={s.codeChipText}>{item.sticker_code}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.giftRowName}>{g?.name || 'Unknown guest'}</Text>
                    <Text style={s.giftRowDetail}>
                      {(item.gift_type === 'cash' || item.gift_type === 'upi') && item.amount
                        ? `₹${item.amount}`
                        : item.item_description || (GIFT_TYPES.find(t => t.key === item.gift_type)?.label ?? '—')}
                    </Text>
                  </View>
                  {item.is_opened ? (
                    <View style={s.openedTag}><Text style={s.openedTagText}>Opened</Text></View>
                  ) : null}
                </View>
              );
            }}
          />
        </>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    backBtn: { padding: 4 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 6 },
    emptySubtitle: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19 },
    emptyCta: { backgroundColor: theme.accent, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13, marginTop: 8 },
    emptyCtaText: { fontSize: 14, fontWeight: '700', color: theme.bg },

    statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 14, gap: 10 },
    statCard: {
      flex: 1, alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, paddingVertical: 12,
      borderWidth: 0.5, borderColor: theme.border,
    },
    statValue: { fontSize: 17, fontWeight: '800', color: theme.text },
    statLabel: { fontSize: 10.5, color: theme.textSecondary, marginTop: 2 },

    actionsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, gap: 10 },
    scanBtn: { flex: 1, backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    scanBtnText: { fontSize: 14, fontWeight: '700', color: theme.btnPrimaryText },
    printBtnSmall: {
      backgroundColor: theme.cardBg, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
      alignItems: 'center', borderWidth: 0.5, borderColor: theme.border,
    },
    printBtnSmallText: { fontSize: 13, fontWeight: '700', color: theme.text },

    noBoundText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginTop: 30 },
    giftRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.cardBg, borderRadius: 14, padding: 12,
      borderWidth: 0.5, borderColor: theme.border,
    },
    codeChip: { backgroundColor: theme.bgSecondary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
    codeChipText: { fontSize: 11, fontWeight: '700', color: theme.accent, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    giftRowName: { fontSize: 14, fontWeight: '700', color: theme.text },
    giftRowDetail: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
    openedTag: { backgroundColor: '#4CAF5022', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    openedTagText: { fontSize: 10.5, fontWeight: '700', color: '#4CAF50' },

    // ── Scan (fixed dark chrome, matches FaceScan.js/CheckInScanner.js's
    // established camera-screen convention in this codebase, not theme-driven) ──
    scanContainer: { flex: 1, backgroundColor: '#000' },
    scanHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#161616',
    },
    scanHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    scanOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)',
    },
    scanFrame: { width: 220, height: 220, borderWidth: 2, borderColor: '#fff', borderRadius: 16 },
    scanFooter: { backgroundColor: '#161616', paddingVertical: 14, alignItems: 'center' },
    scanFooterText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    centerBoxLight: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, gap: 12, padding: 32 },
    permIcon: { fontSize: 46, marginBottom: 8, opacity: 0.6 },
    permTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    permSub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
    permBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingHorizontal: 26, paddingVertical: 13, marginTop: 10 },
    permBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    webFallbackIcon: { fontSize: 48, marginBottom: 18, opacity: 0.5 },
    webFallbackTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 10, textAlign: 'center' },
    webFallbackSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 21 },

    // ── Bind ──
    bindBody: { flex: 1, padding: 20 },
    searchInput: {
      backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13,
      fontSize: 15, color: theme.text, borderWidth: 0.5, borderColor: theme.border, marginBottom: 12,
    },
    selectedGuestRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: theme.accent + '14', borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: theme.accent,
    },
    selectedGuestName: { flex: 1, fontSize: 14.5, fontWeight: '700', color: theme.text },
    selectedGuestCheck: { fontSize: 15, fontWeight: '700', color: theme.accent },
    changeGuestLink: { fontSize: 12.5, fontWeight: '600', color: theme.accent },
    guestRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    guestAvatar: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: theme.accent,
      alignItems: 'center', justifyContent: 'center',
    },
    guestAvatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    guestRowName: { fontSize: 14, fontWeight: '700', color: theme.text },
    guestRowPhone: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
    addGuestRow: { paddingVertical: 14, alignItems: 'center' },
    addGuestRowText: { fontSize: 13.5, fontWeight: '700', color: theme.accent },

    sectionLabel: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary, marginTop: 20, marginBottom: 10 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16,
      backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
    },
    chipActive: { backgroundColor: theme.accent + '18', borderColor: theme.accent },
    chipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
    chipTextActive: { color: theme.accent },
    amountRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
      backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15,
      borderWidth: 0.5, borderColor: theme.border,
    },
    amountPrefix: { fontSize: 16, color: theme.textSecondary },
    amountInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: theme.text },

    bottomBar: { padding: 16, borderTopWidth: 0.5, borderTopColor: theme.border },
    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
    secondaryBtn: {
      backgroundColor: theme.cardBg, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
      borderWidth: 0.5, borderColor: theme.border, marginBottom: 10,
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '700', color: theme.text },

    // ── Reveal ──
    revealBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    revealLabel: { fontSize: 13, color: theme.textSecondary, marginBottom: 16 },
    revealAvatar: {
      width: 84, height: 84, borderRadius: 42, backgroundColor: theme.accent,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    revealAvatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
    revealName: { fontSize: 24, fontWeight: '800', color: theme.text, textAlign: 'center' },
    revealPhone: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
    revealPill: {
      backgroundColor: theme.cardBg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
      marginTop: 18, borderWidth: 0.5, borderColor: theme.border,
    },
    revealPillText: { fontSize: 13.5, fontWeight: '600', color: theme.text },
    revealActions: { width: '100%', marginTop: 36 },
  });
}

// Desktop tool-links row (list-mode desktop branch only) -- colours from
// lib/desktopTheme.js, matching every other desktop reskin in this app.
const ds = StyleSheet.create({
  toolsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: LINE,
  },
  toolBtnText: { fontSize: 13, fontWeight: '700', color: TEXT },
});
