// Barcode scanning needs the EAS dev-client build — it does not work in
// Expo Go (expo-camera's CameraView itself does; barcode scanning specifically
// needs the native module included in a dev-client build, confirmed against
// this project's own CheckInScanner.js precedent).
import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Network from 'expo-network';
import { useTheme } from '../../ThemeContext';
import { syncPasses, lookupPass, recordCheckIn, drainCheckIns, getStats, subscribe } from '../../lib/passQueue';
import AppHeader from '../../components/AppHeader';

let CameraView, useCameraPermissions;
if (Platform.OS !== 'web') {
  CameraView = require('expo-camera').CameraView;
  useCameraPermissions = require('expo-camera').useCameraPermissions;
} else {
  CameraView = View;
  useCameraPermissions = () => [{ granted: false }, () => {}];
}

const RESULT_HOLD_MS = 2200;
const PASS_URL_PATTERN = /\/p\/([A-Z0-9]{6})$/i;

function extractCode(scannedData) {
  const match = (scannedData || '').match(PASS_URL_PATTERN);
  if (match) return match[1].toUpperCase();
  // Manual entry or a bare code somehow scanned — accept a plain 6-char code too.
  const trimmed = (scannedData || '').trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(trimmed) ? trimmed : null;
}

// ── Web fallback — offline scanning is native-only ──
function WebNotAvailable({ navigation, theme }) {
  const s = makeStyles(theme);
  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Scan passes" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <View style={s.webFallback}>
        <Text style={s.webFallbackIcon}>📱</Text>
        <Text style={s.webFallbackTitle}>Open the Utsav app to scan passes</Text>
        <Text style={s.webFallbackSub}>Gate scanning uses your device's camera and isn't available in the web version.</Text>
      </View>
    </SafeAreaView>
  );
}

export default function PassScanner({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);

  if (Platform.OS === 'web') {
    return <WebNotAvailable navigation={navigation} theme={theme} />;
  }

  return <NativePassScanner eventId={eventId} navigation={navigation} theme={theme} s={s} />;
}

function NativePassScanner({ eventId, navigation, theme, s }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState(null); // { type: 'valid'|'already'|'notfound'|'void', pass }
  const [arrivedInput, setArrivedInput] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(true);

  const lockedRef = useRef(false);
  const holdTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try { await syncPasses(eventId); } catch (err) { console.log('PassScanner syncPasses error:', err.message); }
      setSyncing(false);
      drainCheckIns();
    })();

    const unsubscribe = subscribe(() => refreshStats());
    refreshStats();
    checkNetwork();
    const netInterval = setInterval(() => { checkNetwork(); drainCheckIns(); }, 15000);

    return () => {
      unsubscribe();
      clearInterval(netInterval);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, [eventId]);

  async function checkNetwork() {
    try {
      const net = await Network.getNetworkStateAsync();
      setIsOffline(!net.isConnected || net.isInternetReachable === false);
    } catch {
      setIsOffline(true);
    }
  }

  async function refreshStats() {
    const stats = await getStats(eventId);
    setPendingSync(stats.pendingSync);
  }

  async function resolveCode(code) {
    if (lockedRef.current) return;
    lockedRef.current = true;

    const pass = await lookupPass(eventId, code);
    if (!pass) {
      setResult({ type: 'notfound', pass: null });
    } else if (pass.status === 'void') {
      setResult({ type: 'void', pass });
    } else if (pass.status === 'checked_in') {
      setResult({ type: 'already', pass });
      setArrivedInput(Math.min(pass.arrivedCount + 1, pass.partySize));
    } else {
      setResult({ type: 'valid', pass });
      setArrivedInput(pass.partySize);
    }

    holdTimerRef.current = setTimeout(scanNext, RESULT_HOLD_MS);
  }

  function handleBarcodeScanned({ data }) {
    if (lockedRef.current) return;
    const code = extractCode(data);
    if (!code) return; // not a Utsav pass QR — keep scanning silently
    resolveCode(code);
  }

  async function confirmCheckIn() {
    if (!result?.pass) return;
    setConfirming(true);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    try {
      await recordCheckIn(eventId, result.pass.passCode, arrivedInput);
      drainCheckIns();
      scanNext();
    } catch (err) {
      console.log('confirmCheckIn error:', err.message);
      scanNext();
    } finally {
      setConfirming(false);
    }
  }

  function scanNext() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    setResult(null);
    setManualEntry(false);
    setManualCode('');
    lockedRef.current = false;
  }

  function submitManualCode() {
    const code = manualCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return;
    resolveCode(code);
  }

  if (!permission) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}><ActivityIndicator size="large" color={theme.accent} /></View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBoxLight}>
          <Text style={s.permIcon}>📷</Text>
          <Text style={s.permTitle}>Camera permission needed</Text>
          <Text style={s.permSub}>We need camera access to scan gate passes.</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Allow camera access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title="Scan passes"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="manual" onPress={() => setManualEntry(true)}>
            <Text style={s.manualLink}>Type code</Text>
          </TouchableOpacity>,
        ]}
      />
      {syncing ? (
        <Text style={[s.syncNote, { paddingHorizontal: 20, marginTop: -10, marginBottom: 10 }]}>Syncing pass list…</Text>
      ) : (
        <Text style={[s.syncNote, isOffline && s.syncNoteOffline, { paddingHorizontal: 20, marginTop: -10, marginBottom: 10 }]}>
          {isOffline ? '📴 Offline — scanning still works' : '● Online'}
          {pendingSync > 0 ? ` · ${pendingSync} pending sync` : ''}
        </Text>
      )}

      <View style={s.cameraWrapper}>
        <CameraView
          style={s.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={result ? undefined : handleBarcodeScanned}
        />
        <View style={s.scanFrame} pointerEvents="none"><View style={s.scanBox} /></View>

        {manualEntry && !result && (
          <KeyboardAvoidingView style={s.manualOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Text style={s.manualTitle}>Enter the 6-character code</Text>
            <TextInput
              style={s.manualInput}
              value={manualCode}
              onChangeText={t => setManualCode(t.toUpperCase())}
              placeholder="ABCDEF"
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="characters"
              maxLength={6}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={s.manualCancelBtn} onPress={() => { setManualEntry(false); setManualCode(''); }}>
                <Text style={s.manualCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.manualSubmitBtn} onPress={submitManualCode} disabled={manualCode.length !== 6}>
                <Text style={s.manualSubmitBtnText}>Look up</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {result && (
          <View style={[s.resultOverlay, RESULT_STYLES[result.type]]}>
            {result.type === 'valid' && (
              <>
                <Text style={s.resultIcon}>✅</Text>
                <Text style={s.resultName}>{result.pass.guestName}</Text>
                {result.pass.partySize > 1 && (
                  <View style={s.stepperRow}>
                    <Text style={s.stepperLabel}>Admitting</Text>
                    <TouchableOpacity style={s.stepperBtn} onPress={() => setArrivedInput(n => Math.max(1, n - 1))}>
                      <Text style={s.stepperBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.stepperValue}>{arrivedInput} / {result.pass.partySize}</Text>
                    <TouchableOpacity style={s.stepperBtn} onPress={() => setArrivedInput(n => Math.min(result.pass.partySize, n + 1))}>
                      <Text style={s.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity style={s.confirmBtn} onPress={confirmCheckIn} disabled={confirming}>
                  {confirming ? <ActivityIndicator color="#fff" /> : <Text style={s.confirmBtnText}>Confirm check-in</Text>}
                </TouchableOpacity>
              </>
            )}
            {result.type === 'already' && (
              <>
                <Text style={s.resultIcon}>⏱</Text>
                <Text style={s.resultName}>{result.pass.guestName}</Text>
                <Text style={s.resultSub}>Already checked in{result.pass.checkedInAt ? ` · ${new Date(result.pass.checkedInAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}</Text>
                {result.pass.arrivedCount < result.pass.partySize ? (
                  <>
                    <View style={s.stepperRow}>
                      <Text style={s.stepperLabel}>Admit more</Text>
                      <TouchableOpacity style={s.stepperBtn} onPress={() => setArrivedInput(n => Math.max(result.pass.arrivedCount, n - 1))}>
                        <Text style={s.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={s.stepperValue}>{arrivedInput} / {result.pass.partySize}</Text>
                      <TouchableOpacity style={s.stepperBtn} onPress={() => setArrivedInput(n => Math.min(result.pass.partySize, n + 1))}>
                        <Text style={s.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={s.confirmBtn} onPress={confirmCheckIn} disabled={confirming}>
                      {confirming ? <ActivityIndicator color="#fff" /> : <Text style={s.confirmBtnText}>Admit {arrivedInput - result.pass.arrivedCount} more</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={s.resultSub}>Full party of {result.pass.partySize} has arrived.</Text>
                )}
              </>
            )}
            {result.type === 'notfound' && (
              <>
                <Text style={s.resultIcon}>⚠️</Text>
                <Text style={s.resultName}>Pass not found</Text>
                <Text style={s.resultSub}>This code belongs to another event, or isn't valid.</Text>
              </>
            )}
            {result.type === 'void' && (
              <>
                <Text style={s.resultIcon}>🚫</Text>
                <Text style={s.resultName}>Pass voided</Text>
                <Text style={s.resultSub}>{result.pass?.guestName || 'This pass'} is no longer valid.</Text>
              </>
            )}
            <TouchableOpacity style={s.scanNextBtn} onPress={scanNext}>
              <Text style={s.scanNextBtnText}>Scan next</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const RESULT_STYLES = {
  valid: { backgroundColor: 'rgba(15,60,20,0.92)' },
  already: { backgroundColor: 'rgba(90,70,10,0.92)' },
  notfound: { backgroundColor: 'rgba(80,15,15,0.92)' },
  void: { backgroundColor: 'rgba(80,15,15,0.92)' },
};

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#161616' },
    backIcon: { fontSize: 22, color: '#fff', width: 32 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    syncNote: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
    syncNoteOffline: { color: '#F0A93F' },
    manualLink: { fontSize: 13, fontWeight: '600', color: theme.accent },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
    centerBoxLight: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, gap: 12, padding: 32 },
    permIcon: { fontSize: 46, marginBottom: 8, opacity: 0.6 },
    permTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    permSub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
    permBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingHorizontal: 26, paddingVertical: 13, marginTop: 10 },
    permBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    cameraWrapper: { flex: 1, position: 'relative' },
    camera: { flex: 1 },
    scanFrame: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
    },
    scanBox: { width: 240, height: 240, borderRadius: 20, borderWidth: 2, borderColor: theme.accent, borderStyle: 'dashed' },

    manualOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 32 },
    manualTitle: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 14 },
    manualInput: { fontSize: 26, fontWeight: '800', letterSpacing: 8, color: '#fff', textAlign: 'center', borderBottomWidth: 2, borderBottomColor: theme.accent, paddingVertical: 8, width: '80%' },
    manualCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center' },
    manualCancelBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    manualSubmitBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center' },
    manualSubmitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    resultOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
    resultIcon: { fontSize: 48 },
    resultName: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
    resultSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },

    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
    stepperLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
    stepperBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    stepperBtnText: { fontSize: 20, fontWeight: '700', color: '#fff' },
    stepperValue: { fontSize: 16, fontWeight: '700', color: '#fff', minWidth: 50, textAlign: 'center' },

    confirmBtn: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 30, paddingVertical: 14, marginTop: 16 },
    confirmBtnText: { color: '#1A1225', fontSize: 15, fontWeight: '800' },
    scanNextBtn: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 20 },
    scanNextBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },

    webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: theme.bg },
    webFallbackIcon: { fontSize: 48, marginBottom: 18, opacity: 0.5 },
    webFallbackTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 10, textAlign: 'center' },
    webFallbackSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21 },
  });
}
