import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperPlaneTilt } from 'phosphor-react-native';
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
import InviteSchemaForm from '../../components/invite/schema/InviteSchemaForm';
import { DEFAULT_DESIGN } from '../../lib/inviteThemes';
import { getInviteSchema, isNonFestive } from '../../lib/inviteSchemas';
import { normalizeInviteContent, buildContentPatch, mapToToranCoverCardProps, mapToStillnessCardProps } from '../../lib/inviteContentAdapter';
import { buildLegacyPersonalInviteUrl } from '../../lib/inviteBrandingPolicy';
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
//
// invite-architecture wave — this list, and everything else about WHICH
// visual designs exist and which is suggested, stays entirely here (design
// selection), not in lib/inviteSchemas (content). The two are deliberately
// decoupled: switching between any of these no longer changes which
// content fields are collected — see the schema-driven form below.
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
//
// invite-architecture wave — content field state is no longer one useState
// per field. `values` (below) is a single { [fieldKey]: string } map driven
// by this event's inviteSchema (lib/inviteSchemas, keyed by
// event_type_slug, NOT by which design is picked) — see
// lib/inviteContentAdapter.js's header comment for why this is what
// actually fixes the old "switching design nulls unrelated content" bug:
// the schema (and therefore what saveContent() writes) never changes just
// because `design` does.
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
  // Raw event_invite_content row as loaded (or a synthetic partial row for
  // the one-time hostName prefill on a brand-new, never-saved invite — see
  // load()) — the single source normalizeInviteContent() reads `values`
  // from. Never mutated directly; only ever replaced wholesale by load()
  // and read from by the normalize effect below.
  const [contentRow, setContentRow] = useState(null);
  // { [fieldKey]: string } — the live, edited form state. Keys come
  // entirely from the active schema (getInviteSchema(event?.event_type_slug)
  // below), so this object's shape changes if the event's type changes,
  // but never because `design` changes.
  const [values, setValues] = useState({});
  // The schema_content JSONB this event already had saved, kept separately
  // from `values` so buildContentPatch() can merge into it (preserving any
  // key a different schema might have written) rather than starting from
  // an empty object on every save.
  const [savedSchemaContent, setSavedSchemaContent] = useState({});
  const [uploadingPhotoKey, setUploadingPhotoKey] = useState(null);
  const [contentSaved, setContentSaved] = useState(false);
  const [guests, setGuests] = useState([]);
  const [passes, setPasses] = useState([]);
  const [currentUserName, setCurrentUserName] = useState(null);
  const cardRef = useRef(null);

  const schema = getInviteSchema(event?.event_type_slug);

  // Wave 13 follow-up — desktop sidebar footer, same currentUserName role
  // GuestList.js's shell already has. This screen has no userId state of
  // its own (uses inline getUser() calls elsewhere), so fetched directly.
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

  // invite-architecture wave — re-derives `values` any time the loaded raw
  // row or the resolved schema changes (event_type_slug can arrive after
  // contentRow does, since `event` comes from a separate hook/query — this
  // effect, not load() itself, is what keeps the two in sync regardless of
  // which resolves first).
  useEffect(() => {
    setValues(normalizeInviteContent(schema, contentRow));
    setSavedSchemaContent((contentRow && contentRow.schema_content) || {});
  }, [schema, contentRow]);

  // Wave 6 (Stillness) — Task 1's gating decision (Option A, restricted):
  // an event already marked non-celebratory only ever gets Stillness
  // offered; a celebratory (or unknown/null slug, which isNonFestive()
  // already treats as celebratory via its isCelebratory() fallback) event
  // only ever gets Toran/Kalamkari. Never a combined list — the risk this
  // exists to prevent is a grieving family seeing a picker with a party
  // theme sitting next to a memorial.
  const celebratory = !isNonFestive(event?.event_type_slug);
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

      const { data: row } = await supabase
        .from('event_invite_content')
        .select('template_id, partner_1_name, partner_2_name, hosted_by, couple_photo_url, couple_quote, subject_name_line1, subject_name_line2, subject_years, detail_line1, detail_line2, kicker_text, headline_text, schema_content')
        .eq('event_id', eventId)
        .maybeSingle();

      if (row) {
        setDesign(row.template_id || DEFAULT_DESIGN);
        setContentRow(row);
        setContentSaved(true);
      } else if (user && !isNonFestive(event?.event_type_slug)) {
        // Pre-fill from the one place this codebase already remembers a
        // host's name for invite purposes (the old designer's saved prefs)
        // — not a guess from free-text event data. Skipped for solemn
        // events: there's no "partner 1" to prefill for a memorial. Seeded
        // as a partial contentRow-shaped object so the normalize effect
        // above picks it up through the exact same path as a real saved
        // row, rather than a second, parallel prefill mechanism.
        const { data: userRow } = await supabase
          .from('users').select('invite_preferences').eq('id', user.id).maybeSingle();
        const hostName = userRow?.invite_preferences?.hostName;
        if (hostName) setContentRow({ partner_1_name: hostName });
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
      // buildContentPatch() only ever writes the columns/schema_content
      // keys THIS SCHEMA declares — a field the active schema doesn't
      // include is simply never touched (see that function's own comment).
      // Since the schema is resolved from event_type_slug, not `design`,
      // this patch is identical no matter which of the allowed designs is
      // currently selected — switching designs and saving again can no
      // longer null anything out.
      const patch = buildContentPatch(schema, values, savedSchemaContent);
      const { error } = await supabase.from('event_invite_content').upsert(
        {
          event_id: eventId,
          host_id: user.id,
          template_id: design,
          ...patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id' }
      );
      if (error) throw error;
      setSavedSchemaContent(patch.schema_content);
      setContentSaved(true);
      showAlert('Saved', 'Invite details saved.');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleFieldChange(fieldKey, value) {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
  }

  async function pickPhoto(fieldKey) {
    if (Platform.OS === 'web') {
      showAlert('Use the mobile app', 'Uploading a photo works in the Utsav mobile app.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingPhotoKey(fieldKey);
    try {
      const { url } = await uploadToCloudinary(result.assets[0].uri);
      setValues((prev) => ({ ...prev, [fieldKey]: url }));
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingPhotoKey(null);
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
    // Deliberately still the marketing site's own domain, where the real
    // /invite/[code] page lives — not config.js's PUBLIC_WEB_URL. Now
    // built via lib/inviteBrandingPolicy.js's buildLegacyPersonalInviteUrl()
    // instead of an inline template string — byte-identical output, no
    // link/domain change this wave.
    const link = buildLegacyPersonalInviteUrl(pass.pass_code);
    // Stillness gets its own, non-celebratory wording — no "invited",
    // no "celebration". Names the subject when known rather than staying
    // fully generic, matching the reference's dignified-but-specific tone.
    const message = design === 'stillness'
      ? `Hi ${guest.name}. Sharing the details${values.subjectNameLine1 ? ` for ${values.subjectNameLine1}${values.subjectNameLine2 ? ` ${values.subjectNameLine2}` : ''}` : ''}: ${link}`
      : `Hi ${guest.name}! You're invited${values.partner1Name ? ` to ${values.partner1Name}${values.partner2Name ? ` & ${values.partner2Name}` : ''}'s celebration` : ''}. Open your invite: ${link}`;

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
  // guests here excludes declined guests (this screen's own load() query
  // filters .neq('rsvp_status','no'), for its "ready to send" list) — a
  // real, non-fabricated count, just not identical in definition to
  // GuestList.js's total invited. Real decision: kept as-is rather than
  // switched to match the other screens, but labeled "receiving" instead
  // of the shell's default "invited" — the two numbers are allowed to
  // differ, they just can't both silently claim to mean the same thing.
  if (isDesktopWeb) {
    return (
      <DesktopEventShell activeItem="invites" event={event} guestCount={guests.length} guestCountLabel="receiving" currentUserName={currentUserName} navigation={navigation}>
        <InviteDesignerDesktop
          design={design} setDesign={setDesign} allowedDesigns={allowedDesigns} celebratory={celebratory} designLabels={DESIGN_LABELS}
          schema={schema} values={values} onFieldChange={handleFieldChange} onPickPhoto={pickPhoto} photoUploadingKey={uploadingPhotoKey}
          saving={saving} saveContent={saveContent} contentSaved={contentSaved}
          event={event}
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
                applies to the preview just as much as the chip row. Card
                props now come entirely from lib/inviteContentAdapter.js's
                mapping functions — ToranCoverCard/StillnessCard themselves
                are unchanged. */}
            {design && (
              <View style={s.previewWrap}>
                {Platform.OS !== 'web' && ViewShot ? (
                  <ViewShot ref={cardRef} options={{ format: 'jpg', quality: 0.92 }}>
                    {design === 'stillness' ? (
                      <StillnessCard {...mapToStillnessCardProps(values)} />
                    ) : (
                      <ToranCoverCard {...mapToToranCoverCardProps(design, values, event)} />
                    )}
                  </ViewShot>
                ) : design === 'stillness' ? (
                  <StillnessCard {...mapToStillnessCardProps(values)} />
                ) : (
                  <ToranCoverCard {...mapToToranCoverCardProps(design, values, event)} />
                )}
              </View>
            )}

            <View style={s.formCard}>
              {!design ? (
                <Text style={s.emptyText}>Choose a design above to continue.</Text>
              ) : (
                <InviteSchemaForm
                  theme={theme}
                  schema={schema}
                  values={values}
                  onFieldChange={handleFieldChange}
                  onPickPhoto={pickPhoto}
                  photoUploadingKey={uploadingPhotoKey}
                />
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
