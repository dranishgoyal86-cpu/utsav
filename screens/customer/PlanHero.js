import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Microphone } from 'phosphor-react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert, callEdgeFunction } from '../../helpers';
import { matchEventTypeText, EVENT_TYPE_NAMES, eventTypeName } from '../../lib/eventTypeNames';
import { registerTourTarget } from '../../lib/tourTargets';

// "whatever details a client is putting in the main plan screen ... app
// should pick all possible details and autofill event planning screen
// eventually" (Anish, Sept 16). Builds the short "here's what we picked
// up" recap line SlotPrompt.js shows once, from exactly the fields
// parse-event-prompt returned — kept in sync by hand with that edge
// function's ALLOWED_KEYS and components/SlotField.js's real slots.
function buildRecapLines(patch) {
  const lines = [];
  if (patch.guest_count != null) lines.push(`${patch.guest_count} guests`);
  if (patch.city) lines.push(patch.city);
  if (patch.event_date) {
    lines.push(new Date(patch.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
  }
  if (patch.venue_type) lines.push(patch.venue_type === 'home' ? 'At home' : 'At a venue');
  if (patch.budget_total != null) lines.push(`₹${patch.budget_total.toLocaleString('en-IN')} budget`);
  if (patch.theme) lines.push(`${patch.theme} theme`);
  if (patch.is_dry_event === true) lines.push('Dry event (no alcohol)');
  if (patch.is_veg_only === true) lines.push('Vegetarian only');
  if (patch.birthday_person_name) lines.push(`For ${patch.birthday_person_name}`);
  return lines;
}

// Replaces PlanScreen.js's old chat-style hero input. The moment a host
// submits an idea, a draft events row exists (status: 'draft') and every
// screen from here on reads/writes that same row — nothing regenerates a
// plan from scratch the way the old parseEventText/generateEventPlan flow
// did.
export default function PlanHero({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [askingType, setAskingType] = useState(false);
  const [listening, setListening] = useState(false);
  const inputRef = useRef(null);
  // Registered for the first-login core-loop tour (PlanScreen.js) to
  // spotlight — see lib/tourTargets.js.
  const tourRef = useRef(null);
  useEffect(() => { registerTourTarget('plan-hero-input', tourRef); }, []);

  // expo-speech-recognition's API is the same shape on native and web (it
  // resolves to the browser's own SpeechRecognition on web at build time —
  // that's why this needs no Platform branching), but on native it's a real
  // native module that isn't in the currently-installed dev-client build,
  // so it only actually runs on web until a fresh EAS dev-client build ships
  // (same blocker as Razorpay/native checkout elsewhere in this app).
  useSpeechRecognitionEvent('result', event => {
    const transcript = event.results?.[0]?.transcript;
    if (transcript) {
      setText(transcript);
      if (askingType) setAskingType(false);
    }
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', event => {
    setListening(false);
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showAlert('Voice input error', event.message || "Couldn't hear that — try typing instead.");
    }
  });

  async function toggleListening() {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      showAlert('Microphone permission needed', 'Allow microphone access to plan by voice.');
      return;
    }
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, continuous: false });
  }

  function handleSubmit() {
    if (!text.trim() || submitting) return;
    const matched = matchEventTypeText(text);
    if (matched) {
      createDraftEvent(matched);
    } else {
      // Ambiguous (or no match at all) — ask once with chips, never again
      // after that.
      setAskingType(true);
    }
  }

  async function createDraftEvent(eventTypeSlug) {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showAlert('Not signed in', 'Please log in to start planning.'); return; }

      const workingTitle = text.trim().slice(0, 80) || eventTypeName(eventTypeSlug);

      // Best-effort auto-fill from the host's own free text — never blocks
      // event creation. A timeout, a missing OPENAI_API_KEY, or a parse
      // failure all fall back to exactly today's behavior: an empty patch,
      // nothing pre-filled, every question asked the normal way.
      let autofillPatch = {};
      try {
        const { patch } = await callEdgeFunction('parse-event-prompt', {
          text: text.trim(),
          todayDate: new Date().toISOString().slice(0, 10),
        });
        autofillPatch = patch || {};
      } catch (autofillErr) {
        console.log('parse-event-prompt non-fatal error:', autofillErr.message);
      }
      const recapLines = buildRecapLines(autofillPatch);

      const { data: event, error } = await supabase
        .from('events')
        .insert({
          host_id: session.user.id,
          name: workingTitle,
          working_title: workingTitle,
          event_type_slug: eventTypeSlug,
          status: 'draft',
          ...autofillPatch,
        })
        .select().single();
      if (error) throw error;

      // Compatibility bridge: PlanScreen's own "YOUR PLANS" list, GuestList,
      // notifications, checklist and everything else built this session key
      // off saved_plans, not events directly. A companion row keeps all of
      // that working unchanged for plans started through this new flow.
      // event_date/city are mirrored here too when autofill already caught
      // them — SlotPrompt.js's own saveField() only mirrors on a fresh
      // save, and a slot autofill already filled is one the host may never
      // revisit (SlotPrompt skips anything already answered), so without
      // this the "YOUR PLANS" card would keep showing "No date set" forever
      // even though the event genuinely has one.
      const { error: planError } = await supabase.from('saved_plans').insert({
        customer_id: session.user.id,
        event_type: eventTypeSlug,
        title: workingTitle,
        event_id: event.id,
        status: 'planning',
        ...(autofillPatch.event_date ? { event_date: autofillPatch.event_date } : {}),
        ...(autofillPatch.city ? { city: autofillPatch.city } : {}),
      });
      if (planError) throw planError;

      // A named photo album for this event, same as EventPlanner.js's
      // (legacy flow) and GuestList.js's (standalone new-list flow) event
      // creation already do — this was the one event-creation path that
      // skipped it. No face-matching set up yet, same as those two — that
      // stays an opt-in the host can enable later from the album itself.
      // renameEvent() (helpers.js) already keeps albums.name in sync with
      // the event on every future rename, so nothing else needs to change
      // for the name to stay linked going forward.
      await supabase.from('albums').insert({ user_id: session.user.id, name: workingTitle, event_id: event.id });

      setText('');
      setAskingType(false);
      navigation.navigate('SlotPrompt', { eventId: event.id, recap: recapLines.length > 0 ? recapLines : undefined });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={s.card} ref={tourRef}>
      <TextInput
        ref={inputRef}
        style={s.input}
        placeholder="e.g. A royal wedding for 300 guests in Delhi"
        placeholderTextColor={theme.textTertiary}
        value={text}
        onChangeText={t => { setText(t); if (askingType) setAskingType(false); }}
        onFocus={() => {
          // KeyboardAvoidingView is a no-op on react-native-web (it never
          // wires up any keyboard/viewport listener), so on the webapp the
          // mobile browser's virtual keyboard can still cover this card —
          // nudge the focused input back into view once the keyboard/visual
          // viewport has actually finished resizing.
          if (Platform.OS === 'web') {
            setTimeout(() => inputRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 300);
          }
        }}
        multiline
        textAlignVertical="top"
      />
      <View style={s.btnRow}>
        <TouchableOpacity
          style={[s.micBtn, listening && s.micBtnActive]}
          onPress={toggleListening}
          accessibilityLabel={listening ? 'Stop voice input' : 'Plan by voice'}
        >
          <Microphone size={18} color={listening ? '#FFF' : theme.textSecondary} weight={listening ? 'fill' : 'regular'} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[s.sendBtn, { backgroundColor: text.trim() ? theme.btnPrimary : theme.bgTertiary }]}
          onPress={handleSubmit}
          disabled={!text.trim() || submitting}
        >
          {submitting
            ? <ActivityIndicator size="small" color={theme.btnPrimaryText} />
            : <Text style={[s.sendBtnText, { color: text.trim() ? theme.btnPrimaryText : theme.textTertiary }]}>Start planning →</Text>
          }
        </TouchableOpacity>
      </View>
      {listening && <Text style={s.listeningHint}>🎙️ Listening… speak your event idea</Text>}

      {askingType && (
        <View style={s.askBox}>
          <Text style={s.askTitle}>Which of these is it?</Text>
          <View style={s.chipsWrap}>
            {Object.keys(EVENT_TYPE_NAMES).map(slug => (
              <TouchableOpacity key={slug} style={s.chip} onPress={() => createDraftEvent(slug)} disabled={submitting}>
                <Text style={s.chipText}>{eventTypeName(slug)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    card: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: theme.border },
    input: { fontSize: 15, color: theme.text, lineHeight: 22, minHeight: 60 },
    btnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    sendBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
    sendBtnText: { fontSize: 14, fontWeight: '700' },
    micBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bgTertiary },
    micBtnActive: { backgroundColor: '#F44336' },
    listeningHint: { fontSize: 12, color: theme.textSecondary, marginTop: 8 },

    askBox: { marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: theme.border },
    askTitle: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary, marginBottom: 10 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, backgroundColor: theme.pillBg },
    chipText: { fontSize: 12.5, fontWeight: '600', color: theme.pillText },
  });
}
