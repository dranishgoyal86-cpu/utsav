import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../ThemeContext';
import { supabase } from '../supabase';
import { callEdgeFunction, confirmDestructive, showAlert } from '../helpers';
import SparkleIcon from '../components/SparkleIcon';
import { formatTimeLabel } from '../lib/eventContext';
import { isNonFestive } from '../lib/inviteSchemas';
import { PUBLIC_WEB_URL } from '../config';

let accompanyingLocalIdCounter = 0;
function nextLocalId() {
  accompanyingLocalIdCounter += 1;
  return `local-${accompanyingLocalIdCounter}`;
}

// Part 1, invite-architecture wave — the 'yes' option is the one
// celebratory-language spot this screen had ("🎉 Joyfully accept" for
// every event, funeral/last-rites included). 'maybe'/'no' are left
// untouched — neither is celebratory wording to begin with, so there's
// nothing to swap for a solemn event. Driven entirely by the centralized
// isNonFestive() resolver (lib/inviteSchemas) — no funeral-last-rites (or
// any other slug) is hardcoded here; a future non-festive schema flag
// flows through automatically, same as every other invite-architecture
// call site. No religious icon substituted (e.g. no 🙏) — plain neutral
// text, no emoji at all, per explicit instruction.
function getRsvpOptions(nonFestive) {
  return [
    nonFestive
      ? { value: 'yes', label: 'I will attend', icon: '' }
      : { value: 'yes', label: 'Joyfully accept', icon: '🎉' },
    { value: 'maybe', label: 'Maybe', icon: '🤔' },
    { value: 'no', label: "Can't make it", icon: '😔' },
  ];
}

const FOOD_PREF_OPTIONS = [
  { value: 'any', label: 'No preference' },
  { value: 'veg', label: 'Vegetarian' },
  { value: 'nonveg', label: 'Non-vegetarian' },
  { value: 'jain', label: 'Jain' },
];

function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function RSVPScreen({ route, navigation }) {
  const { theme } = useTheme();
  const inviteCode = route?.params?.inviteCode || '';
  // Present only on a per-guest link (GuestList.js embeds the guest's own
  // event_invitees.id) — absent on an old-style broadcast link, which
  // keeps behaving exactly as before: blank form, no prefill, phone-based
  // matching on submit. See linking.js's optional :guestId? segment.
  const routeGuestId = route?.params?.guestId || '';
  const s = makeStyles(theme);

  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [event, setEvent] = useState(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rsvpStatus, setRsvpStatus] = useState('yes');
  const [plusOnes, setPlusOnes] = useState(0);
  const [foodPref, setFoodPref] = useState('any');
  const [isOutstation, setIsOutstation] = useState(false);
  const [arrivalDate, setArrivalDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [arrivalDetails, setArrivalDetails] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [pickupNeeded, setPickupNeeded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [deletingData, setDeletingData] = useState(false);
  const [dataDeleted, setDataDeleted] = useState(false);

  // Prefill diffing — set once from a resolved invitee, never touched
  // again, so the change-warning compares against what the host actually
  // has on file, not against whatever the guest has typed so far.
  const [originalName, setOriginalName] = useState(null);
  const [originalPhone, setOriginalPhone] = useState(null);
  // Confirmed by get_event once the invite loads — may differ from
  // routeGuestId (empty) if this is a genuinely new/unlisted guest.
  const [resolvedGuestId, setResolvedGuestId] = useState(routeGuestId || null);
  const [docUploadNote, setDocUploadNote] = useState('');

  // Govt-ID collection — only ever shown/used inside the isOutstation
  // section. { uri, base64, ext } | null. Picked via ImagePicker's
  // base64:true option deliberately (not FileSystem.readAsStringAsync) —
  // this screen has to work identically for an unauthenticated guest on
  // both web and native, and base64:true is the one path that's actually
  // uniform across both, unlike a manual file-read step.
  const [govtIdAsset, setGovtIdAsset] = useState(null);
  const [accompanying, setAccompanying] = useState([]); // [{ localId, existingId, name, asset, existingDocPath }]

  useEffect(() => { fetchEvent(); }, [inviteCode, routeGuestId]);

  async function fetchEvent() {
    if (!inviteCode) {
      setLoadError('No invite code was provided.');
      setLoadingEvent(false);
      return;
    }
    try {
      setLoadingEvent(true);
      const { event: ev } = await callEdgeFunction('submit-rsvp', {
        action: 'get_event', invite_code: inviteCode, guest_id: routeGuestId || undefined,
      });
      setEvent(ev);

      if (ev?.invitee) {
        const inv = ev.invitee;
        setResolvedGuestId(inv.id);
        setName(inv.name || '');
        setPhone(inv.phone || '');
        setOriginalName(inv.name || '');
        setOriginalPhone(inv.phone || '');
        // Value set (yes/maybe/no) is identical regardless of nonFestive —
        // only the 'yes' option's label/icon vary — so this validity check
        // doesn't need getRsvpOptions() at all.
        if (['yes', 'maybe', 'no'].includes(inv.rsvp_status)) setRsvpStatus(inv.rsvp_status);
        setPlusOnes(inv.plus_ones || 0);
        if (FOOD_PREF_OPTIONS.some(o => o.value === inv.food_pref)) setFoodPref(inv.food_pref);
        setIsOutstation(!!inv.is_outstation);
        setArrivalDate(inv.arrival_date || '');
        setArrivalTime(inv.arrival_time || '');
        setArrivalDetails(inv.arrival_details || '');
        setDepartureDate(inv.departure_date || '');
        setDepartureTime(inv.departure_time || '');
        setPickupNeeded(!!inv.pickup_needed);
      }
      if (ev?.accompanying?.length) {
        setAccompanying(ev.accompanying.map(a => ({
          localId: nextLocalId(), existingId: a.id, name: a.name || '', asset: null, existingDocPath: a.govt_id_doc_path || null,
        })));
      }
    } catch (err) {
      setLoadError(err.message || 'Invite not found.');
    } finally {
      setLoadingEvent(false);
    }
  }

  const nameChanged = originalName !== null && name.trim() !== originalName;
  const phoneChanged = originalPhone !== null && phone.trim() !== originalPhone;

  async function pickGovtId() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = (asset.fileName || asset.uri || '').split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    setGovtIdAsset({ uri: asset.uri, base64: asset.base64, ext: /^[a-z0-9]{2,4}$/.test(ext) ? ext : 'jpg' });
  }

  async function pickAccompanyingDoc(localId) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = (asset.fileName || asset.uri || '').split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    setAccompanying(prev => prev.map(a => a.localId === localId
      ? { ...a, asset: { uri: asset.uri, base64: asset.base64, ext: /^[a-z0-9]{2,4}$/.test(ext) ? ext : 'jpg' } }
      : a));
  }

  function addAccompanyingGuest() {
    setAccompanying(prev => [...prev, { localId: nextLocalId(), existingId: null, name: '', asset: null, existingDocPath: null }]);
  }

  function updateAccompanyingName(localId, newName) {
    setAccompanying(prev => prev.map(a => a.localId === localId ? { ...a, name: newName } : a));
  }

  function removeAccompanyingGuest(localId) {
    setAccompanying(prev => prev.filter(a => a.localId !== localId));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await callEdgeFunction('submit-rsvp', {
        action: 'submit_rsvp',
        invite_code: inviteCode,
        guest_id: resolvedGuestId || undefined,
        name: name.trim(),
        phone: phone.trim(),
        rsvp_status: rsvpStatus,
        plus_ones: plusOnes,
        food_pref: rsvpStatus === 'no' ? null : foodPref,
        is_outstation: rsvpStatus === 'no' ? false : isOutstation,
        arrival_date: arrivalDate.trim() || null,
        arrival_time: arrivalTime.trim() || null,
        arrival_details: arrivalDetails.trim() || null,
        departure_date: departureDate.trim() || null,
        departure_time: departureTime.trim() || null,
        pickup_needed: pickupNeeded,
      });
      setSubmitted(true);

      // Document uploads are a separate, best-effort follow-up step — the
      // RSVP itself already succeeded (setSubmitted(true) above already
      // fired), so a doc-upload failure here shouldn't read as the whole
      // submission failing. Only attempted when outstation is genuinely on
      // and there's something to upload; sequential (not Promise.all) since
      // each is a real network call carrying a full base64 image.
      const invId = result?.invitee_id || resolvedGuestId;
      const hasDocsToUpload = rsvpStatus !== 'no' && isOutstation && invId &&
        (govtIdAsset || accompanying.some(a => a.name.trim() || a.asset));
      if (hasDocsToUpload) {
        await uploadOutstationDocuments(invId);
      }
    } catch (err) {
      setError(err.message || 'Could not submit your RSVP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadOutstationDocuments(inviteeId) {
    let failed = false;
    try {
      if (govtIdAsset?.base64) {
        await callEdgeFunction('submit-rsvp', {
          action: 'upload_guest_document',
          invite_code: inviteCode,
          guest_id: inviteeId,
          file_base64: govtIdAsset.base64,
          file_ext: govtIdAsset.ext,
        });
      }
      for (const a of accompanying) {
        if (!a.name.trim() && !a.asset) continue;
        await callEdgeFunction('submit-rsvp', {
          action: 'upload_guest_document',
          invite_code: inviteCode,
          guest_id: inviteeId,
          target: 'accompanying',
          accompanying_id: a.existingId || undefined,
          accompanying_name: a.name.trim(),
          file_base64: a.asset?.base64,
          file_ext: a.asset?.ext,
        });
      }
    } catch (err) {
      failed = true;
      console.log('Document upload error:', err.message);
    }
    if (failed) {
      setDocUploadNote("Your RSVP was saved, but we couldn't upload your ID document — reopen this link to try again.");
    }
  }

  function requestDataDeletion() {
    confirmDestructive(
      'Delete my data?',
      "This permanently removes your name, phone number, and any notes from this event's guest list — it can't be undone. The host keeps only anonymous counts (RSVP status, headcount) for their records.",
      'Delete my data',
      async () => {
        setDeletingData(true);
        try {
          const { data: found, error: rpcError } = await supabase.rpc('request_guest_deletion_by_invite', {
            p_invite_code: inviteCode,
            p_phone: phone.trim(),
          });
          if (rpcError) throw rpcError;
          if (!found) {
            showAlert('Not found', "We couldn't find your RSVP with that phone number. If you've RSVP'd with a different number, we're unable to match it automatically.");
            return;
          }
          setDataDeleted(true);
        } catch (err) {
          showAlert('Error', err.message || 'Could not process your request. Please try again.');
        } finally {
          setDeletingData(false);
        }
      }
    );
  }

  if (loadingEvent) {
    return (
      <SafeAreaView style={[s.container, s.centerBox]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </SafeAreaView>
    );
  }

  if (loadError || !event) {
    return (
      <SafeAreaView style={[s.container, s.centerBox]}>
        <Text style={s.errorIcon}>😕</Text>
        <Text style={s.errorTitle}>Invite not found</Text>
        <Text style={s.errorSub}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={[s.container, s.centerBox]}>
        <SparkleIcon style={s.successIcon} />
        <Text style={s.successTitle}>Thank you, {name.trim().split(' ')[0]}!</Text>
        <Text style={s.successSub}>
          {rsvpStatus === 'yes'
            ? `Your RSVP is confirmed${plusOnes > 0 ? ` for you + ${plusOnes} guest${plusOnes > 1 ? 's' : ''}` : ''}. See you at ${event.name}!`
            : rsvpStatus === 'maybe'
            ? `We've noted you might join ${event.name}. Update anytime by reopening this link.`
            : `We've let the host know you can't make it to ${event.name}.`}
        </Text>

        {docUploadNote ? <Text style={s.docUploadNoteText}>{docUploadNote}</Text> : null}

        {dataDeleted ? (
          <Text style={s.dataDeletedText}>✓ Your name, phone, and notes have been removed from this event's guest list.</Text>
        ) : (
          <TouchableOpacity style={s.deleteDataLink} onPress={requestDataDeletion} disabled={deletingData}>
            {deletingData
              ? <ActivityIndicator size="small" color={theme.textTertiary} />
              : <Text style={s.deleteDataLinkText}>Request my data be deleted</Text>
            }
          </TouchableOpacity>
        )}

        <View style={s.appFooter}>
          <View style={s.appFooterDivider} />
          <View style={s.appFooterBrand}>
            <SparkleIcon style={s.appFooterIcon} />
            <Text style={s.appFooterName}>Utsav</Text>
          </View>
          <Text style={s.appFooterTagline}>Make every Celebration AN UTSAV</Text>
          <TouchableOpacity style={s.appFooterBtn} onPress={() => Linking.openURL(PUBLIC_WEB_URL)}>
            <Text style={s.appFooterBtnText}>Plan your own event on Utsav →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const eventDate = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const eventTime = formatTimeLabel(event.event_time);
  // Part 1, invite-architecture wave. Computed directly in the render body
  // (not memoized) so it reacts immediately once `event` (and its
  // event_type_slug) finishes loading — same pattern lib/inviteSchemas'
  // other call sites (ToranInvites.js, PlanView.js) already use.
  const nonFestive = isNonFestive(event.event_type_slug);
  const rsvpOptions = getRsvpOptions(nonFestive);

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.logoBox}>
            <SparkleIcon style={s.logoIcon} />
            <Text style={s.eventName}>{event.name}</Text>
            {eventDate ? <Text style={s.eventDate}>📅 {eventDate}</Text> : null}
            {eventTime ? <Text style={s.eventDate}>🕐 {eventTime}</Text> : null}
          </View>

          {event.venue ? (
            <TouchableOpacity style={s.venueBox} onPress={() => Linking.openURL(googleMapsUrl(event.venue))}>
              <Text style={s.venueIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.venueAddress}>{event.venue}</Text>
                <Text style={s.venueLink}>View on Google Maps ›</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={s.form}>
            <Text style={s.formTitle}>RSVP</Text>

            <Text style={s.label}>Your name</Text>
            <TextInput style={s.input} placeholder="Full name" placeholderTextColor={theme.textTertiary} value={name} onChangeText={setName} />

            <Text style={s.label}>Phone number</Text>
            <TextInput style={s.input} placeholder="9999999999" placeholderTextColor={theme.textTertiary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            {(nameChanged || phoneChanged) ? (
              <Text style={s.overCapHint}>
                This is different from what your host has on file — they'll be notified of the change when you submit.
              </Text>
            ) : null}

            <Text style={s.label}>Will you attend?</Text>
            <View style={s.rsvpRow}>
              {rsvpOptions.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.rsvpChip, rsvpStatus === opt.value && s.rsvpChipActive]}
                  onPress={() => setRsvpStatus(opt.value)}
                >
                  {opt.icon ? <Text style={s.rsvpChipIcon}>{opt.icon}</Text> : null}
                  <Text style={[s.rsvpChipText, rsvpStatus === opt.value && s.rsvpChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {rsvpStatus !== 'no' && (
              <>
                <Text style={s.label}>Guests accompanying you</Text>
                <View style={s.stepperRow}>
                  <TouchableOpacity style={s.stepperBtn} onPress={() => setPlusOnes(v => Math.max(0, v - 1))}>
                    <Text style={s.stepperBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.stepperValue}>{plusOnes}</Text>
                  <TouchableOpacity style={s.stepperBtn} onPress={() => setPlusOnes(v => Math.min(20, v + 1))}>
                    <Text style={s.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                  <Text style={s.stepperHint}>{plusOnes === 0 ? 'Just me' : `Me + ${plusOnes}`}</Text>
                </View>
                {event.defaultPlusOneLimit != null && plusOnes > event.defaultPlusOneLimit ? (
                  <Text style={s.overCapHint}>
                    That's more than the host's guideline of {event.defaultPlusOneLimit} — that's okay, we'll let them know.
                  </Text>
                ) : null}

                <Text style={s.label}>Food preference</Text>
                <View style={s.foodPrefRow}>
                  {FOOD_PREF_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[s.foodPrefChip, foodPref === opt.value && s.foodPrefChipActive]}
                      onPress={() => setFoodPref(opt.value)}
                    >
                      <Text style={[s.foodPrefChipText, foodPref === opt.value && s.foodPrefChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={s.outstationToggleRow} onPress={() => setIsOutstation(v => !v)}>
                  <View style={[s.checkbox, isOutstation && s.checkboxActive]}>
                    {isOutstation ? <Text style={s.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={s.outstationToggleText}>I'm traveling from outside town</Text>
                </TouchableOpacity>

                {isOutstation && (
                  <View style={s.travelBox}>
                    <Text style={s.label}>Arrival date</Text>
                    <TextInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textTertiary} value={arrivalDate} onChangeText={setArrivalDate} />
                    <Text style={s.label}>Arrival time</Text>
                    <TextInput style={s.input} placeholder="e.g. 14:30" placeholderTextColor={theme.textTertiary} value={arrivalTime} onChangeText={setArrivalTime} />
                    <Text style={s.label}>Flight / train details</Text>
                    <TextInput style={s.input} placeholder="e.g. AI 803, arriving Terminal 3" placeholderTextColor={theme.textTertiary} value={arrivalDetails} onChangeText={setArrivalDetails} />
                    <Text style={s.label}>Departure date</Text>
                    <TextInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textTertiary} value={departureDate} onChangeText={setDepartureDate} />
                    <Text style={s.label}>Departure time</Text>
                    <TextInput style={s.input} placeholder="e.g. 09:00" placeholderTextColor={theme.textTertiary} value={departureTime} onChangeText={setDepartureTime} />

                    <TouchableOpacity style={s.outstationToggleRow} onPress={() => setPickupNeeded(v => !v)}>
                      <View style={[s.checkbox, pickupNeeded && s.checkboxActive]}>
                        {pickupNeeded ? <Text style={s.checkboxMark}>✓</Text> : null}
                      </View>
                      <Text style={s.outstationToggleText}>I'll need a pickup</Text>
                    </TouchableOpacity>

                    {/* Since you're traveling from outside, your host can
                        arrange your stay — this is what lets them put
                        together a real, shareable list for the hotel/venue,
                        rather than chasing everyone individually. */}
                    <Text style={[s.label, { marginTop: 20 }]}>Your government ID</Text>
                    <Text style={s.docSectionHint}>For hotel/accommodation arrangements — Aadhaar card or similar.</Text>
                    <TouchableOpacity style={s.docPickBtn} onPress={pickGovtId}>
                      <Text style={s.docPickBtnText}>{govtIdAsset ? '✓ ID selected — tap to change' : '📄 Upload your ID'}</Text>
                    </TouchableOpacity>

                    <Text style={[s.label, { marginTop: 16 }]}>Anyone traveling with you?</Text>
                    <Text style={s.docSectionHint}>Add anyone sharing your stay, with their ID.</Text>
                    {accompanying.map(a => (
                      <View key={a.localId} style={s.accompanyingRow}>
                        <TextInput
                          style={[s.input, { flex: 1, marginTop: 0 }]}
                          placeholder="Name"
                          placeholderTextColor={theme.textTertiary}
                          value={a.name}
                          onChangeText={v => updateAccompanyingName(a.localId, v)}
                        />
                        <TouchableOpacity style={s.docPickBtnSmall} onPress={() => pickAccompanyingDoc(a.localId)}>
                          <Text style={s.docPickBtnSmallText}>{a.asset || a.existingDocPath ? '✓ ID' : '📄 ID'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.accompanyingRemoveBtn} onPress={() => removeAccompanyingGuest(a.localId)}>
                          <Text style={s.accompanyingRemoveBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={s.addAccompanyingBtn} onPress={addAccompanyingGuest}>
                      <Text style={s.addAccompanyingBtnText}>+ Add another person</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.7 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color={theme.btnPrimaryText} />
                : <Text style={s.submitBtnText}>Send RSVP</Text>
              }
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { paddingHorizontal: 24, paddingTop: 44, paddingBottom: 20 },
    centerBox: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

    logoBox: { alignItems: 'center', marginBottom: 20 },
    logoIcon: { fontSize: 30, color: theme.accent, marginBottom: 10 },
    eventName: { fontSize: 26, fontWeight: '700', color: theme.text, letterSpacing: -0.4, textAlign: 'center' },
    eventDate: { fontSize: 14, color: theme.textSecondary, marginTop: 6 },

    venueBox: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.cardBg, borderRadius: 16, padding: 15,
      borderWidth: 0.5, borderColor: theme.border, marginBottom: 22,
    },
    venueIcon: { fontSize: 20 },
    venueAddress: { fontSize: 13.5, color: theme.text, marginBottom: 2 },
    venueLink: { fontSize: 12.5, color: theme.accent, fontWeight: '700' },

    form: {
      backgroundColor: theme.cardBg, borderRadius: 26, padding: 24,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 7 },
    },
    formTitle: { fontSize: 19, fontWeight: '700', color: theme.text, marginBottom: 18, letterSpacing: -0.3 },
    label: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, marginTop: 13 },
    input: { backgroundColor: theme.bg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 1, borderColor: theme.border, color: theme.text },

    rsvpRow: { gap: 10 },
    rsvpChip: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 15, paddingVertical: 13, borderRadius: 14,
      borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.bg,
    },
    rsvpChipActive: { borderColor: theme.accent, backgroundColor: theme.accent + '18' },
    rsvpChipIcon: { fontSize: 18 },
    rsvpChipText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
    rsvpChipTextActive: { color: theme.text, fontWeight: '700' },

    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    stepperBtn: {
      width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border,
    },
    stepperBtnText: { fontSize: 20, fontWeight: '700', color: theme.text },
    stepperValue: { fontSize: 18, fontWeight: '700', color: theme.text, minWidth: 24, textAlign: 'center' },
    stepperHint: { fontSize: 12.5, color: theme.textSecondary, marginLeft: 6 },
    overCapHint: { fontSize: 12, color: theme.textTertiary, marginTop: 6, lineHeight: 16 },

    foodPrefRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    foodPrefChip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18,
      borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.bg,
    },
    foodPrefChipActive: { borderColor: theme.accent, backgroundColor: theme.accent + '18' },
    foodPrefChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    foodPrefChipTextActive: { color: theme.text, fontWeight: '700' },

    outstationToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.border,
      alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg,
    },
    checkboxActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    checkboxMark: { color: theme.btnPrimaryText, fontSize: 13, fontWeight: '800' },
    outstationToggleText: { fontSize: 14, fontWeight: '600', color: theme.text },
    travelBox: {
      marginTop: 12, padding: 14, borderRadius: 16,
      backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border,
    },

    docSectionHint: { fontSize: 11.5, color: theme.textTertiary, marginTop: -4, marginBottom: 8, lineHeight: 15 },
    docPickBtn: {
      borderRadius: 12, paddingVertical: 12, alignItems: 'center',
      borderWidth: 1, borderColor: theme.accent,
    },
    docPickBtnText: { fontSize: 13.5, fontWeight: '700', color: theme.accent },
    accompanyingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    docPickBtnSmall: {
      borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12,
      borderWidth: 1, borderColor: theme.accent,
    },
    docPickBtnSmallText: { fontSize: 12, fontWeight: '700', color: theme.accent },
    accompanyingRemoveBtn: { padding: 8 },
    accompanyingRemoveBtnText: { fontSize: 15, color: theme.textTertiary },
    addAccompanyingBtn: { paddingVertical: 8 },
    addAccompanyingBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
    docUploadNoteText: { fontSize: 12, color: theme.textSecondary, textAlign: 'center', marginTop: 14, lineHeight: 17 },

    errorText: { fontSize: 13, color: theme.statusDeclinedText, marginTop: 11, textAlign: 'center' },
    submitBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
    submitBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },

    errorIcon: { fontSize: 44, marginBottom: 14 },
    errorTitle: { fontSize: 19, fontWeight: '700', color: theme.text, marginBottom: 8 },
    errorSub: { fontSize: 13.5, color: theme.textSecondary, textAlign: 'center' },

    successIcon: { fontSize: 44, color: theme.accent, marginBottom: 16 },
    successTitle: { fontSize: 21, fontWeight: '700', color: theme.text, marginBottom: 10, textAlign: 'center' },
    successSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21 },

    deleteDataLink: { marginTop: 22, paddingVertical: 8 },
    deleteDataLinkText: { fontSize: 12.5, color: theme.textTertiary, textAlign: 'center', textDecorationLine: 'underline' },
    dataDeletedText: { fontSize: 12.5, color: theme.textSecondary, textAlign: 'center', marginTop: 22, lineHeight: 18 },

    appFooter: { alignItems: 'center', marginTop: 36, width: '100%' },
    appFooterDivider: { width: 48, height: 1, backgroundColor: theme.border, marginBottom: 24 },
    appFooterBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    appFooterIcon: { fontSize: 16, color: theme.accent },
    appFooterName: { fontSize: 16, fontWeight: '700', color: theme.text, letterSpacing: -0.2 },
    appFooterTagline: { fontSize: 12, color: theme.textSecondary, marginTop: 6, fontStyle: 'italic' },
    appFooterBtn: {
      marginTop: 16, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20,
      borderWidth: 1, borderColor: theme.accent,
    },
    appFooterBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  });
}
