import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { useEventContext } from '../../hooks/useEventContext';
import AppHeader from '../../components/AppHeader';
import StaticInviteCard from '../../components/inviteArchetypes/StaticInviteCard';
import WebInvitePreview from '../../components/inviteArchetypes/WebInvitePreview';
import { getInviteSchema, isNonFestive } from '../../lib/inviteSchemas';
import { normalizeInviteContent } from '../../lib/inviteContentAdapter';
import { getArchetype, getVariant, getVariantsForArchetype, resolveMotionForEvent } from '../../lib/inviteDesignArchetypes';
import { getSelectableArchetypes } from '../../lib/inviteDesignCompatibilityMatrix';
import { getCatalogueEntry } from '../../lib/inviteDesignArchetypes/catalogue';
import { COMPATIBILITY_LEVEL } from '../../lib/inviteDesignArchetypes/types';
import { resolveScenes } from '../../lib/inviteSceneResolver';
import { resolveUtilityNavFromScenes } from '../../lib/inviteUtilityNav';
import { buildStaticLayoutModel, buildPdfPageModels, buildPdfHtml } from '../../lib/staticInviteLayout';
import { resolveBrandAttribution, resolveAcquisitionCta, buildLegacyPersonalInviteUrl } from '../../lib/inviteBrandingPolicy';
import { resolveThemePackForPartyTheme, listThemePacks } from '../../lib/inviteDesignArchetypes/themePacks';
// Production Integration Wave — this screen's own copies of these
// constants/helpers (PROFESSIONAL_EVENT_SLUGS through
// participationIncludes) moved to lib/invitePresentationModel.js so the
// real production renderer bridge (components/invite/ProductionInviteCard.js)
// can share the exact same logic instead of this dev-only screen being a
// production dependency. Every call site below is unchanged — only the
// definitions moved.
import {
  PROFESSIONAL_EVENT_SLUGS, TICKETED_EVENT_SLUGS, NAV_BOOST_BY_EVENT_TYPE, NON_FAMILY_TONE_EVENT_SLUGS,
  ceremoniesToFunctionRows, resolveInvocationText, resolveDressGuidance, resolvePrimaryVenue,
  buildStoryText, participationIncludes,
} from '../../lib/invitePresentationModel';

// Development-only pilot screen — proves the design-archetype architecture
// (registry, density/compatibility/scene/nav resolvers, static+web+PDF
// rendering, mandatory branding) against one real event, entirely
// SEPARATE from the production invite designer (ToranInvites.js, still
// completely unchanged). No archetype/variant selection made here is ever
// written to event_invite_content, and switching designs never mutates
// `values` — the same fetched content is simply re-rendered through a
// different archetype/variant. Reached via a dedicated nav route, not
// linked from the main "Invites" tool — see ToranInvites.js's own small
// "Preview new designs (beta)" entry point.
//
// Production Batch 1 — the selector now goes through
// getSelectableArchetypes() (lib/inviteDesignCompatibilityMatrix.js), the
// one production-safe picker function: it only ever returns IMPLEMENTED,
// non-unsupported designs, grouped here into "Recommended" (a strong
// match) and "More styles" (still fully workable, just not the top pick)
// — a host never sees a 'planned' archetype, a density number, or any
// other resolver-internal vocabulary; only a name and a short style
// descriptor drawn from the archetype's own `tones`.
export default function InviteArchetypePilot({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { event } = useEventContext(eventId);

  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [values, setValues] = useState({});
  const [functions, setFunctions] = useState([]);
  const [hasTravelInfo, setHasTravelInfo] = useState(false);
  const [hasAccommodationInfo, setHasAccommodationInfo] = useState(false);
  const [qrTargetUrl, setQrTargetUrl] = useState(null);
  const [passCode, setPassCode] = useState(null);
  const [archetypeId, setArchetypeId] = useState(null);
  const [variantId, setVariantId] = useState(null);
  const [themePackOverrideId, setThemePackOverrideId] = useState(null);
  const [previewMode, setPreviewMode] = useState('static'); // 'static' | 'web'

  const eventTypeSlug = event?.event_type_slug || null;
  const schema = getInviteSchema(eventTypeSlug);
  const nonFestive = isNonFestive(eventTypeSlug);
  const isKidsBirthday = eventTypeSlug === 'kids-birthday';

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    try {
      setLoading(true);
      const { data: contentRow } = await supabase
        .from('event_invite_content')
        .select('partner_1_name, partner_2_name, hosted_by, couple_photo_url, couple_quote, kicker_text, headline_text, schema_content')
        .eq('event_id', eventId)
        .maybeSingle();
      setValues(normalizeInviteContent(schema, contentRow));

      const { data: functionRows } = await supabase
        .from('event_functions').select('id, name, date, time').eq('event_id', eventId).order('sort_order', { ascending: true });
      setFunctions(functionRows || []);

      // Structural density signals — read-only, never duplicated locally
      // beyond this screen's own preview state.
      const { count: outstationCount } = await supabase
        .from('event_invitees').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('is_outstation', true);
      setHasTravelInfo((outstationCount || 0) > 0);

      const { count: accommodationCount } = await supabase
        .from('event_accommodations').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
      setHasAccommodationInfo((accommodationCount || 0) > 0);

      const { data: passRow } = await supabase
        .from('guest_passes').select('pass_code').eq('event_id', eventId).limit(1).maybeSingle();
      if (passRow?.pass_code) {
        setQrTargetUrl(buildLegacyPersonalInviteUrl(passRow.pass_code));
        setPassCode(passRow.pass_code);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Design pilot (beta)" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const densitySignals = { functionCount: functions.length, hasTravelInfo, hasAccommodationInfo };
  const selectable = getSelectableArchetypes({ eventTypeSlug, schema, values, densitySignals, isNonFestive: nonFestive });

  if (selectable.length === 0) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Design pilot (beta)" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <View style={{ padding: 24 }}>
          <Text style={s.emptyText}>
            No finished design is offered for this event's type yet ({eventTypeSlug || 'unknown'}) — more directions
            are still being built out.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const recommended = selectable.filter((r) => r.level === COMPATIBILITY_LEVEL.STRONG);
  const moreStyles = selectable.filter((r) => r.level !== COMPATIBILITY_LEVEL.STRONG);
  const activeArchetypeId = archetypeId && selectable.some((r) => r.archetypeId === archetypeId) ? archetypeId : selectable[0].archetypeId;
  const archetype = getArchetype(activeArchetypeId);
  const variants = getVariantsForArchetype(archetype.id);
  const activeVariant = getVariant(variantId) || variants.find((v) => v.archetypeId === archetype.id) || variants[0];
  const motion = resolveMotionForEvent({ archetypeId: archetype.id, isNonFestive: nonFestive, preferredPreset: archetype.motionPresets[0] });

  // Theme-pack resolution (kids-birthday only) — a host chip override if
  // picked in this preview, otherwise derived straight from the event's
  // own free-text partyTheme. Purely decorative: it nudges the accent
  // colour and swaps the decoration motif, never the archetype/variant
  // chosen above, and never a new field written anywhere.
  const themePack = isKidsBirthday
    ? (themePackOverrideId ? listThemePacks().find((p) => p.id === themePackOverrideId) : resolveThemePackForPartyTheme(values.partyTheme))
    : null;

  const isProfessionalEvent = PROFESSIONAL_EVENT_SLUGS.includes(eventTypeSlug);
  const isTicketedEvent = TICKETED_EVENT_SLUGS.includes(eventTypeSlug);
  // Batch 3 — wellness-retreat's bookingInfoNote is the same "Book/Register
  // instead of RSVP" semantic action as corporate/product's registrationInfo.
  // Batch 4 — exhibition always Registers (no ticket fields exist on its
  // schema); sports-event Registers only in a participant-facing mode
  // (registrationInfo is meant for entrants, not spectators).
  const registrationText = isProfessionalEvent ? values.registrationInfo
    : eventTypeSlug === 'wellness-retreat' ? values.bookingInfoNote
    : eventTypeSlug === 'exhibition' ? values.registrationInfo
    : (eventTypeSlug === 'sports-event' && participationIncludes(values.participationMode, 'participant')) ? values.registrationInfo
    : null;
  // Ticket content — concert is the only schema with real ticket-URL/tier
  // fields; festival-fair and sports-event (spectator mode) only ever
  // have a plain entryFeeNote, which TicketCard shows gracefully with no
  // button (including a simple "Free Entry" case). Never shown alongside
  // Registration for the SAME audience — sports-event's "both" mode is
  // the one case where both legitimately appear, for two different
  // audiences (entrants vs. spectators), not a redundant duplicate.
  const ticketUrl = eventTypeSlug === 'concert' ? (values.websiteOrTicketUrl || null) : null;
  const tierNote = eventTypeSlug === 'concert' ? (values.ticketTiersNote || null) : null;
  const entryNote = eventTypeSlug === 'festival-fair' ? values.entryFeeNote
    : (eventTypeSlug === 'sports-event' && participationIncludes(values.participationMode, 'spectator')) ? values.entryFeeNote
    : null;
  const storyText = buildStoryText(eventTypeSlug, values);
  const addressDetail = [values.houseName, values.towerBlock, values.landmark].filter(Boolean).join(', ') || null;
  const gatePassNote = [values.gateEntryNote, values.parkingNote].filter(Boolean).join('  ') || null;
  // Batch 5 — see resolveInvocationText/resolveDressGuidance/
  // resolvePrimaryVenue's own header comments above.
  const invocationText = resolveInvocationText(eventTypeSlug, values);
  const dressGuidance = resolveDressGuidance(eventTypeSlug, values);
  const primaryVenue = resolvePrimaryVenue(eventTypeSlug, values, event);
  // interfaith-wedding's ceremonies are additional schedule rows, not a
  // replacement for any real event_functions the host also added —
  // ceremonies first (core to the event), canonical functions after.
  const effectiveFunctions = eventTypeSlug === 'interfaith-wedding'
    ? [...ceremoniesToFunctionRows(values.interfaithCeremonies), ...functions]
    : functions;

  const scenes = resolveScenes({
    archetype,
    hasInvocationContent: !!invocationText,
    hasCoupleOrSubjectContent: !!(values.partner1Name || values.subjectNameLine1),
    hasFamilyContent: !!(values.hostedBy || values.organiserName || values.parentsNote || values.grandparentsNote || values.familySurname || values.fatherToBeNote || values.family1Note || values.family2Note),
    hasHonoureeContent: !!(values.childName || values.celebrantName || values.babyName || values.productName || values.facilitatorName || values.honoureesNote),
    hasDressCodeContent: !!dressGuidance,
    hasStoryContent: !!storyText,
    functionCount: effectiveFunctions.length,
    hasVenue: !!primaryVenue,
    hasTravelInfo, hasAccommodationInfo,
    gatePassActive: !!passCode,
    galleryPhotoCount: 0,
    wishingWallActive: false,
    hasRegistrationContent: !!registrationText,
    // No canonical structured speaker data source exists yet (only a
    // free-text speakersNote/artistNamesNote field, folded into storyText
    // above instead of being fabricated into fake individual speaker/
    // artist cards) — see the completion report. SpeakersScene stays
    // built/wired and will activate the moment real structured data exists.
    hasSpeakerContent: false,
    hasRsvpContent: !isProfessionalEvent && !isTicketedEvent,
    hasTransportContent: !!(values.meetingPoint || values.departureTime || values.returnTime),
    hasContactContent: !!values.contactInfo,
    hasTicketContent: !!(ticketUrl || tierNote || entryNote),
  });

  // Carry-forward fix — switched from the old boolean/hardcoded-array
  // resolveUtilityNav() to the semantic, lifecycle-priority-driven
  // resolveUtilityNavFromScenes() (already built in the Design System
  // Scaling Foundation wave, never actually adopted by this screen until
  // now). This is what lets Gate/Location rank appropriately per event
  // instead of always defaulting to a fixed [Functions, Travel, Stay,
  // RSVP] order that had no way to ever surface them. Batch 4 —
  // boostedSceneIds lets each event type's own canonical action (Tickets
  // for a concert, Register for an exhibition, ...) rank above the
  // generic lifecycle table without a hardcoded per-slug array inside the
  // resolver itself.
  const navItems = resolveUtilityNavFromScenes(scenes, { maxPrimary: 5, boostedSceneIds: NAV_BOOST_BY_EVENT_TYPE[eventTypeSlug] || [] });

  const attribution = resolveBrandAttribution({ isNonFestive: nonFestive, surface: 'web' });
  const staticAttribution = resolveBrandAttribution({ isNonFestive: nonFestive, surface: 'static' });
  const acquisition = resolveAcquisitionCta({ isNonFestive: nonFestive });

  // Visual QA pass fix: kids-birthday/mundan/naming-ceremony/funeral schemas
  // store their hero photo under subjectPhotoUrl, NOT couplePhotoUrl (see
  // lib/inviteSchemas/fields.js) — the couplePhotoUrl-only fallback here
  // meant a child's photo silently never appeared on any kids-birthday
  // design. Both are checked; a schema only ever populates one of them.
  // Batch 5 fix: values.heroPhotoUrl (exhibition/concert/festival-fair/
  // sports-event's own generic hero field, and now other's) was already
  // wired into Batch 4's temporary QA harness but never actually made it
  // into this real screen — a real, previously-undetected gap where the
  // production pilot never showed those 5 event types' host-supplied
  // photos at all, only the deleted harness did.
  const heroPhotoUrl = values.couplePhotoUrl || values.subjectPhotoUrl || values.heroPhotoUrl || null;

  // Batch 5 — a gurdwaraAddress/churchAddress override folds into the
  // SAME event object staticInviteLayout.js already reads event.venue
  // from, so the more specific ceremony venue wins on both static and PDF
  // output without needing a new buildStaticLayoutModel param. Similarly,
  // each tradition's own religious-content fields are folded into the
  // SAME values.invocationText the SYMBOL slot already reads — see
  // resolveInvocationText's header comment.
  const effectiveEvent = { ...event, venue: primaryVenue };
  const effectiveValues = { ...values, invocationText };

  const staticLayoutModel = buildStaticLayoutModel({
    archetypeId: archetype.id, variantId: activeVariant.id, event: effectiveEvent, values: effectiveValues, isNonFestive: nonFestive, qrTargetUrl, photoUrl: heroPhotoUrl, eventTypeSlug,
  });
  // Theme-pack motif swap — subordinate to the selected archetype/variant,
  // applied only as a final decorative touch on top of the real layout
  // model, never a separate rendering path.
  const effectiveStaticLayoutModel = themePack
    ? { ...staticLayoutModel, slots: { ...staticLayoutModel.slots, decoration: { motif: themePack.motifId, icon: themePack.icons?.[0] || null } } }
    : staticLayoutModel;
  const effectiveTokens = themePack?.accentOverride
    ? { ...activeVariant.tokens, colors: { ...activeVariant.tokens.colors, accent: themePack.accentOverride } }
    : activeVariant.tokens;

  const pdfModel = buildPdfPageModels({
    staticLayoutModel: effectiveStaticLayoutModel,
    functions: effectiveFunctions,
    travelNote: hasTravelInfo ? 'Outstation guest travel details collected — see Guest List for the full list.' : null,
    stayNote: hasAccommodationInfo ? 'Accommodation blocks arranged — see Guest List for room assignments.' : null,
  });

  async function handleDownloadPdf() {
    try {
      setGeneratingPdf(true);
      const html = buildPdfHtml({ pdfPageModels: pdfModel, tokens: effectiveTokens });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Invite PDF', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Saved', 'Invite PDF created.');
      }
    } catch (err) {
      showAlert('Error', err.message || 'Could not generate the PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  function renderArchetypeGroup(label, entries) {
    if (entries.length === 0) return null;
    return (
      <>
        <Text style={s.sectionLabel}>{label}</Text>
        <View style={s.chipRow}>
          {entries.map(({ archetypeId: id }) => {
            const a = getArchetype(id);
            const active = a.id === activeArchetypeId;
            const descriptor = (getCatalogueEntry(id)?.tones || []).slice(0, 2).join(' · ');
            return (
              <TouchableOpacity
                key={a.id}
                style={active ? s.chipActive : s.chip}
                onPress={() => { setArchetypeId(a.id); setVariantId(a.variantIds[0]); }}
              >
                <Text style={active ? s.chipTextActive : s.chipText}>{a.name}</Text>
                {descriptor ? <Text style={active ? s.chipDescriptorActive : s.chipDescriptor}>{descriptor}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Design pilot (beta)" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.introText}>Browse styles for this invite — nothing here is saved until you pick one for real.</Text>

        {renderArchetypeGroup('RECOMMENDED', recommended)}
        {renderArchetypeGroup('MORE STYLES', moreStyles)}

        {variants.length > 1 && (
          <>
            <Text style={s.sectionLabel}>VARIANT</Text>
            <View style={s.chipRow}>
              {variants.map((v) => (
                <TouchableOpacity key={v.id} style={activeVariant.id === v.id ? s.chipActive : s.chip} onPress={() => setVariantId(v.id)}>
                  <Text style={activeVariant.id === v.id ? s.chipTextActive : s.chipText}>{v.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {isKidsBirthday && (
          <>
            <Text style={s.sectionLabel}>THEME</Text>
            <View style={s.chipRow}>
              {listThemePacks().map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={themePack?.id === p.id ? s.chipActive : s.chip}
                  onPress={() => setThemePackOverrideId(p.id)}
                >
                  <Text style={themePack?.id === p.id ? s.chipTextActive : s.chipText}>{p.icons[0]} {p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={s.previewToggleRow}>
          <TouchableOpacity style={previewMode === 'static' ? s.toggleActive : s.toggle} onPress={() => setPreviewMode('static')}>
            <Text style={previewMode === 'static' ? s.toggleTextActive : s.toggleText}>Static (WhatsApp)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={previewMode === 'web' ? s.toggleActive : s.toggle} onPress={() => setPreviewMode('web')}>
            <Text style={previewMode === 'web' ? s.toggleTextActive : s.toggleText}>Web experience</Text>
          </TouchableOpacity>
        </View>

        {previewMode === 'static' ? (
          <View style={s.staticPreviewWrap}>
            <StaticInviteCard layoutModel={effectiveStaticLayoutModel} tokens={effectiveTokens} />
            <TouchableOpacity style={s.pdfBtn} onPress={handleDownloadPdf} disabled={generatingPdf}>
              {generatingPdf ? <ActivityIndicator size="small" color={theme.accentText} /> : (
                <Text style={s.pdfBtnText}>Download PDF ({pdfModel.pages.length} page{pdfModel.pages.length === 1 ? '' : 's'})</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.webPreviewFrame}>
            <WebInvitePreview
              tokens={effectiveTokens}
              scenes={scenes}
              navItems={navItems.items}
              content={{
                // ceremonyName (engagement) / ceremonyType (baby-shower,
                // housewarming) are each their schema's own REQUIRED
                // occasion-name field — kicker fallback so the invite
                // always says what kind of occasion it is even with no
                // custom kickerText. Batch 2 — a secret baby name/hidden
                // product name gets an intentional teaser headline
                // instead of a blank one (never leaked); mirrors
                // lib/staticInviteLayout.js's identical fallback chain so
                // static and web output never disagree.
                kicker: values.kickerText || values.ceremonyName?.toUpperCase() || values.ceremonyType?.toUpperCase() || values.ceremonyCustomName?.toUpperCase() || values.religiousEventType?.toUpperCase() || values.sportName?.toUpperCase() || values.genreNote?.toUpperCase() || 'YOU ARE INVITED',
                headline: values.headlineText
                  || (values.nameIsSecret === true ? 'Join us as we welcome and name our little one' : null)
                  || (values.productNameHidden === true ? (values.tagline || 'Something big is coming') : null)
                  || event?.name,
                subline: primaryVenue,
                invocationText,
                partner1Name: values.partner1Name, partner2Name: values.partner2Name,
                couplePhotoUrl: heroPhotoUrl, coupleQuote: values.coupleQuote,
                hostedBy: values.hostedBy || values.organiserName, parentsNote: values.parentsNote, grandparentsNote: values.grandparentsNote, familySurname: values.familySurname,
                fatherToBeNote: values.fatherToBeNote, family1Note: values.family1Note, family2Note: values.family2Note,
                familyKickerLabel: NON_FAMILY_TONE_EVENT_SLUGS.includes(eventTypeSlug) ? 'HOSTED BY' : undefined,
                // babyName/productName are already suppressed upstream by
                // lib/inviteContentAdapter.js's applyConditionalSuppression
                // whenever nameIsSecret/productNameHidden is true — safe
                // to read directly here, same as every other field.
                // Batch 5 — honoureesNote (other's own plain-text honouree
                // list) sits at the end of this chain so it never
                // overrides any event type that already has a real named
                // honouree.
                honoureeName: values.childName || values.celebrantName || values.babyName || values.productName || values.facilitatorName || values.subjectNameLine1 || values.honoureesNote,
                // Launch-readiness audit fix — adult-birthday's own age
                // field is milestoneAge, not kids-birthday's turningAge (a
                // different key); milestoneAge was declared on the schema
                // but never read anywhere, so an adult-birthday invite
                // never showed the age being celebrated at all.
                honoureeAgeLine: values.turningAge ? `Turning ${values.turningAge}` : (values.milestoneAge ? `Turning ${values.milestoneAge}` : null),
                honoureePhotoUrl: heroPhotoUrl,
                dressCode: dressGuidance,
                functions: effectiveFunctions, functionsTitle: isProfessionalEvent ? 'Agenda'
                  : eventTypeSlug === 'sports-event' ? 'Fixtures'
                  : eventTypeSlug === 'concert' ? 'Schedule'
                  : eventTypeSlug === 'interfaith-wedding' ? 'Ceremonies'
                  : ['baby-shower', 'housewarming', 'naming-ceremony', 'exhibition', 'festival-fair', 'team-offsite', 'wellness-retreat'].includes(eventTypeSlug) ? 'Programme'
                  : undefined,
                storyText,
                venue: primaryVenue, addressDetail,
                travelNote: hasTravelInfo ? 'Outstation guest details available — see Guest List.' : null,
                stayNote: hasAccommodationInfo ? 'Accommodation arranged — see Guest List.' : null,
                guestAccessNote: (archetype.supports.gatePass && !passCode) ? 'Show your gate pass at the entrance.' : null,
                gatePassCode: archetype.supports.gatePass ? passCode : null,
                gatePassNote,
                onGatePassPress: () => navigation.navigate('GatePass', { eventId }),
                speakers: [],
                registrationNote: registrationText,
                registrationUrl: isTicketedEvent ? null : (values.websiteOrTicketUrl || null),
                onRegisterPress: registrationText ? () => showAlert('Registration', 'This preview does not submit a real registration.') : undefined,
                entryNote, tierNote, ticketUrl,
                // No button for an entry-note-only case (e.g. plain "Free
                // entry" text) — there's genuinely nothing to tap; a
                // button only appears when there's a real ticket URL or
                // paid tiers implying an actual purchase flow exists.
                onTicketPress: (ticketUrl || tierNote) ? () => showAlert('Tickets', 'This preview does not submit a real ticket purchase.') : undefined,
                meetingPoint: values.meetingPoint, departureTime: values.departureTime, returnTime: values.returnTime,
                contactInfo: values.contactInfo,
                galleryPhotoCount: 0, wishes: [],
                isNonFestive: nonFestive,
                rsvpStatus: null, onRsvpPress: () => showAlert('RSVP', 'This preview does not submit a real RSVP — the real flow stays screens/RSVPScreen.js, unchanged.'),
                attributionLine: attribution.line, acquisition,
              }}
              onNavSelect={() => {}}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { paddingHorizontal: 16, paddingBottom: 40 },
    introText: { fontSize: 12.5, color: theme.textSecondary, marginTop: 14, lineHeight: 18 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: theme.cardBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: theme.border },
    chipActive: { backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary },
    chipTextActive: { fontSize: 12.5, fontWeight: '700', color: theme.accentText },
    chipDescriptor: { fontSize: 9.5, color: theme.textTertiary, marginTop: 2 },
    chipDescriptorActive: { fontSize: 9.5, color: theme.accentText, opacity: 0.85, marginTop: 2 },
    previewToggleRow: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 14 },
    toggle: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    toggleActive: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: theme.accent },
    toggleText: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary },
    toggleTextActive: { fontSize: 12.5, fontWeight: '700', color: theme.accentText },
    staticPreviewWrap: { alignItems: 'center' },
    pdfBtn: { marginTop: 14, backgroundColor: theme.accent, borderRadius: 100, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center' },
    pdfBtnText: { fontSize: 13, fontWeight: '700', color: theme.accentText },
    webPreviewFrame: { height: 640, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
    emptyText: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  });
}
