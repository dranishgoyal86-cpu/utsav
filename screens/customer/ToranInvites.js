import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, TextInput, Platform, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperPlaneTilt, CheckCircle, Camera } from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert, resolveGuestPartySize, uploadToCloudinary } from '../../helpers';
import { insertGuestPassesWithRetry } from '../../lib/capabilities';
import { useEventContext } from '../../hooks/useEventContext';
import AppHeader from '../../components/AppHeader';
import ToranCoverCard from '../../components/invite/ToranCoverCard';
import StillnessCard from '../../components/invite/StillnessCard';
import { DEFAULT_DESIGN } from '../../lib/inviteThemes';
import { isCelebratory } from '../../lib/eventTypeNames';
import DesktopEventShell from '../../components/desktop/DesktopEventShell';
import InviteDesignerDesktop from '../../components/desktop/InviteDesignerDesktop';

// Wave 13 — same shared breakpoint every desktop screen in this app uses.
const DESKTOP_BREAKPOINT = 768;

const DESIGN_LABELS = { toran: 'Toran', kalamkari: 'Kalamkari', stillness: 'Stillness', ivory: 'Ivory', diya: 'Diya' };
// Wave 8 — Ivory joins Kalamkari as a second neutral, non-Hindu-coded
// option. No entry in DESIGN_SUGGESTIONS below (same as Kalamkari) —
// available, never suggested toward any specific event type.
// Wave 10 — Diya joins the celebratory set too (housewarming/religious-
// event/festival-fair are all celebratory:true per eventTypeNames.js), NOT
// a third gated bucket alongside SOLEMN_DESIGNS — it's still offered
// alongside Toran/Kalamkari/Ivory for any celebratory event, just suggested
// more strongly for its three real occasions below.
const CELEBRATORY_DESIGNS = ['toran', 'kalamkari', 'ivory', 'diya'];
const SOLEMN_DESIGNS = ['stillness'];

// Wave 7 — suggestion, not gating. Every event type in CELEBRATORY_DESIGNS
// can still pick either Toran or Kalamkari regardless of what's suggested
// here; funeral-last-rites isn't listed because Wave 6's restriction to
// Stillness already makes it the only option, nothing to "suggest" among.
// Deliberately no entry for nikah/anand-karaj/christian-wedding/
// parsi-wedding/jain-wedding/interfaith-wedding or any non-wedding
// celebratory type — neither Toran nor Kalamkari leans toward any of
// them, so no suggestion is made rather than silently defaulting to a
// Hindu-coded design.
//
// Wave 10 — Diya suggested for its three real occasions. There is no
// dedicated "puja" slug in the live taxonomy (confirmed live: zero events
// use one) — religious-event is the real slug that covers it, same way
// festival-fair covers Diwali/other festivals (GuestList.js's own DM_STYLES
// comment already notes nothing in the taxonomy distinguishes a Diwali
// party from any other festival-fair). griha-pravesh (the old event_types
// table's slug) is stale/unused — housewarming is the real, live one.
const DESIGN_SUGGESTIONS = {
  'hindu-wedding': 'toran',
  'housewarming': 'diya',
  'religious-event': 'diya',
  'festival-fair': 'diya',
};

// react-native-share + react-native-view-shot, same pattern GuestList.js's
// old designer already uses — image and text/link go out together in one
// share intent. Wave 1, Task 4 originally shipped text-only here (no
// captured image existed yet); Wave 2, Task 1 closes that gap: a guest who
// never taps the link must still receive a complete invitation — name,
// date, venue — on the picture itself, same guarantee the old 40-template
// system already gives.
let NativeShare, ViewShot;
if (Platform.OS !== 'web') {
  NativeShare = require('react-native-share').default;
  ViewShot = require('react-native-view-shot').default;
}

// Wave 1, Task 4 — minimal, deliberately not polished. Reuses
// insertGuestPassesWithRetry() from Task 2 as-is (no reimplementation) and
// PassIssue.js's own batch-generate pattern. Standing gap, not fixed here:
// rate limiting on guest-pass (Task 5) is still open — treat pass_codes
// generated here as fine for internal/test-guest use, not a real wedding's
// full list, until that lands.
//
// Wave 5 — design is no longer fixed to Toran. Stored in
// event_invite_content.template_id (reused, not a new column — it already
// existed with exactly this shape: text, not null, default 'toran'), read
// through inviteThemes.js so nothing here hardcodes a design's colours.
export default function ToranInvites({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && windowWidth >= DESKTOP_BREAKPOINT;
  const { event } = useEventContext(eventId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // Wave 7 — starts unset (not DEFAULT_DESIGN) so a celebratory event with
  // no real suggestion (any of the six new wedding traditions, or any
  // non-wedding type) never silently pre-selects Toran. See the two
  // effects below for how it does get set.
  const [design, setDesign] = useState(null);
  const [partner1, setPartner1] = useState('');
  const [partner2, setPartner2] = useState('');
  const [hostedBy, setHostedBy] = useState('');
  const [couplePhotoUrl, setCouplePhotoUrl] = useState(null);
  const [coupleQuote, setCoupleQuote] = useState('');
  const [subjectNameLine1, setSubjectNameLine1] = useState('');
  const [subjectNameLine2, setSubjectNameLine2] = useState('');
  const [subjectYears, setSubjectYears] = useState('');
  const [detailLine1, setDetailLine1] = useState('');
  const [detailLine2, setDetailLine2] = useState('');
  const [kickerText, setKickerText] = useState(''); // Wave 8 — Ivory; Wave 10 — also Diya
  const [headlineText, setHeadlineText] = useState(''); // Wave 10 — Diya only
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [contentSaved, setContentSaved] = useState(false);
  const [guests, setGuests] = useState([]);
  const [passes, setPasses] = useState([]);
  const cardRef = useRef(null);

  // Wave 6 (Stillness) — Task 1's gating decision (Option A, restricted):
  // an event already marked non-celebratory only ever gets Stillness
  // offered; a celebratory (or unknown/null slug, which isCelebratory()
  // already treats as celebratory) event only ever gets Toran/Kalamkari.
  // Never a combined list — the risk this exists to prevent is a grieving
  // family seeing a picker with a party theme sitting next to a memorial.
  const celebratory = isCelebratory(event?.event_type_slug);
  const allowedDesigns = celebratory ? CELEBRATORY_DESIGNS : SOLEMN_DESIGNS;

  // Corrects an already-chosen design that's no longer valid for this
  // event's allowed set (e.g. saved as Toran, event type later edited to
  // something solemn). Only acts once a design is actually chosen —
  // doesn't run against the null "nothing picked yet" state, which the
  // suggestion effect below owns.
  useEffect(() => {
    if (!event || !design) return;
    if (!allowedDesigns.includes(design)) setDesign(allowedDesigns[0]);
  }, [event?.event_type_slug, design]);

  // Wave 7, Task 3 — suggestion, not a default. Only fires for a fresh
  // invite (nothing explicitly chosen yet, no saved content loaded).
  // Solemn events auto-select Stillness (the only option — nothing to
  // withhold when there's no real choice). DESIGN_SUGGESTIONS covers the
  // one real case (Hindu wedding -> Toran). Everything else stays
  // unselected — the picker shows a neutral "no suggestion" state instead
  // of silently landing on a Hindu-coded design for a Nikah or any other
  // event type nothing here leans toward.
  useEffect(() => {
    if (!event || design || contentSaved) return;
    if (allowedDesigns.length === 1) { setDesign(allowedDesigns[0]); return; }
    const suggested = DESIGN_SUGGESTIONS[event.event_type_slug];
    if (suggested && allowedDesigns.includes(suggested)) setDesign(suggested);
  }, [event?.event_type_slug, design, contentSaved, allowedDesigns.length]);

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const { data: contentRow } = await supabase
        .from('event_invite_content')
        .select('template_id, partner_1_name, partner_2_name, hosted_by, couple_photo_url, couple_quote, subject_name_line1, subject_name_line2, subject_years, detail_line1, detail_line2, kicker_text, headline_text')
        .eq('event_id', eventId)
        .maybeSingle();

      if (contentRow) {
        setDesign(contentRow.template_id || DEFAULT_DESIGN);
        setPartner1(contentRow.partner_1_name || '');
        setPartner2(contentRow.partner_2_name || '');
        setHostedBy(contentRow.hosted_by || '');
        setCouplePhotoUrl(contentRow.couple_photo_url || null);
        setCoupleQuote(contentRow.couple_quote || '');
        setSubjectNameLine1(contentRow.subject_name_line1 || '');
        setSubjectNameLine2(contentRow.subject_name_line2 || '');
        setSubjectYears(contentRow.subject_years || '');
        setDetailLine1(contentRow.detail_line1 || '');
        setDetailLine2(contentRow.detail_line2 || '');
        setKickerText(contentRow.kicker_text || '');
        setHeadlineText(contentRow.headline_text || '');
        setContentSaved(true);
      } else if (user && isCelebratory(event?.event_type_slug)) {
        // Pre-fill from the one place this codebase already remembers a
        // host's name for invite purposes (the old designer's saved prefs)
        // — not a guess from free-text event data. Skipped for solemn
        // events: there's no "partner 1" to prefill for a memorial.
        const { data: userRow } = await supabase
          .from('users').select('invite_preferences').eq('id', user.id).maybeSingle();
        const hostName = userRow?.invite_preferences?.hostName;
        if (hostName) setPartner1(hostName);
      }

      const { data: guestRows, error: guestErr } = await supabase
        .from('event_invitees')
        .select('id, name, plus_ones, entry_type, household_size')
        .eq('event_id', eventId)
        .neq('rsvp_status', 'no');
      if (guestErr) throw guestErr;

      const { data: passRows, error: passErr } = await supabase
        .from('guest_passes').select('id, guest_id, pass_code').eq('event_id', eventId);
      if (passErr) throw passErr;

      setGuests(guestRows || []);
      setPasses(passRows || []);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveContent() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaving(true);
    try {
      // Only the active design's field set is ever written with real
      // values — the other set is explicitly nulled rather than left
      // stale, so switching designs never leaves orphaned data behind
      // (e.g. old partner names surviving under a Stillness invite).
      const isStillness = design === 'stillness';
      const isIvory = design === 'ivory';
      // Wave 10 — Diya has no couple either (see the reference: "Diya
      // doesn't have a couple"), same no-partner-fields shape as Stillness,
      // just still celebratory/hosted_by-bearing unlike a memorial.
      const isDiya = design === 'diya';
      const { error } = await supabase.from('event_invite_content').upsert(
        {
          event_id: eventId,
          host_id: user.id,
          template_id: design,
          partner_1_name: (isStillness || isDiya) ? null : (partner1.trim() || null),
          partner_2_name: (isStillness || isDiya) ? null : (partner2.trim() || null),
          hosted_by: isStillness ? null : (hostedBy.trim() || null),
          couple_photo_url: (isStillness || isDiya) ? null : couplePhotoUrl,
          couple_quote: (isStillness || isDiya) ? null : (coupleQuote.trim() || null),
          subject_name_line1: isStillness ? (subjectNameLine1.trim() || null) : null,
          subject_name_line2: isStillness ? (subjectNameLine2.trim() || null) : null,
          subject_years: isStillness ? (subjectYears.trim() || null) : null,
          detail_line1: isStillness ? (detailLine1.trim() || null) : null,
          detail_line2: isStillness ? (detailLine2.trim() || null) : null,
          kicker_text: (isIvory || isDiya) ? (kickerText.trim() || null) : null,
          headline_text: isDiya ? (headlineText.trim() || null) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id' }
      );
      if (error) throw error;
      setContentSaved(true);
      showAlert('Saved', 'Invite details saved.');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function pickCouplePhoto() {
    if (Platform.OS === 'web') {
      showAlert('Use the mobile app', 'Uploading a couple photo works in the Utsav mobile app.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingPhoto(true);
    try {
      const { url } = await uploadToCloudinary(result.assets[0].uri);
      setCouplePhotoUrl(url);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingPhoto(false);
    }
  }

  const issuedGuestIds = new Set(passes.map((p) => p.guest_id));
  const missingGuests = guests.filter((g) => !issuedGuestIds.has(g.id));
  const readyGuests = guests.filter((g) => issuedGuestIds.has(g.id));

  async function prepareInvites() {
    if (missingGuests.length === 0) return;
    setPreparing(true);
    try {
      const existingCodes = passes.map((p) => p.pass_code);
      const baseRows = missingGuests.map((guest) => ({
        event_id: eventId,
        guest_id: guest.id,
        party_size: resolveGuestPartySize(guest),
      }));
      const { rows, error } = await insertGuestPassesWithRetry(supabase, baseRows, existingCodes);
      if (error) throw error;
      showAlert('Invites prepared', `${rows.length} invite link${rows.length === 1 ? '' : 's'} ready to send.`);
      await load();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setPreparing(false);
    }
  }

  async function sendInvite(guest) {
    const pass = passes.find((p) => p.guest_id === guest.id);
    if (!pass) return;
    // Bare theutsavapp.com — the marketing site's own domain, where Task 3's
    // page actually lives. Deliberately NOT config.js's PUBLIC_WEB_URL,
    // which points at app.theutsavapp.com (the Expo web export) — a
    // different deployment entirely with no /invite/[code] route at all.
    const link = `https://theutsavapp.com/invite/${pass.pass_code}`;
    // Stillness gets its own, non-celebratory wording — no "invited",
    // no "celebration". Names the subject when known rather than staying
    // fully generic, matching the reference's dignified-but-specific tone.
    const message = design === 'stillness'
      ? `Hi ${guest.name}. Sharing the details${subjectNameLine1 ? ` for ${subjectNameLine1}${subjectNameLine2 ? ` ${subjectNameLine2}` : ''}` : ''}: ${link}`
      : `Hi ${guest.name}! You're invited${partner1 ? ` to ${partner1}${partner2 ? ` & ${partner2}` : ''}'s celebration` : ''}. Open your invite: ${link}`;

    if (Platform.OS !== 'web' && NativeShare && ViewShot && cardRef.current) {
      try {
        // The complete invitation — name/date/venue — must reach a guest
        // who never taps the link, same guarantee the old 40-template
        // system already gives (this was Wave 1's gap: text-only share).
        const uri = await cardRef.current.capture();
        await NativeShare.open({ url: uri, message, failOnCancel: false });
      } catch (err) {
        if (!err?.message?.includes('User did not share')) showAlert('Error', err.message);
      }
    } else {
      await Clipboard.setStringAsync(message);
      showAlert('Copied', "Invite message copied — paste it wherever you'd like to send it.");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Invite designer" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  // Wave 13 — desktop shell + the new form-plus-live-preview pattern. Same
  // "everything above runs unchanged, only the returned JSX branches" shape
  // as every other desktop screen this wave. Per-function design
  // assignment (GuestList.js's Functions modal) is deliberately not
  // duplicated here — see InviteDesignerDesktop.js's own comment.
  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="invites" event={event} navigation={navigation}>
        <InviteDesignerDesktop
          design={design} setDesign={setDesign} allowedDesigns={allowedDesigns} celebratory={celebratory} designLabels={DESIGN_LABELS}
          partner1={partner1} setPartner1={setPartner1} partner2={partner2} setPartner2={setPartner2}
          hostedBy={hostedBy} setHostedBy={setHostedBy}
          couplePhotoUrl={couplePhotoUrl} pickCouplePhoto={pickCouplePhoto} uploadingPhoto={uploadingPhoto}
          coupleQuote={coupleQuote} setCoupleQuote={setCoupleQuote}
          subjectNameLine1={subjectNameLine1} setSubjectNameLine1={setSubjectNameLine1}
          subjectNameLine2={subjectNameLine2} setSubjectNameLine2={setSubjectNameLine2}
          subjectYears={subjectYears} setSubjectYears={setSubjectYears}
          detailLine1={detailLine1} setDetailLine1={setDetailLine1} detailLine2={detailLine2} setDetailLine2={setDetailLine2}
          kickerText={kickerText} setKickerText={setKickerText} headlineText={headlineText} setHeadlineText={setHeadlineText}
          saving={saving} saveContent={saveContent} contentSaved={contentSaved}
          eventName={event?.name} eventDate={event?.event_date} venue={event?.venue}
        />
      </DesktopEventShell>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Invite designer" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <FlatList
        data={readyGuests}
        keyExtractor={(g) => g.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <>
            <View style={s.designRow}>
              {allowedDesigns.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={design === key ? s.designChipActive : s.designChip}
                  onPress={() => setDesign(key)}
                >
                  <Text style={design === key ? s.designChipActiveText : s.designChipText}>
                    {DESIGN_LABELS[key]}
                  </Text>
                </TouchableOpacity>
              ))}
              {!celebratory && (
                <Text style={s.designNote}>Restricted to Stillness for this event type</Text>
              )}
              {celebratory && !design && (
                <Text style={s.designNote}>No suggested style yet — choose the one that fits</Text>
              )}
            </View>

            {/* Doubles as the host's live preview and the capture target
                sendInvite() screenshots — same CardWrapper-via-ViewShot
                pattern GuestList.js's old designer already uses. Renders
                nothing (not a silent Toran fallback) when no design is
                chosen yet — Wave 7's "don't fake a suggestion" rule
                applies to the preview just as much as the chip row. */}
            {design && (
              <View style={s.previewWrap}>
                {Platform.OS !== 'web' && ViewShot ? (
                  <ViewShot ref={cardRef} options={{ format: 'jpg', quality: 0.92 }}>
                    {design === 'stillness' ? (
                      <StillnessCard
                        nameLine1={subjectNameLine1}
                        nameLine2={subjectNameLine2}
                        years={subjectYears}
                        detailLine1={detailLine1}
                        detailLine2={detailLine2}
                      />
                    ) : (
                      <ToranCoverCard
                        design={design}
                        eventName={event?.name}
                        eventDate={event?.event_date}
                        venue={event?.venue}
                        partner1Name={partner1}
                        partner2Name={partner2}
                        hostedBy={hostedBy}
                        kickerText={kickerText}
                        headlineText={headlineText}
                      />
                    )}
                  </ViewShot>
                ) : design === 'stillness' ? (
                  <StillnessCard
                    nameLine1={subjectNameLine1}
                    nameLine2={subjectNameLine2}
                    years={subjectYears}
                    detailLine1={detailLine1}
                    detailLine2={detailLine2}
                  />
                ) : (
                  <ToranCoverCard
                    design={design}
                    eventName={event?.name}
                    eventDate={event?.event_date}
                    venue={event?.venue}
                    partner1Name={partner1}
                    partner2Name={partner2}
                    hostedBy={hostedBy}
                    kickerText={kickerText}
                    headlineText={headlineText}
                  />
                )}
              </View>
            )}

            <View style={s.formCard}>
              {!design ? (
                <Text style={s.emptyText}>Choose a design above to continue.</Text>
              ) : design === 'stillness' ? (
                <>
                  {/* No photo upload here at all, not even optional — the
                      absence is the design, per the reference. */}
                  <Text style={s.label}>Name — line 1</Text>
                  <TextInput
                    style={s.input}
                    value={subjectNameLine1}
                    onChangeText={setSubjectNameLine1}
                    placeholder="e.g. Shri Ramesh"
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Text style={s.label}>Name — line 2 (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={subjectNameLine2}
                    onChangeText={setSubjectNameLine2}
                    placeholder="e.g. Chandra Goyal"
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Text style={s.label}>Years (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={subjectYears}
                    onChangeText={setSubjectYears}
                    placeholder="e.g. 1947 — 2026"
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Text style={s.label}>Details — line 1</Text>
                  <TextInput
                    style={s.input}
                    value={detailLine1}
                    onChangeText={setDetailLine1}
                    placeholder="e.g. Prayer meeting · 18 August, 4 PM"
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Text style={s.label}>Details — line 2 (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={detailLine2}
                    onChangeText={setDetailLine2}
                    placeholder="e.g. Venue / address"
                    placeholderTextColor={theme.textTertiary}
                  />
                </>
              ) : design === 'diya' ? (
                // Wave 10 — Diya's own branch, not the generic couple-shaped
                // one below. No couple photo, no quote, no partner names —
                // per the reference, forcing those onto a housewarming/puja/
                // festival invite would be the same mistake this project
                // already caught for every other non-wedding occasion.
                <>
                  <Text style={s.label}>Kicker text (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={kickerText}
                    onChangeText={setKickerText}
                    placeholder={`Defaults to "${(event?.name || '').toUpperCase()}"`}
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Text style={s.label}>Headline text (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={headlineText}
                    onChangeText={setHeadlineText}
                    placeholder={`Defaults to "${event?.name || ''}"`}
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Text style={s.label}>Hosted by (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={hostedBy}
                    onChangeText={setHostedBy}
                    placeholder="e.g. The Sharma family"
                    placeholderTextColor={theme.textTertiary}
                  />
                </>
              ) : (
                <>
                  {design === 'ivory' && (
                    <>
                      <Text style={s.label}>Kicker text (optional)</Text>
                      <TextInput
                        style={s.input}
                        value={kickerText}
                        onChangeText={setKickerText}
                        placeholder="e.g. YOU'RE INVITED"
                        placeholderTextColor={theme.textTertiary}
                      />
                    </>
                  )}
                  <Text style={s.label}>Couple photo (optional)</Text>
                  <TouchableOpacity style={s.photoPicker} onPress={pickCouplePhoto} disabled={uploadingPhoto}>
                    {uploadingPhoto ? (
                      <ActivityIndicator color={theme.accent} />
                    ) : couplePhotoUrl ? (
                      <Image source={{ uri: couplePhotoUrl }} style={s.photoPreview} />
                    ) : (
                      <>
                        <Camera size={20} color={theme.textSecondary} />
                        <Text style={s.photoPickerText}>Add a photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {couplePhotoUrl && !uploadingPhoto && (
                    <TouchableOpacity onPress={pickCouplePhoto}>
                      <Text style={s.photoReplaceText}>Replace photo</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={s.label}>A line in your own words (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={coupleQuote}
                    onChangeText={setCoupleQuote}
                    placeholder="e.g. Two families, one celebration"
                    placeholderTextColor={theme.textTertiary}
                  />

                  <Text style={s.label}>Partner 1 name</Text>
                  <TextInput
                    style={s.input}
                    value={partner1}
                    onChangeText={setPartner1}
                    placeholder="e.g. Aarav"
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Text style={s.label}>Partner 2 name (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={partner2}
                    onChangeText={setPartner2}
                    placeholder="e.g. Meera"
                    placeholderTextColor={theme.textTertiary}
                  />
                  <Text style={s.label}>Hosted by (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={hostedBy}
                    onChangeText={setHostedBy}
                    placeholder="e.g. The Sharma and Verma families"
                    placeholderTextColor={theme.textTertiary}
                  />
                </>
              )}
              {!!design && (
                <TouchableOpacity style={s.saveBtn} onPress={saveContent} disabled={saving}>
                  {saving ? <ActivityIndicator color={theme.btnPrimaryText} /> : (
                    <Text style={s.saveBtnText}>{contentSaved ? 'Update details' : 'Save details'}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statValue}>{readyGuests.length}</Text>
                <Text style={s.statLabel}>Ready to send</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statValue}>{missingGuests.length}</Text>
                <Text style={s.statLabel}>Not prepared yet</Text>
              </View>
            </View>

            {missingGuests.length > 0 && (
              <TouchableOpacity style={s.prepareBtn} onPress={prepareInvites} disabled={preparing}>
                {preparing ? <ActivityIndicator color={theme.btnPrimaryText} /> : (
                  <Text style={s.prepareBtnText}>
                    Prepare invites for {missingGuests.length} guest{missingGuests.length === 1 ? '' : 's'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {readyGuests.length > 0 && <Text style={s.sectionLabel}>READY TO SEND</Text>}
          </>
        }
        ListEmptyComponent={
          !loading && missingGuests.length === 0 ? (
            <Text style={s.emptyText}>No guests on this event yet.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={s.guestRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.guestName}>{item.name}</Text>
            </View>
            <TouchableOpacity style={s.sendBtn} onPress={() => sendInvite(item)}>
              <PaperPlaneTilt size={14} color={theme.accentText} weight="fill" />
              <Text style={s.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    list: { paddingHorizontal: 16, paddingBottom: 40 },

    designRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 16 },
    previewWrap: { alignItems: 'center', marginBottom: 16 },
    designChipActive: { backgroundColor: theme.accent, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6 },
    designChipActiveText: { fontSize: 13, fontWeight: '700', color: theme.accentText },
    designChip: { backgroundColor: theme.cardBg, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 0.5, borderColor: theme.border },
    designChipText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
    designNote: { fontSize: 11, color: theme.textSecondary, flexShrink: 1 },

    formCard: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 16, marginBottom: 16 },
    label: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: theme.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.text },
    photoPicker: {
      width: 96, height: 96, borderRadius: 48, backgroundColor: theme.inputBg,
      alignItems: 'center', justifyContent: 'center', alignSelf: 'center', overflow: 'hidden',
      borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed',
    },
    photoPreview: { width: 96, height: 96, borderRadius: 48 },
    photoPickerText: { fontSize: 10, color: theme.textSecondary, marginTop: 4 },
    photoReplaceText: { fontSize: 12, fontWeight: '600', color: theme.accent, textAlign: 'center', marginTop: 8 },
    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: theme.btnPrimaryText },

    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    statCard: { flex: 1, alignItems: 'center', backgroundColor: theme.cardBg, borderRadius: 14, paddingVertical: 14, borderWidth: 0.5, borderColor: theme.border },
    statValue: { fontSize: 20, fontWeight: '800', color: theme.text },
    statLabel: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },

    prepareBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
    prepareBtnText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.6, marginBottom: 8 },
    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingVertical: 30 },
    guestRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: theme.cardBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    },
    guestName: { fontSize: 14, fontWeight: '600', color: theme.text },
    sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.accent, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7 },
    sendBtnText: { fontSize: 12, fontWeight: '700', color: theme.accentText },
  });
}
